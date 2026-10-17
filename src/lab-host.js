/*!
 * Wonder Lab — the lab host: ONE module that mounts the Studio (the Scratch-based block editor, an iframe from the
 * content-hashed studio-<hex>/ folder) into a page and boots it.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 (see LICENSE).
 *
 * Two surfaces mount the same editor, and this is the only code that does it:
 *   · src/lab.js — the L4 lesson pages. The build concatenates this file into dist/lab.js, so a page already in the
 *     wild keeps working with its single <script src="…/assets/lab/lab.js"> tag and nothing else changes.
 *   · portals/teachers/index.html — the teachers' AI playground, which loads dist/lab-host.js from the lab folder.
 *
 * What it owns, and all it owns:
 *   · resolving assets/lab/manifest.json (no-cache) and the studio-<hex>/ folder it names, including the guard that
 *     the folder name is a content hash and not an arbitrary path;
 *   · creating the frame, mounting it in the container it is given, and waiting for it to be ready — load first,
 *     then WLStudio.boot() — with a timeout;
 *   · WLStudio.boot() itself, with the manifest's asset folder as the default assetBase;
 *   · the studio's event surface (change / run / undo / chat) plus its own lifecycle events;
 *   · a JSON POST helper with the HTTP-shape reading both callers used to write out by hand.
 *
 * What it deliberately does NOT own: anything a lesson page has and a playground does not — the lab GET and its
 * caps, the wrap-up, the session restore, the AI pane, the payload of an AI turn and the wording of a failure.
 * Those differ between the two callers; forcing them together would be a fiction.
 *
 *   var host = WonderLabHost.create({ base: '/files/L4/lessons/assets/lab/', container: '#pgStage' });
 *   host.on('error', function (e) { … });
 *   var r = await host.boot(lesson, { assetBase: '/lab-library/a/', library: true });   // r.studio
 *   var res = await host.send('/api/ai/lab/playground', { text: t, program: r.studio.program() });
 *
 * ES5 on purpose (see lab.js): this file ships inside lab.js, which runs on every L4 page, also on old browsers
 * that cannot run the editor itself.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;      // node (a test can require it)
  if (root) root.WonderLabHost = api;                                          // window, for both callers
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var READY_TIMEOUT = 120000;   // frame load + readiness; the lesson lab has always waited this long
  var PREFETCH_WAIT = 20000;    // at most this long for the caller's own in-flight prefetch
  var POLL = 60;                // readiness poll
  var GRACE = 2000;             // after the frame's load event, before "loaded but WLStudio is not in it"
  var NEUTRAL = {
    manifest: '找不到積木編輯器（manifest 讀不到）。',
    'no-studio': '找不到積木編輯器（manifest 沒有 studio）。',
    frame: '積木編輯器載入失敗，請重新載入這一頁。',
    ready: '積木編輯器未能就緒，請重新載入這一頁。',
    boot: '積木編輯器未能啟動，請重新載入這一頁。'
  };

  function err(code, message) { var e = new Error(message); e.code = code; return e; }
  function noop() {}
  function strip(u) { var i = String(u).indexOf('?'); return i < 0 ? String(u) : String(u).slice(0, i); }
  function join(base, path) { var b = strip(base); if (b.slice(-1) !== '/') b += '/'; return b + path; }
  // absolute, so the frame's own relative fetches (opcodes.json, its chunks) and assetBase cannot be resolved
  // against anything but the folder we were told to use. An already-absolute URL is returned unchanged.
  function absolute(u) { try { var a = document.createElement('a'); a.href = u; return a.href; } catch (e) { return u; } }
  function asElement(v) {
    if (!v) return null;
    if (typeof v === 'string') { try { return document.querySelector(v); } catch (e) { return null; } }
    return v.nodeType === 1 ? v : null;
  }
  function text(el, s) { if (el) el.textContent = s; }

  /** manifest "studio": "studio-<hex>/" (written by src/iits-lessons-build/build_wonder_lab.py) -> {dir, page}.
      One guard for both callers: a manifest must not be able to name an arbitrary path for the frame. */
  function studioDef(man) {
    var s = man && man.studio;
    if (typeof s !== 'string' || !/^studio-[0-9a-f]+\/?$/.test(s)) return null;
    if (s.slice(-1) !== '/') s += '/';
    var page = (typeof man.studio_page === 'string' && man.studio_page) ? man.studio_page : 'lab-frame.html';
    return { dir: s, page: page };
  }

  /* ---- send(): the JSON POST both callers need, and the reading of its response that both of them wrote out by
     hand (lab.js had it twice: readReply() and a copy of the same code inline). Resolves
       {status, data, ok, retry}
     where `ok` is the reply's own ok, `retry` is the "another turn of this login is in flight" 429 shape, and `data`
     is null when the body was not JSON at all - a proxy's HTML error page, which is a different thing from a JSON
     {ok:false} and the two callers report differently. It rejects only when fetch itself does (offline, aborted), so
     a caller's network-failure path stays a .catch, exactly as it was. ---- */
  function request(url, init) {
    return fetch(url, init).then(function (r) {
      return r.text().then(function (t) {
        var d = null;
        try { d = JSON.parse(t); } catch (e) { d = null; }
        if (!d || typeof d !== 'object') d = null;
        return { status: r.status, data: d, ok: !!(d && d.ok === true),
                 retry: r.status === 429 && (!d || d.retry === true) };
      });
    });
  }
  function send(url, body, sopts) {
    var s = sopts || {};
    var init = { method: s.method || 'POST', credentials: s.credentials || 'same-origin', headers: { 'Content-Type': 'application/json' } };
    if (s.cache) init.cache = s.cache;
    if (s.headers) for (var k in s.headers) if (Object.prototype.hasOwnProperty.call(s.headers, k)) init.headers[k] = s.headers[k];
    if (s.signal) init.signal = s.signal;
    if (body !== undefined && body !== null) init.body = typeof body === 'string' ? body : JSON.stringify(body);
    else if (init.method === 'GET') delete init.headers['Content-Type'];
    if (s.timeoutMs > 0 && !init.signal && typeof AbortController === 'function') {
      var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, s.timeoutMs);
      init.signal = ctl.signal;
      return request(url, init).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
    }
    return request(url, init);
  }

  function create(opts) {
    var o = opts || {};
    var container = asElement(o.container);
    if (!container) throw err('container', 'WonderLabHost: container not found: ' + o.container);
    if (typeof o.base !== 'string' || !o.base) throw err('base', 'WonderLabHost: base is required (the folder holding manifest.json)');
    var base = absolute(o.base);
    var readyTimeout = +o.readyTimeout || READY_TIMEOUT;
    var frameOpt = o.frame || {};
    var loadingText = o.loadingText || 'Wonder Lab 積木編輯器載入中…';
    var withOverlay = o.loading !== false;
    // A caller that has already read the manifest (the playground does, for the stylesheet URL and the script
    // version) hands it over here instead of making the host read it a second time.
    var given = (o.manifest && typeof o.manifest === 'object') ? o.manifest : null;

    var subs = {}, man = null, sdef = null, box = null, frame = null, mounted = null, booting = null, dead = false;

    var api = {
      base: base, mount: mount, boot: boot, on: on, off: off, send: send, destroy: destroy,
      status: status, fail: fail, overlay: null, box: null, frame: null, studio: null,
      manifest: null, studioDef: null, container: container
    };

    /* ---- the event surface: the studio's own events (change / run / undo / chat) and the host's lifecycle
       (manifest / ready / boot / booted / error / destroy). opts.onEvent, if given, sees all of them. ---- */
    function on(type, fn) {
      if (typeof fn !== 'function' || dead) return noop;
      (subs[type] = subs[type] || []).push(fn);
      return function () { off(type, fn); };
    }
    function off(type, fn) {
      var a = subs[type] || [], i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    }
    function emit(type, data) {
      if (o.onEvent) { try { o.onEvent(type, data); } catch (e) {} }
      var a = (subs[type] || []).slice();
      for (var i = 0; i < a.length; i += 1) { try { a[i](data, type); } catch (e) {} }
    }

    /* ---- the shared loading/error overlay (.wl-sload, lab.css). loading:false leaves it out: a caller that
       renders its own status in its own chrome then owns it. ---- */
    function makeBox() {
      box = document.createElement('div');
      box.className = 'wl-host';
      if (withOverlay) {
        var lo = document.createElement('div');
        lo.className = 'wl-sload';
        lo.setAttribute('role', 'status');
        lo.innerHTML = '<span class="wl-sspin" aria-hidden="true"></span><span class="wl-sloadt"></span>';
        box.appendChild(lo);
        api.overlay = lo;
        status(loadingText);
      }
      container.appendChild(box);
      api.box = box;
      return box;
    }
    function status(message) {
      var lo = api.overlay;
      if (!lo) return;
      var t = lo.querySelector('.wl-sloadt');
      if (t) text(t, message); else text(lo, message);
      lo.hidden = false;
    }
    function fail(message) {
      var lo = api.overlay;
      if (!lo) return;
      var sp = lo.querySelector('.wl-sspin');
      if (sp) sp.hidden = true;
      lo.classList.add('wl-serr');
      status(message);
    }
    function hideOverlay() { if (api.overlay) api.overlay.hidden = true; }

    /* ---- the frame ---- */
    function studioOf(fr) {
      try { return (fr && fr.contentWindow && fr.contentWindow.WLStudio) || null; } catch (e) { return null; }
    }
    function frameDoc(fr) {
      try {
        var d = (fr && fr.contentDocument) || null;
        // the placeholder document an iframe starts on: not evidence of anything
        if (d && d.location && d.location.href === 'about:blank') return null;
        return d;
      } catch (e) { return null; }
    }
    /** true = ready, false = not yet, null = this frame will never be ready (the server's own error page). */
    function readyNow(fr) {
      var W = studioOf(fr);
      if (W && typeof W.boot === 'function') return W;
      // a document with no <script> at all is an error page - a studio-<hex>/ folder this deploy does not have.
      // Fail at once (the lesson lab falls back to the read-only lab) instead of waiting the timeout out.
      var d = frameDoc(fr);
      if (d && d.querySelector && !d.querySelector('script')) return null;
      return false;
    }
    // lab-frame.html loads its scripts as plain <script> tags, so they have all run by the frame's load event;
    // GRACE only covers a browser that fires load a moment before a deferred script has finished.
    function poll(fr) {
      return new Promise(function (ok, bad) {
        var r = readyNow(fr);
        if (r === null) { bad(err('ready', 'the studio frame carries no scripts (is the studio folder deployed?)')); return; }
        if (r) { ok(r); return; }
        var t0 = Date.now();
        (function step() {
          if (dead) { bad(err('destroyed', 'destroyed')); return; }
          var w = readyNow(fr);
          if (w === null) { bad(err('ready', 'the studio frame carries no scripts (is the studio folder deployed?)')); return; }
          if (w) { ok(w); return; }
          if (Date.now() - t0 > GRACE) { bad(err('ready', 'the studio frame loaded but WLStudio is not in it')); return; }
          setTimeout(step, POLL);
        }());
      });
    }
    function loadFrame() {
      return new Promise(function (ok, bad) {
        var fr = document.createElement('iframe');
        fr.className = (frameOpt.className ? frameOpt.className + ' ' : '') + 'wl-sframe';
        if (frameOpt.id) fr.id = frameOpt.id;
        fr.title = frameOpt.title || 'Wonder Lab 積木編輯器';
        // `serial` is in the list because the controller connection runs INSIDE this frame and
        // Web Serial is a policy-gated feature: an iframe that does not allow it can still see
        // navigator.serial but is refused the port chooser, which looks exactly like "no ports".
        // It is harmless in browsers that do not know the feature - an unknown entry is ignored.
        fr.setAttribute('allow', frameOpt.allow || 'serial; microphone; autoplay');
        var attrs = frameOpt.attrs || {}, k;
        for (k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) fr.setAttribute(k, attrs[k]);
        var t = setTimeout(function () { bad(err('ready', 'studio frame timeout after ' + readyTimeout + ' ms')); }, readyTimeout);
        fr.onload = function () {
          poll(fr).then(function (W) { clearTimeout(t); ok({ frame: fr, studio: W }); },
                        function (e) { clearTimeout(t); bad(e); });
        };
        fr.onerror = function () { clearTimeout(t); bad(err('frame', 'studio frame failed to load')); };
        // the src goes on BEFORE the frame enters the page: an iframe with no src fires load for about:blank first
        fr.src = join(base, sdef.dir + sdef.page);
        box.appendChild(fr);
      });
    }

    /* ---- mount(): manifest, frame, ready ---- */
    function mount() {
      if (mounted) return mounted;
      if (dead) return Promise.reject(err('destroyed', 'WonderLabHost: destroyed'));
      makeBox();
      mounted = Promise.resolve(given ? { status: 200, data: given } : request(join(base, 'manifest.json'), { credentials: 'same-origin', cache: 'no-cache' }))
        .then(function (r) {
          if (!r.data || r.status < 200 || r.status >= 400) throw err('manifest', 'manifest.json ' + (r.status || 'unreadable'));
          man = r.data; api.manifest = man;
          sdef = studioDef(man); api.studioDef = sdef;
          emit('manifest', { manifest: man, studio: sdef, host: api });
          if (!sdef) throw err('no-studio', 'manifest has no studio/ folder');
          return o.waitFor ? Promise.race([o.waitFor, new Promise(function (ok) { setTimeout(ok, PREFETCH_WAIT); })]) : null;
        })
        .then(function () { return loadFrame(); })
        .then(function (r) {
          frame = r.frame; api.frame = frame;
          emit('ready', { frame: frame, studio: r.studio, manifest: man, host: api });
          return api;
        })
        .catch(function (e) {
          fail(NEUTRAL[e && e.code] || NEUTRAL.ready);
          e.handled = true;                       // boot() must not report the same mount failure twice
          emit('error', e);
          throw e;
        });
      return mounted;
    }

    /* ---- boot(): WLStudio.boot() with the caller's lesson ---- */
    function defaultAssetBase() { return absolute(join(base, (man && man.assets) || 'a/')); }
    function boot(lesson, bopts) {
      if (booting) return booting;
      var b = bopts || {};
      var has = function (k) { return b[k] !== undefined; };
      booting = (mounted || mount()).then(function () {
        var W = studioOf(frame);
        if (!W || typeof W.boot !== 'function') throw err('ready', 'studio frame is not ready');
        var win = null;
        try { win = frame.contentWindow; } catch (e) {}
        if (win && !win.GUI) throw err('ready', 'scratch-gui did not load in the studio frame');
        emit('boot', { host: api, lesson: lesson });
        return W.boot({
          lesson: lesson || {},
          assetBase: has('assetBase') ? b.assetBase : defaultAssetBase(),
          project: has('project') ? b.project : null,
          program: has('program') ? b.program : null,
          sids: has('sids') ? b.sids : null,
          hand: has('hand') ? b.hand : 0,
          assets: has('assets') ? b.assets : null,
          library: !!b.library,
          onEvent: function (type, data) { emit(type, data); }
        });
      }).then(function (r) {
        api.studio = studioOf(frame);
        hideOverlay();
        var out = { studio: api.studio, ms: (r && r.ms) || 0, manifest: man, frame: frame, host: api };
        emit('booted', out);
        return out;
      }).catch(function (e) {
        booting = null;
        if (!e || !e.handled) {                   // a mount failure has already said so
          fail(NEUTRAL[(e && e.code) || 'boot'] || NEUTRAL.boot);
          emit('error', e);
        }
        throw e;
      });
      return booting;
    }

    /* ---- destroy(): the frame is gone and stays gone (the lesson lab falls back to the read-only lab) ---- */
    function destroy() {
      if (dead) return;
      dead = true;
      emit('destroy', { host: api });
      if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
      if (box && box.parentNode) box.parentNode.removeChild(box);
      frame = null; box = null; api.frame = null; api.box = null; api.overlay = null; api.studio = null;
      subs = {};
    }

    return api;
  }

  return { create: create, studioDef: studioDef, send: send, request: request, errorText: NEUTRAL };
}));
