/*!
 * Wonder Lab — lesson-page integration (toggle 「課堂教材｜Wonder Lab」, lab pane, lab chat, run / stop / undo).
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 (see LICENSE).
 * Icons: Lucide (ISC licence, https://lucide.dev). Wonder Lab is not affiliated with the Scratch Foundation or MIT.
 *
 * The lesson page only needs one tag:  <script src="../assets/lab/lab.js?v=…" defer></script>
 * This file reads ./manifest.json (written by the build), injects the toggle into the AI 學伴 pane (#chat) and,
 * for lessons whose status is "ready", a lab pane next to the lesson (main.wrap). The engine is prefetched when the
 * browser is idle and started only on the first switch to Wonder Lab. In lab mode the chat form posts to
 * /api/ai/lab/<data-ep>; chat.js keeps the normal Q&A mode. Nothing here edits chat.js: lab mode intercepts the form
 * in the capture phase; lab chips have their own class (wl-chip, not chat.js's .sq) and stop their clicks, so chat.js never
 * sends them as a question and never disables them when the Q&A is capped.
 * ES5 on purpose: this file runs on every L4 page, also on old browsers that cannot run the lab itself.
 *
 * Dual mode (2026-10-07 evening, WONDER_LAB_DUAL_MODE_SPEC.md): when the build has the full editor (manifest "studio",
 * WONDERLAB_STUDIO=1), the lab GET says studio:true and the screen is at least 1024 px wide when the lab first opens, the
 * left area is the full editor (the Studio, an iframe from the content-hashed studio-<hex>/ folder) instead of the read-only
 * lab; the AI 學伴 stays on the right (a drawer below 1280 px). Two modes in the pane: 「AI 幫我砌」 (the AI builds, the
 * editor is locked while it edits) and 「我自己砌」 (the AI is a 助教 and never edits). Everything else (caps, class time,
 * 429, the wrap-up poll, history, reload restore) is the same code. Otherwise the read-only lab, exactly as before.
 */
(function () {
  'use strict';
  var chat = document.getElementById('chat');
  if (!chat || !/(^|\/)L4\/lessons\//.test(chat.getAttribute('data-ep') || '')) return;
  var ep = chat.getAttribute('data-ep'), slug = ep.split('/').pop();
  var me = document.currentScript && document.currentScript.src;
  var BASE = me ? me.slice(0, me.lastIndexOf('/') + 1).replace(/\?.*$/, '') : new URL('../assets/lab/', location.href).href;
  // the Q&A box as the page was built (chat.js changes the placeholder later, e.g. to a caps message)
  var input0 = document.getElementById('chin'), send0 = document.getElementById('chsend');
  var MAT_PH = (input0 && input0.getAttribute('placeholder')) || '輸入你的問題…', SEND_LABEL = send0 ? send0.textContent : '問';
  var LAB_PH = '說說你的想法：你想角色怎樣做？', LAB_HEAD = '照你的想法砌積木，一起試、一起看';
  var OLD = '這部裝置的瀏覽器太舊，請更新系統或改用其他裝置';
  var NET = '連線不穩，按一下再試';
  var BIG = '程式太大了。可以按「上一步」，或者請 AI 刪去一段不用的程式。';
  var SLOW = 'AI 學伴想得太久了，請再送出一次。';
  var DOWN = 'AI 學伴暫時連不上，請稍後再試。';
  var EXPORT = '匯出 .sb3 coming soon：與 UCMake 的檔案格式相容性仍待官方格式規範。';

  // Lucide icons (ISC, lucide-static 1.52.0): single colour, inherit currentColor
  var ICO = {
    "flask": "<path d=\"M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2\"/> <path d=\"M6.453 15h11.094\"/> <path d=\"M8.5 2h7\"/>",
    "book": "<path d=\"M12 5v16\"/> <path d=\"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z\"/>",
    "play": "<path d=\"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z\"/>",
    "stop": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/>",
    "undo": "<path d=\"M9 14 4 9l5-5\"/> <path d=\"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11\"/>",
    "download": "<path d=\"M12 15V3\"/> <path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/> <path d=\"m7 10 5 5 5-5\"/>",
    "up": "<path d=\"m5 12 7-7 7 7\"/> <path d=\"M12 19V5\"/>",
    "down": "<path d=\"M12 5v14\"/> <path d=\"m19 12-7 7-7-7\"/>",
    "left": "<path d=\"m12 19-7-7 7-7\"/> <path d=\"M19 12H5\"/>",
    "right": "<path d=\"M5 12h14\"/> <path d=\"m12 5 7 7-7 7\"/>",
    "space": "<path d=\"M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1\"/>",
    "plug": "<path d=\"M12 22v-5\"/> <path d=\"M15 8V2\"/> <path d=\"M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z\"/> <path d=\"M9 8V2\"/>",
    "bulb": "<path d=\"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5\"/> <path d=\"M9 18h6\"/> <path d=\"M10 22h4\"/>"
  };
  function ic(n) {
    return '<svg class="wl-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + ICO[n] + '</svg>';
  }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function mq(q) { return !!(window.matchMedia && window.matchMedia(q).matches); }
  function narrow() { return mq('(max-width:1099px)'); }
  // held sideways under 1100 px (tablets from 900 px wide, phones): the AI 學伴 is a right pane (lab.css, same queries)
  function side() { return mq('(max-width:1099px) and (orientation:landscape) and (min-width:900px), (max-width:1099px) and (orientation:landscape) and (max-height:500px)'); }
  function noop() {}
  // the pointer of this device, sent with every lab turn: the AI then says 「手指」 on a touch screen and 「滑鼠」 elsewhere
  function device() { return mq('(pointer:coarse)') ? 'touch' : 'mouse'; }
  function idle(fn) { if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 4000 }); else setTimeout(fn, 1500); }

  // Wonder Lab needs a 2022+ browser (WebGL for the stage, ResizeObserver, ES2022 in the engine). Checked once.
  var okBrowser = null;
  function supported() {
    if (okBrowser !== null) return okBrowser;
    okBrowser = false;
    try {
      if (typeof [].findLast !== 'function' || typeof window.ResizeObserver !== 'function' || typeof window.Promise !== 'function') return false;
      var c = document.createElement('canvas'), gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return false;
      var lose = gl.getExtension && gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      okBrowser = true;
    } catch (e) { okBrowser = false; }
    return okBrowser;
  }

  fetch(BASE + 'manifest.json', { cache: 'no-cache', credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
    .then(init).catch(function (e) { if (window.console) console.warn('Wonder Lab unavailable:', e); });

  function init(man) {
    var info = (man.lessons || {})[slug] || { status: 'soon' }, ready = info.status === 'ready';

    // ---- the toggle (always shown on L4 pages) + a status line under it ----
    // the toggle stays invisible (it keeps its room) until lab.css has loaded, or 3 s at most: no unstyled flash
    var head = chat.querySelector('.chhead');
    var bar = el('div', 'wl-mode'); bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', '模式');
    bar.style.visibility = 'hidden';
    var css = el('link'), shown = false, onShown = [];
    function reveal() { if (!shown) { shown = true; bar.style.visibility = ''; onShown.splice(0).forEach(function (f) { f(); }); } }
    function whenShown(f) { if (shown) f(); else onShown.push(f); }       // the toggle turns usable only once it is visible
    css.rel = 'stylesheet'; css.onload = css.onerror = reveal; css.href = BASE + man.css; document.head.appendChild(css);
    setTimeout(reveal, 3000);
    var bMat = el('button', 'on', ic('book') + '<span>課堂教材</span>');
    var bLab = el('button', '', ic('flask') + '<span>Wonder Lab</span>' + (ready ? '' : '<small>coming soon</small>'));
    [bMat, bLab].forEach(function (b, i) { b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', i === 0 ? 'true' : 'false'); bar.appendChild(b); });
    // ARIA tabs, manual activation: Tab reaches the selected tab only (roving tabindex); Left / Right / Home / End move
    // the focus between the two; Enter or Space switches (switching to Wonder Lab loads the engine, so never on focus)
    function rove() { [bMat, bLab].forEach(function (b) { b.tabIndex = b.getAttribute('aria-selected') === 'true' ? 0 : -1; }); }
    rove();
    bar.addEventListener('keydown', function (e) {
      var list = [bMat, bLab].filter(function (b) { return !b.disabled; }), i = list.indexOf(document.activeElement), k = e.key;
      if (i < 0 || e.altKey || e.ctrlKey || e.metaKey || !/^(ArrowLeft|ArrowRight|Home|End)$/.test(k)) return;
      e.preventDefault();
      var j = k === 'Home' ? 0 : k === 'End' ? list.length - 1 : (i + (k === 'ArrowLeft' ? -1 : 1) + list.length) % list.length;
      list[j].focus();
    });
    var note = el('p', 'wl-note'); note.setAttribute('role', 'status'); note.hidden = true;
    if (head && head.parentNode) head.parentNode.insertBefore(bar, head.nextSibling); else chat.insertBefore(bar, chat.firstChild);
    bar.parentNode.insertBefore(note, bar.nextSibling);
    var noteT = null;
    function tell(msg) {          // clear first, so a screen reader announces the same message again on a second tap
      clearTimeout(noteT); note.textContent = ''; note.hidden = false;
      noteT = setTimeout(function () { note.textContent = msg; }, 30);
    }
    function hush() { clearTimeout(noteT); note.hidden = true; note.textContent = ''; }
    var setupDone = false;
    // not available here: looks disabled (aria-disabled, so a tap still explains why) and never loads the engine
    function soon(hw) {
      var msg = hw ? '這一課要用 UC-Mind 主控板，Wonder Lab 版本 coming soon，請用課堂教材。' : 'Wonder Lab 版本 coming soon。';
      bLab.disabled = false; bLab.setAttribute('aria-disabled', 'true'); bLab.classList.add('soon'); bLab.title = msg;
      if (!bLab.querySelector('small')) bLab.insertAdjacentHTML('beforeend', '<small>coming soon</small>');
      bLab.onclick = function () { tell(msg); };
    }
    bMat.onclick = function () { hush(); };
    if (!ready) { soon(info.status === 'hw'); return; }

    // The server decides whether the lab is open for this login (config lab_realms, e.g. teachers only before go-live);
    // the same call returns this student's last program for the lesson. Only 401/403/404 mean "not here": a network
    // error or a 5xx (service restarting, Wi-Fi blip) keeps the toggle usable and tries again.
    var probing = false, tries = 0, retryT = null, wantLab = false, prefetched = false, pre = {};
    bLab.disabled = true;
    bLab.onclick = function () {                       // used until setup() replaces it
      if (!supported()) { tell(OLD); return; }
      wantLab = true; tell('正在連線 Wonder Lab…');
      if (!probing) probe();
    };
    function probe() {
      clearTimeout(retryT); probing = true;
      fetch('/api/ai/lab/' + ep, { credentials: 'same-origin' })
        .then(function (r) {
          if (r.status === 401 || r.status === 403 || r.status === 404) return { soon: true };
          if (!r.ok) throw new Error('lab ' + r.status);
          return r.json();
        })
        .then(function (d) {
          probing = false;
          if (d && d.ok) whenShown(function () {
            bLab.disabled = false; bLab.title = '';
            setup(d);                                  // enters lab mode at once if the student asked for it
            idle(prefetch);
          });
          else if (d && d.soon) { if (wantLab) hush(); wantLab = false; soon(false); }
          else throw new Error('lab reply');
        })
        .catch(function () {
          probing = false; whenShown(function () { bLab.disabled = false; }); bLab.title = NET;
          if (wantLab) { wantLab = false; tell(NET); }
          if (++tries <= 6) retryT = setTimeout(probe, Math.min(30000, 3000 * tries));
        });
    }
    probe();

    // download the engine into the HTTP cache while the student reads the lesson (one file at a time); boot() waits
    // for a file that is still downloading instead of fetching it twice
    function prefetch() {
      if (prefetched || !supported()) return; prefetched = true;
      var c = navigator.connection; if (c && c.saveData) return;
      if (studioWanted()) {                    // the full editor will open here: its bundle, not the read-only engine
        var sd = BASE + SDEF.dir;
        ['scratch-gui-standalone.js', 'studio-lab.js', 'studio-ops.js'].reduce(function (p, f) {
          return p.then(function () {
            if (sbooting || ST) return;
            spre = fetch(sd + f, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(noop, noop);
            return spre;
          });
        }, Promise.resolve());
        return;
      }
      var eng = BASE + man.engine;
      (man.scripts || []).reduce(function (p, f) {
        return p.then(function () {
          if (booting || wl) return;
          pre[f] = fetch(eng + f, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(noop, noop);
          return pre[f];
        });
      }, Promise.resolve());
    }

    var wl = null, booting = null;
    // ---- the full editor (dual mode): only with the Studio in the build, studio:true from the lab GET and >= 1024 px ----
    // manifest "studio": "studio-<hex>/" (the content-hashed folder of the editor; its page is lab-frame.html)
    var SDEF = typeof man.studio === 'string' && /^studio-[0-9a-f]+\/$/.test(man.studio) ? { dir: man.studio, page: man.studio_page || 'lab-frame.html' } : null, lastGet = null;
    var ST = null, sbooting = null, studio = null;           // studio: decided when the lab first opens (true = editor)
    var spre = null;                                          // the editor file being prefetched (the frame waits for it: no second download)
    function studioWanted() {
      return !!(SDEF && lastGet && lastGet.studio === true && (window.innerWidth || document.documentElement.clientWidth || 0) >= 1024 && supported());
    }
    function setup(last) {
    if (setupDone) return; setupDone = true;
    lastGet = last || null;

    // ---- the lab pane (left, replaces the lesson while in lab mode) ----
    var main = document.querySelector('.layout > main.wrap') || document.querySelector('main.wrap');
    var lab = el('section', 'wl-lab'); lab.id = 'wllab'; lab.hidden = true; lab.setAttribute('aria-label', 'Wonder Lab');
    var NS = (man.scripts || []).length || 5;
    lab.innerHTML =
      '<div class="wl-bar">' +
        '<button type="button" class="wl-go" id="wlrun">' + ic('play') + '<span>執行</span></button>' +
        '<button type="button" class="wl-ionly" id="wlstop" aria-label="停止" title="停止">' + ic('stop') + '<span>停止</span></button>' +
        '<button type="button" class="wl-ionly" id="wlundo" disabled aria-label="上一步" title="回到 AI 上一次改動之前的程式">' + ic('undo') + '<span>上一步</span></button>' +
        '<span class="wl-sp"></span>' +
        '<button type="button" class="wl-soon" id="wlexport" aria-disabled="true" title="' + EXPORT + '">' + ic('download') +
          '<span>Export sb3</span><small class="wl-cs">coming soon</small><small class="wl-why">（待官方格式規範）</small></button>' +
        '<p class="wl-barnote" id="wlbarnote" hidden></p>' +
      '</div>' +
      '<div class="wl-body">' +
        '<div class="wl-stagecol">' +
          '<div class="wl-stage" id="wlstage"><div class="wl-mons" id="wlmons"></div>' +
            '<form class="wl-ask" id="wlask" hidden><p class="wl-askq"></p><input maxlength="40" autocomplete="off" aria-label="回答"><button type="submit">確定</button></form>' +
            '<div class="wl-loading" id="wlload">Wonder Lab 載入中… 0/' + NS + '</div></div>' +
          '<div class="wl-pad" id="wlpad" aria-label="方向鍵" hidden>' +
            '<button type="button" data-k="ArrowUp" aria-label="上">' + ic('up') + '</button>' +
            '<button type="button" data-k="ArrowLeft" aria-label="左">' + ic('left') + '</button>' +
            '<button type="button" data-k=" " aria-label="空白鍵">' + ic('space') + '</button>' +
            '<button type="button" data-k="ArrowRight" aria-label="右">' + ic('right') + '</button>' +
            '<button type="button" data-k="ArrowDown" aria-label="下">' + ic('down') + '</button></div>' +
          '<p class="wl-hint" hidden>用鍵盤的方向鍵前，先點一下舞台。</p>' +
        '</div>' +
        '<div class="wl-codecol"><div class="wl-tabs" id="wltabs"></div>' +
          '<div class="wl-bwrap"><div class="wl-blocks" id="wlblocks"></div>' +
          '<div class="wl-empty" id="wlempty"></div></div></div>' +
      '</div>' +
      '<p class="wl-foot">Wonder Lab · <a href="' + BASE + (man.source || 'SOURCE.html') + '" target="_blank" rel="noopener">開源授權／原始碼</a></p>';
    if (main && main.parentNode) main.parentNode.insertBefore(lab, main.nextSibling); else document.body.appendChild(lab);

    // ---- lab chat body (separate history from the normal Q&A) ----
    var chbody = document.getElementById('chbody'), form = document.getElementById('chform'),
        input = document.getElementById('chin'), send = document.getElementById('chsend'), fab = document.getElementById('chfab');
    var body = el('div', 'chbody wl-chbody'); body.id = 'wlbody'; body.hidden = true; body.setAttribute('aria-live', 'polite');
    if (chbody && chbody.parentNode) chbody.parentNode.insertBefore(body, chbody.nextSibling); else chat.appendChild(body);
    var headSmall = head && head.querySelector('small'), headText = headSmall ? headSmall.textContent : '';
    // turns left (the binding cap), shown in the narrow lab drawer where the cap rows are hidden
    var capsBox = document.getElementById('chcaps'), leftEl = el('div', 'wl-left'); leftEl.hidden = true;
    if (capsBox) capsBox.appendChild(leftEl);

    // ---- wrap-up (整合鞏固, 2026-10-07): the teacher starts it from the portal; a marker while it runs ----
    if (!document.getElementById('wl-consol-css')) {
      var cst = el('style'); cst.id = 'wl-consol-css';
      cst.textContent = '.wl-cmark{display:flex;align-items:center;gap:8px;margin:0;padding:5px 12px;font-size:12.5px;line-height:1.4;color:#5b3fa8;' +
        'background:#f6f1ff;border-bottom:1px solid #ece4f8}.wl-cmark b{display:inline-flex;align-items:center;gap:4px;background:#6a3fc0;color:#fff;' +
        'border-radius:999px;padding:1px 9px;font-size:12px}.wl-cmark[hidden],body:not(.wl-labmode) .wl-cmark{display:none}' +
        '.msg.wl-cs{border-left:3px solid #6a3fc0}';
      document.head.appendChild(cst);
    }
    var cmark = el('p', 'wl-cmark', '<b>' + ic('bulb') + '<span>整合</span></b><span>AI 學伴想聽你講講自己的做法</span>');
    cmark.hidden = true; cmark.setAttribute('role', 'status');
    note.parentNode.insertBefore(cmark, note.nextSibling);
    var CONSOL_ON = { pending: 1, step1: 1, step2: 1 }, consolState = 'off', consolT = null, consolBusy = false, consolWait = 0;
    function showConsol(c) {
      if (!c || typeof c.state !== 'string') return;
      consolState = c.state; cmark.hidden = !CONSOL_ON[c.state];
    }

    var KEY = 'iits-lab:' + ep, MODEKEY = 'iits-mode:' + location.pathname;
    var st = { hist: [], program: null, prev: null, note: null, sig: null, ran: false, report: null, studio: null, sprev: null, seen: null };
    try { var s0 = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (s0 && typeof s0 === 'object') st = Object.assign(st, s0); } catch (e) {}
    if (!Array.isArray(st.hist)) st.hist = [];

    var labmode = false, busy = false, capsReason = '', closedReason = '', pendingSend = false, pollT = null;
    // since the last turn: objective signals for learning analysis (kept across a reload)
    var sig = (st.sig && typeof st.sig === 'object') ? { runs: +st.sig.runs || 0, stops: +st.sig.stops || 0, undo: +st.sig.undo || 0 } : { runs: 0, stops: 0, undo: 0 };
    var ranSinceTurn = !!st.ran;
    function save() {
      if (studio && ST) return saveStudio();
      try {
        if (wl && ranSinceTurn && wl.trace) st.report = wl.report();
        sessionStorage.setItem(KEY, JSON.stringify({ hist: st.hist.slice(-16), program: wl ? wl.program : st.program, prev: st.prev, note: st.note,
          sig: sig, ran: ranSinceTurn, report: ranSinceTurn ? (st.report || null) : null,
          studio: wl ? null : st.studio, sprev: wl ? null : st.sprev, seen: st.seen }));      // the read-only lab owns the program now
      } catch (e) {}
    }
    // the full editor: the whole project (painted costumes too, within a cap) + script ids, so a reload shows exactly this
    function saveStudio() {
      try {
        var s = ST.state(1200000);
        st.studio = { project: s.project, sids: s.sids, hand: s.hand, assets: s.assets };
        st.program = ST.program();
        if (ST.ran()) { st.ran = true; st.report = ST.report(); }
      } catch (e) {}
      var base = { hist: st.hist.slice(-16), program: st.program, prev: st.prev, note: st.note, sig: curSig(), ran: !!st.ran,
        report: st.ran ? (st.report || null) : null, seen: st.seen };
      var tries = [
        { studio: st.studio, sprev: st.sprev },
        { studio: st.studio, sprev: st.sprev && { project: st.sprev.project, sids: st.sprev.sids, hand: st.sprev.hand, assets: {} } },
        { studio: st.studio && { project: st.studio.project, sids: st.studio.sids, hand: st.studio.hand, assets: {} }, sprev: null },
        { studio: null, sprev: null }];
      for (var i = 0; i < tries.length; i++) {
        try { sessionStorage.setItem(KEY, JSON.stringify(Object.assign({}, base, tries[i]))); return; } catch (e) {}
      }
    }
    window.addEventListener('pagehide', function () { save(); });
    function add(cls, text) { var d = el('div', 'msg ' + cls); d.textContent = text; body.appendChild(d); body.scrollTop = body.scrollHeight; return d; }
    st.hist.forEach(function (m) { if (m && typeof m.content === 'string') add(m.role === 'user' ? 'me' : 'bot', m.content); });
    // a chip in the lab conversation: its own class (wl-chip, styled like the Q&A chips). chat.js only handles and only
    // disables .sq buttons, so a lab chip is never sent as a question and still works while the Q&A is capped.
    function chip(text, cls, fn) {
      var c = el('div', 'sqs' + (cls ? ' ' + cls : '')), b = el('button', 'wl-chip');
      b.type = 'button'; b.textContent = text; c.appendChild(b); body.appendChild(c); body.scrollTop = body.scrollHeight;
      b.onclick = function (e) { e.stopPropagation(); c.remove(); fn(); };
      return c;
    }

    var $ = function (id) { return document.getElementById(id); };
    var undoBtn = $('wlundo');
    undoBtn.disabled = !st.prev;
    function hasScripts(p) {
      if (!p) return false;
      var n = 0; Object.keys(p.sprites || {}).forEach(function (k) { n += Object.keys((p.sprites[k] || {}).scripts || {}).length; });
      return n + Object.keys((p.stage || {}).scripts || {}).length > 0;
    }
    // no blocks yet: say where the AI 學伴 is on this screen (the right pane, or the 問 AI 學伴 button on a phone or a
    // tablet held upright); the zoom buttons hide while there is nothing to zoom (lab.css .wl-noblocks)
    function emptyText() {
      return '還沒有積木。' + (narrow() && !side() ? '按右下角「問 AI 學伴」，說說你的想法' : '在右邊說說你的想法') + '，AI 會照你說的砌出來。';
    }
    function showEmpty() {
      var e = $('wlempty'), none = !hasScripts(wl ? wl.program : st.program);
      e.hidden = !none; lab.classList.toggle('wl-noblocks', none);
      if (none && e.textContent !== emptyText()) e.textContent = emptyText();
    }
    showEmpty();
    // a phone or a tablet held upright, or held sideways with the AI 學伴 pane closed: the zoom buttons go to the top
    // right of the blocks area, with the reset button beside zoom-in (two rows, not three), so the floating 問 AI 學伴
    // button (bottom right of the screen) does not cover them while the page scrolls. CSS translate adds to Blockly's own
    // placement; elsewhere (a laptop, or the right pane open) Blockly's place is kept.
    function placeZoom() {
      // the zoom-in, zoom-out and reset buttons (.blocklyZoom) share one parent group, which Blockly places
      var zb = lab.querySelector('#wlblocks .blocklyZoom'), z = zb && zb.parentNode, bl = $('wlblocks');
      if (!z || !bl || !z.getBoundingClientRect || /blocklyWorkspace|blocklySvg/.test(z.getAttribute('class') || '')) return;
      var zi = z.querySelector('.blocklyZoomIn'), rs = z.querySelector('.blocklyZoomReset');
      try {
        z.style.translate = ''; if (rs) rs.style.translate = '';
        if (!labmode || !narrow() || (side() && chat.classList.contains('open'))) return;
        var zr = z.getBoundingClientRect(), br = bl.getBoundingClientRect();
        if (!zr.height || !br.height) return;
        if (zi && rs) {
          var a = zi.getBoundingClientRect(), r = rs.getBoundingClientRect();
          if (a.height && r.height) rs.style.translate = Math.round(a.left - 8 - r.right) + 'px ' + Math.round(a.top - r.top) + 'px';
        }
        var dy = Math.round(br.top + 12 - zr.top);
        if (dy < 0) z.style.translate = '0 ' + dy + 'px';
      } catch (e) {}
    }
    // the arrow pad and the keyboard hint: only for a lesson played with keys (lesson json "keys") or a program that reads keys
    var lessonKeys = false;
    function usesKeys(p) { try { return /"(event_whenkeypressed|sensing_keypressed)"/.test(JSON.stringify(p || {})); } catch (e) { return false; } }
    function showPad() {
      var on = lessonKeys || usesKeys(wl ? wl.program : st.program), pad = $('wlpad'), hint = lab.querySelector('.wl-hint');
      if (pad.hidden === !on) return;
      pad.hidden = hint.hidden = !on;
      if (labmode) sizeDrawer();
    }
    function afterChange() { save(); showEmpty(); showPad(); placeZoom(); }
    // a status line under the toolbar (the chat pane's note says the same where the pane is on screen)
    var barNote = $('wlbarnote'), barT = null;
    function explain(msg) {
      tell(msg);
      var pane = getComputedStyle(chat).display !== 'none';
      barNote.setAttribute('role', 'status');
      if (pane) barNote.setAttribute('aria-hidden', 'true'); else barNote.removeAttribute('aria-hidden');
      barNote.textContent = msg; barNote.hidden = false;
      clearTimeout(barT);
      barT = setTimeout(function () { barNote.hidden = true; if (note.textContent === msg) hush(); }, 10000);
    }
    function unexplain() { clearTimeout(barT); barNote.hidden = true; }
    $('wlexport').onclick = function (ev) { explain(EXPORT); if (ev && ev.detail) this.blur(); };

    function script(src) { return new Promise(function (ok, bad) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { bad(new Error('load ' + src)); }; document.head.appendChild(s); }); }
    function getJSON(u) { return fetch(u, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }); }
    function boot() { return studio ? bootStudio() : bootRO(); }
    function bootRO() {
      if (booting) return booting;
      var eng = BASE + man.engine, t0 = Date.now(), n = 0, load = $('wlload');
      load.hidden = false; load.textContent = 'Wonder Lab 載入中… 0/' + NS;
      booting = man.scripts.reduce(function (p, f) {
        return p.then(function () { return pre[f] || null; })
          .then(function () { return script(eng + f); })
          .then(function () { n += 1; load.textContent = 'Wonder Lab 載入中… ' + n + '/' + NS; });
      }, Promise.resolve())
        .then(function () { return Promise.all([getJSON(eng + 'opcodes.json'), getJSON(BASE + info.data)]); })
        .then(function (r) {
          wl = window.WL = new window.WonderLab({ spec: r[0], lesson: r[1], assetBase: new URL(man.assets || 'a/', BASE).href, mediaBase: eng + 'media/',
            el: { stage: $('wlstage'), blocks: $('wlblocks'), tabs: $('wltabs'), monitors: $('wlmons'), ask: $('wlask') } });
          wl.boot();
          lessonKeys = !!r[1].keys;
          // the blocks area changes size without a window resize (the right pane opens or closes, the pad shows)
          if (window.ResizeObserver) new window.ResizeObserver(function () {
            var B = window.ScratchBlocks || window.Blockly; try { B.svgResize(wl.ws); } catch (e) {}
            placeZoom();
          }).observe($('wlblocks'));
          return wl.load(st.program || window.WonderLab.empty()).then(function () {
            load.hidden = true; window.WL_BOOT_MS = Date.now() - t0;
            showEmpty(); showPad(); placeZoom();
            if (!st.hist.length) { add('bot', r[1].opening || '你想舞台上發生甚麼事？用你自己的說話講，我會照你說的砌積木。'); offerRestore(); }
          });
        })
        .catch(function (e) { load.textContent = 'Wonder Lab 載入失敗，請重新整理頁面。'; booting = null; throw e; });
      return booting;
    }

    // a program kept on the server (another tab / device): offer it, never load it silently
    function offerRestore() {
      Promise.resolve(last).then(function (d) {
        if (!d || !d.ok || !d.program || !hasScripts(d.program)) return;
        chip('載入你上次在這一課的程式' + (d.when ? '（' + d.when + '）' : ''), '', function () {
          if (studio && ST) {
            st.sprev = ST.state(600000); ST.setTools({ undo: true });
            ST.loadProgram(d.program).then(function () { st.seen = ST.program(); save(); });
            add('sys', '已載入上次的程式。按「上一步」可以回到空白。');
            return;
          }
          st.prev = wl.program; undoBtn.disabled = false;
          wl.applyTurn({ program: d.program, ops: [] }).then(afterChange);
          add('sys', '已載入上次的程式。按「上一步」可以回到空白。');
        });
      }).catch(noop);
    }

    // ---- narrow screens: the chat is a drawer that ends just below the stage (held sideways: a right pane) ----
    function wlTop() { return parseFloat(document.body.style.getPropertyValue('--wl-top')) || 0; }
    function sizeDrawer() {
      var s = $('wlstage'); if (!s) return;
      s.style.maxWidth = '';
      // the lesson bar sticks to the top: the lab toolbar and the right pane start under it
      var lb = document.querySelector('.lessonbar'), top = 0;
      if (lb && narrow() && getComputedStyle(lb).display !== 'none') top = Math.round(lb.getBoundingClientRect().height);
      document.body.style.setProperty('--wl-top', top + 'px');
      if (!labmode || !narrow() || side()) return;
      var r = s.getBoundingClientRect(); if (!r.height) return;
      var room = window.innerHeight - r.bottom - 6;
      if (room < 300) {          // a short phone: a slightly smaller stage, so the drawer keeps a few lines of conversation
        var h = Math.max(150, window.innerHeight - r.top - 300 - 6);
        if (h < r.height) { s.style.maxWidth = Math.round(h * 4 / 3) + 'px'; r = s.getBoundingClientRect(); room = window.innerHeight - r.bottom - 6; }
      }
      chat.style.setProperty('--wl-dh', Math.max(240, Math.round(room)) + 'px');
    }
    window.addEventListener('resize', function () { if (labmode) { if (studio) { sizeStudio(); return; } sizeDrawer(); showEmpty(); placeZoom(); } });
    if (fab) fab.addEventListener('click', function () { if (labmode && !studio) setTimeout(sizeDrawer, 0); });
    // the AI 學伴 pane opens or closes (held sideways the 問 AI 學伴 button then shows or hides): place the zoom buttons again
    if (window.MutationObserver) new MutationObserver(function () { if (labmode && !studio) setTimeout(placeZoom, 0); })
      .observe(chat, { attributes: true, attributeFilter: ['class'] });
    function openPane() { chat.classList.add('open'); document.body.classList.add('chatopen'); parentFull(true); }
    function closePane() { chat.classList.remove('open'); document.body.classList.remove('chatopen'); }
    // scroll the page so that an element starts just under the sticky toolbar (narrow screens only)
    function underBar(elm, onlyIfHidden) {
      if (!narrow() || !elm) return;
      try {
        var b = lab.querySelector('.wl-bar').getBoundingClientRect(), r = elm.getBoundingClientRect(), top = wlTop() + b.height + 6;
        if (onlyIfHidden && r.top >= top - 1 && r.bottom <= window.innerHeight + 1) return;
        window.scrollBy(0, Math.round(r.top - top));
      } catch (e) {}
    }
    var lookEl = null;
    // after a change on a narrow screen: one tap shows the changed script. The drawer closes for it; the right pane stays,
    // and there the chip is only offered when the blocks are below the screen (a phone held sideways).
    function lookChip() {
      if (lookEl && lookEl.parentNode) lookEl.remove();
      if (side() && $('wlblocks').getBoundingClientRect().top < window.innerHeight - 100) return;
      lookEl = chip('看看積木', 'wl-look', function () {
        lookEl = null;
        if (!side()) closePane();
        setTimeout(function () { underBar(lab.querySelector('.wl-codecol')); if (wl && wl.showNew) wl.showNew(); }, 30);
      });
    }

    // ---- mode switch ----
    function parentFull(on) { try { if (window.parent !== window) window.parent.document.documentElement.classList.toggle('chatfull', on); } catch (e) {} }
    function setMode(on) {
      if (on && !supported()) { tell(OLD); return; }
      if (on && studio === null) studio = studioWanted();    // decided once: the full editor, or the read-only lab
      labmode = on; hush();
      document.body.classList.toggle('wl-labmode', on);
      var sOn = on && !!studio;
      document.body.classList.toggle('wl-studiomode', sOn); document.documentElement.classList.toggle('wl-studio-on', sOn);
      document.body.classList.toggle('wl-selfmode', sOn && smode === 'self');
      bMat.classList.toggle('on', !on); bLab.classList.toggle('on', on);
      bMat.setAttribute('aria-selected', on ? 'false' : 'true'); bLab.setAttribute('aria-selected', on ? 'true' : 'false'); rove();
      lab.hidden = !on || !!studio; body.hidden = !on; if (chbody) chbody.hidden = on;
      if (studio) { var sb = studioBox(); sb.hidden = false; park(!on); smodeBar.hidden = smodeHint.hidden = sacts.hidden = !on; }
      if (headSmall) headSmall.textContent = on ? (studio && smode === 'self' ? SELF_HEAD : LAB_HEAD) : headText;
      if (send) send.textContent = on ? '送出' : SEND_LABEL;
      if (input && send) {
        if (on) lockLab(busy);
        else { input.placeholder = capsReason || MAT_PH; input.disabled = send.disabled = !!capsReason; }
      }
      try { sessionStorage.setItem(MODEKEY, on ? 'lab' : 'mat'); } catch (e) {}
      if (narrow()) parentFull(on || chat.classList.contains('open'));
      if (on && studio) {
        sizeStudio(); setTimeout(sizeStudio, 0);
        checkCaps();
        if (drawerMode() && !st.hist.length && !chat.classList.contains('open')) sOpen();     // first visit: the pane shows the opening
        bootStudio().then(function (x) {
          if (!x || !labmode || !studio) return;
          sizeStudio(); setSMode(smode, true);
          if (consolState === 'pending') sendConsol();             // started before the page was opened
        }).catch(noop);
        clearTimeout(consolT); consolT = setTimeout(consolPoll, CONSOL_POLL);
        return;
      }
      if (on) {
        if (narrow()) { try { window.scrollTo(0, 0); } catch (e) {} }
        if (side() && !chat.classList.contains('open')) openPane();      // held sideways: the AI 學伴 is the right pane
        sizeDrawer();
        checkCaps();
        boot().then(function () {
          wl.active = labmode; wl.resize(); var B = window.ScratchBlocks || window.Blockly; try { B.svgResize(wl.ws); } catch (e) {}
          sizeDrawer(); showEmpty(); placeZoom();
          if (consolState === 'pending') sendConsol();             // started before the page was opened
        }).catch(noop);
        clearTimeout(consolT); consolT = setTimeout(consolPoll, CONSOL_POLL);
      } else {
        clearTimeout(pollT); clearTimeout(consolT); clearTimeout(consolRT); consolT = consolRT = null; consolSeen = false; unexplain();
        if (wl) { wl.active = false; wl.stop(); }
        if (ST) { releaseLock(); ST.stop(); }
      }
    }
    bMat.onclick = function () { hush(); if (labmode) setMode(false); };
    bLab.onclick = function () { setMode(true); };
    // the chat sheet's close button (narrow screens) must not drop the full-screen frame while the lab is open
    var closeBtn = chat.querySelector('.chclose');
    if (closeBtn) closeBtn.addEventListener('click', function () { if (labmode && narrow()) setTimeout(function () { parentFull(true); }, 0); });

    // ---- caps: the lab goes through the same /status gate as the chat (class time lifts the caps) ----
    var CAPROWS = [['lesson_hour_left', '本課每小時'], ['lesson_day_left', '本課每天'], ['student_day_left', '今天全部課']];
    function showLeft(s) {
      var b = null;
      if (s && s.ok && !s.in_class) CAPROWS.forEach(function (r) { var v = s[r[0]]; if (typeof v === 'number' && (!b || v < b[0])) b = [v, r[1]]; });
      leftEl.hidden = !b;
      if (b) { leftEl.textContent = 'Wonder Lab 剩 ' + Math.max(0, b[0]) + ' 次（' + b[1] + '）'; leftEl.className = 'wl-left' + (b[0] > 0 ? '' : ' out'); }
    }
    function poll() { clearTimeout(pollT); pollT = null; if (labmode && capsReason) pollT = setTimeout(checkCaps, 30000); }
    function checkCaps() {
      return getJSON('/api/ai/status/' + ep).then(function (s) {
        capsReason = (s && s.ok && s.reason) || '';
        showLeft(s);
        if (!busy) lockLab(false);
        poll();
        return s;
      }).catch(function () { if (!busy) lockLab(false); poll(); });
    }
    function refreshCaps() { try { document.dispatchEvent(new CustomEvent('iits:caps')); } catch (e) {} return checkCaps(); }
    function lockLab(on, why) {
      if (!input || !send || !labmode) return;
      var stop = capsReason || closedReason;
      input.disabled = send.disabled = !!on || !!stop;
      input.placeholder = (on && why) || stop || phNow();
      taBtn.disabled = input.disabled;
    }
    // chat.js repaints the box for the Q&A (e.g. 「輸入你的問題…」 when a class starts): put the lab wording back
    if (input && window.MutationObserver) new MutationObserver(function () {
      if (labmode && !busy && !capsReason && !closedReason && !input.disabled && input.placeholder !== phNow()) input.placeholder = phNow();
    }).observe(input, { attributes: true, attributeFilter: ['placeholder', 'disabled'] });
    // the class line changes (a class starts or ends): read the caps again at once
    var clsLine = capsBox && capsBox.querySelector('.cpclass'), wasIn = clsLine ? clsLine.classList.contains('in') : false;
    if (clsLine && window.MutationObserver) new MutationObserver(function () {
      var now = clsLine.classList.contains('in'); if (now !== wasIn) { wasIn = now; if (labmode) checkCaps(); }
    }).observe(clsLine, { attributes: true, attributeFilter: ['class'] });

    // ================= the full editor (dual mode, 2026-10-07) =================
    // Lucide (ISC): wand-sparkles, hand, eye
    var SICO = {
      wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/> <path d="m14 7 3 3"/> <path d="M5 6v4"/> <path d="M19 14v4"/> <path d="M10 2v2"/> <path d="M7 8H3"/> <path d="M21 16h-4"/> <path d="M11 3H9"/>',
      hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/> <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/> <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/> <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
      eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/> <circle cx="12" cy="12" r="3"/>'
    };
    function sic(n) {
      return '<svg class="wl-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + SICO[n] + '</svg>';
    }
    var SELF_PH = '問 AI 助教，例如：點解按空白鍵佢唔停？', SELF_HEAD = '你自己砌，AI 助教看了會提問，不會改你的積木';
    var SELF_WAIT = 'AI 助教正在看你的程式…', REVIEW_TEXT = '請助教看看', LOCK_MAX = 60000, ANIM_MAX = 30000;
    var MODE_HINT = { ai: 'AI 幫我砌：說出你的想法，AI 會照你說的砌積木。你也可以隨時自己改。',
                      self: '我自己砌：你自己砌積木。AI 助教只會看你的程式和提問，不會改你的積木。' };
    var MODES = ['ai'], MKEY = 'iits-lab-mode:' + ep, smode = 'ai', sbase = null, lockT = null, taEl = null;
    if (lastGet && lastGet.studio === true) {
      MODES = (Array.isArray(lastGet.modes) ? lastGet.modes : ['ai', 'self']).filter(function (m) { return m === 'ai' || m === 'self'; });
      if (!MODES.length) MODES = ['ai'];
    }
    try { smode = localStorage.getItem(MKEY) || 'ai'; } catch (e) { smode = 'ai'; }
    if (MODES.indexOf(smode) < 0) smode = MODES[0];
    function zsig() { return { runs: 0, stops: 0, undo: 0 }; }
    function curSig() {
      if (!(studio && ST)) return sig;
      var a = sbase || zsig(), b = ST.sig();
      return { runs: (+a.runs || 0) + (+b.runs || 0), stops: (+a.stops || 0) + (+b.stops || 0), undo: (a.undo || b.undo) ? 1 : 0 };
    }
    function phNow() { return studio && smode === 'self' ? SELF_PH : LAB_PH; }
    function drawerMode() { return !!studio && (window.innerWidth || 0) < 1280; }

    // the mode switch (top of the pane) and the actions row (above the box): Wonder Lab with the full editor only
    var smodeBar = el('div', 'wl-smode'), smodeHint = el('p', 'wl-smodehint'), sacts = el('div', 'wl-sacts');
    smodeBar.setAttribute('role', 'radiogroup'); smodeBar.setAttribute('aria-label', '砌積木的方式'); smodeBar.hidden = smodeHint.hidden = sacts.hidden = true;
    var bAI = el('button', '', sic('wand') + '<span>AI 幫我砌</span>'), bSelf = el('button', '', sic('hand') + '<span>我自己砌</span>');
    [bAI, bSelf].forEach(function (b, i) {
      b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('data-m', i ? 'self' : 'ai'); smodeBar.appendChild(b);
      b.onclick = function () { if (smode !== b.getAttribute('data-m')) setSMode(b.getAttribute('data-m')); };
    });
    smodeBar.addEventListener('keydown', function (e) {
      if (!/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown)$/.test(e.key)) return;
      e.preventDefault();
      var nx = smode === 'ai' ? 'self' : 'ai';
      if (MODES.indexOf(nx) >= 0) { setSMode(nx); (nx === 'ai' ? bAI : bSelf).focus(); }
    });
    var taBtn = el('button', 'wl-tabtn', sic('eye') + '<span>' + REVIEW_TEXT + '</span>'); taBtn.type = 'button';
    taBtn.title = 'AI 助教看看你的程式和上次執行的結果，然後問你一個問題（不會改你的積木）';
    taBtn.onclick = function () { sendReview(); };
    var animBox = el('label', 'wl-animsw', '<input type="checkbox"><span>AI 改積木時播放動畫</span>'); animBox.hidden = true;
    animBox.querySelector('input').onchange = function () { if (ST) ST.setAnim(this.checked); syncAnim(); };
    sacts.appendChild(taBtn); sacts.appendChild(animBox);
    if (lastGet && lastGet.studio === true && SDEF) {
      bar.parentNode.insertBefore(smodeBar, bar.nextSibling);
      smodeBar.parentNode.insertBefore(smodeHint, smodeBar.nextSibling);
      if (form && form.parentNode) form.parentNode.insertBefore(sacts, form);
    }
    function syncAnim() {
      var a = ST ? ST.anim() : { available: false, enabled: false }, cb = animBox.querySelector('input');
      animBox.hidden = !(studio && smode === 'ai' && a.available);
      cb.checked = !!a.enabled;
    }
    function setSMode(m, quiet) {
      if (MODES.indexOf(m) < 0) m = MODES[0];
      smode = m;
      try { localStorage.setItem(MKEY, m); } catch (e) {}
      [bAI, bSelf].forEach(function (b) {
        var mm = b.getAttribute('data-m'), on = mm === m, ok = MODES.indexOf(mm) >= 0;
        b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; b.hidden = !ok;
      });
      smodeBar.classList.toggle('one', MODES.length < 2);
      smodeHint.textContent = MODE_HINT[m];
      taBtn.hidden = m !== 'self';
      syncAnim();
      document.body.classList.toggle('wl-selfmode', !!studio && m === 'self');
      if (headSmall && labmode && studio) headSmall.textContent = m === 'self' ? SELF_HEAD : LAB_HEAD;
      if (labmode && studio && !busy) lockLab(false);
      if (taEl && taEl.parentNode) { taEl.remove(); taEl = null; }
      if (!quiet && labmode) add('sys', m === 'self' ? '已轉為「我自己砌」：AI 助教只會看和提問，不會改你的積木。' : '已轉為「AI 幫我砌」：說出你的想法，AI 會照你說的砌積木。');
    }

    var sbox = null;
    function studioBox() {
      if (sbox) return sbox;
      sbox = el('section', 'wl-studio'); sbox.id = 'wlstudio'; sbox.hidden = true; sbox.setAttribute('aria-label', 'Wonder Lab 積木編輯器');
      sbox.innerHTML = '<div class="wl-sload" id="wlsload" role="status"><span class="wl-sspin" aria-hidden="true"></span><span>Wonder Lab 編輯器載入中…</span></div>';
      lab.parentNode.insertBefore(sbox, lab.nextSibling);
      return sbox;
    }
    function park(on) {               // leaving Wonder Lab: the editor keeps running off screen at its size (no re-layout)
      if (!sbox) return;
      if (on && !sbox.classList.contains('wl-park')) {
        var r = sbox.getBoundingClientRect();
        if (r.width && r.height) { sbox.style.width = Math.round(r.width) + 'px'; sbox.style.height = Math.round(r.height) + 'px'; }
        sbox.classList.add('wl-park');
      } else if (!on) { sbox.classList.remove('wl-park'); sbox.style.width = sbox.style.height = ''; }
    }
    function sizeStudio() {
      var lb = document.querySelector('.lessonbar'), top = 0;
      if (lb && getComputedStyle(lb).display !== 'none') top = Math.max(0, Math.round(lb.getBoundingClientRect().bottom));
      document.body.style.setProperty('--wl-top', top + 'px');
      // the drawer hangs below the editor's menu bar, so 上一步 and 「AI 學伴」 (which closes it again) stay in reach
      var fb = sbox && !sbox.classList.contains('wl-park') ? sbox.getBoundingClientRect() : null;
      document.body.style.setProperty('--wl-dtop', (fb && fb.height ? Math.round(fb.top + 48 + 2) : top) + 'px');
      if (ST) ST.setTools({ drawer: drawerMode() });
    }
    function sClose() { chat.classList.remove('open'); document.body.classList.remove('chatopen'); }
    function sOpen() {
      chat.classList.add('open'); document.body.classList.add('chatopen');
      if (narrow()) parentFull(true);
      setTimeout(function () { body.scrollTop = body.scrollHeight; }, 60);
    }
    function onStudio(type, data) {
      if (type === 'change') { save(); return; }
      if (type === 'run') {               // 我自己砌: after a run with hand changes, offer the 助教 (no automatic AI call)
        if (labmode) { if (smode === 'self') setTimeout(taChip, 1200); else if (data && data.what === 'start') seenChip(); }
        if (!data || data.what !== 'activity') save();
        return;
      }
      if (type === 'undo') { studioUndo(); return; }
      if (type === 'chat') { if (chat.classList.contains('open')) sClose(); else sOpen(); return; }
    }
    function bootStudio() {
      if (sbooting) return sbooting;
      var t0 = Date.now(), box = studioBox(), load = $('wlsload'), fr = el('iframe', 'wl-sframe');
      fr.id = 'wlsframe'; fr.title = 'Wonder Lab 積木編輯器'; fr.setAttribute('allow', 'microphone; autoplay');
      load.hidden = false;
      // a file the idle prefetch is still downloading is waited for (at most 20 s), so the frame reads it from the cache.
      // The frame gets its src BEFORE it enters the page: an iframe without src would fire load for about:blank first.
      var frameReady = Promise.race([spre || Promise.resolve(), new Promise(function (ok) { setTimeout(ok, 20000); })]).then(function () {
        return new Promise(function (ok, bad) {
          fr.onload = function () { ok(); }; fr.onerror = function () { bad(new Error('frame')); };
          setTimeout(function () { bad(new Error('frame timeout')); }, 120000);
          fr.src = BASE + SDEF.dir + SDEF.page;
          box.appendChild(fr);
        });
      });
      sbooting = Promise.all([getJSON(BASE + info.data), frameReady]).then(function (r) {
        var W = fr.contentWindow && fr.contentWindow.WLStudio;
        if (!W || typeof W.boot !== 'function' || !fr.contentWindow.GUI) throw new Error('studio frame');
        lessonKeys = !!r[0].keys;
        var s0 = st.studio && st.studio.project ? st.studio : null;
        return W.boot({ lesson: r[0], assetBase: new URL(man.assets || 'a/', BASE).href, project: s0 ? s0.project : null,
          sids: s0 ? s0.sids : null, hand: s0 ? s0.hand : 0, assets: s0 ? s0.assets : null, program: s0 ? null : (st.program || null),
          onEvent: onStudio }).then(function () { return [W, r[0]]; });
      }).then(function (x) {
        ST = window.WLS = x[0];
        load.hidden = true; window.WL_BOOT_MS = Date.now() - t0; window.WL_STUDIO = true;
        sbase = (st.sig && typeof st.sig === 'object') ? { runs: +st.sig.runs || 0, stops: +st.sig.stops || 0, undo: +st.sig.undo || 0 } : zsig();
        if (!st.seen) st.seen = (st.studio || st.hist.length) ? ST.program() : { sprites: {}, stage: { scripts: {} } };
        ST.setTools({ undo: !!st.sprev, drawer: drawerMode() });
        setSMode(smode, true);
        if (!st.hist.length) { add('bot', x[1].opening || '你想舞台上發生甚麼事？用你自己的說話講，我會照你說的砌積木。'); offerRestore(); }
        save();
        return ST;
      }).catch(function (e) {
        // the editor cannot start on this device: the read-only lab instead, with the same program and conversation
        if (window.console) console.warn('Wonder Lab editor unavailable, read-only lab instead:', e && e.message);
        try { fr.remove(); } catch (x) {}
        if (sbox) sbox.hidden = true;
        studio = false; ST = null; window.WLS = null;
        document.body.classList.remove('wl-studiomode', 'wl-selfmode'); document.documentElement.classList.remove('wl-studio-on');
        smodeBar.hidden = smodeHint.hidden = sacts.hidden = true;
        add('sys', '這部裝置未能開啟完整的積木編輯器，改用簡易版 Wonder Lab。');
        if (labmode) setMode(true);
        return null;
      });
      return sbooting;
    }
    function releaseLock() { clearTimeout(lockT); lockT = null; if (ST) ST.lock(false); }
    function handEdits(a, b) {          // {added|changed|removed: [{sprite, id}]} (AI ids such as s1 repeat across sprites)
      var out = { added: [], changed: [], removed: [] };
      try { (ST.diff(a, b) || []).forEach(function (e) { if (out[e.change] && out[e.change].length < 40) out[e.change].push({ sprite: e.sprite, id: e.id }); }); } catch (e) {}
      return out;
    }
    function studioBody(text, kind) {
      var req = ST.request(), run = ST.ran() ? ST.report() : (st.ran ? (st.report || null) : null);
      var b = { text: text, history: st.hist.slice(-8), program: req.program, run: run, note: st.note, signals: curSig(), device: device(), mode: smode,
        studio: { targets: req.targets, editing: req.editing, hand_edits: handEdits(st.seen, req.program), unsupported: req.unsupported, text: req.text } };
      if (kind) b.kind = kind;
      return { body: b, program: req.program };
    }
    function turnSeen(program) {      // the run and the signals went with this turn; hand edits count from this program on
      st.seen = program; st.note = null; st.report = null; st.ran = false; sbase = zsig(); if (ST) ST.turnDone();
    }
    function readReply(r) {
      return r.json().then(function (d) {
        if (!d || typeof d !== 'object') throw new Error('reply');
        d._status = r.status; return d;
      }).catch(function () { return { ok: false, retry: true, _status: r.status, reason: r.status === 413 ? BIG : SLOW }; });
    }
    /** One turn with the full editor: typed words (kind null) or 請助教看看 (kind review, no text). */
    function studioTurn(text, kind) {
      if (!input || busy || input.disabled) return;
      if (!ST) {                                 // still loading: keep the words and send them once the editor is ready
        if (!pendingSend) { pendingSend = true; add('sys', 'Wonder Lab 載入中，載入好就會送出'); }
        bootStudio().then(function () { if (pendingSend) { pendingSend = false; if (ST) studioTurn(text, kind); else sendLab(); } }, function () { pendingSend = false; });
        return;
      }
      if (taEl && taEl.parentNode) { taEl.remove(); taEl = null; }
      var mode = smode, ai = mode === 'ai', review = kind === 'review';
      add('me', review ? REVIEW_TEXT : text);
      if (!review) input.value = '';
      unexplain();
      var w = add('bot wait', ai ? '正在照你的想法砌積木…' : SELF_WAIT); busy = true; lockLab(true);
      ST.setTools({ busy: true });
      if (ai) { ST.lock(true); clearTimeout(lockT); lockT = setTimeout(releaseLock, LOCK_MAX); }
      var snap = studioBody(review ? '' : text, kind), ctl = window.AbortController ? new AbortController() : null, late = false;
      var abortT = setTimeout(function () { late = true; if (ctl) ctl.abort(); }, LOCK_MAX);
      fetch('/api/ai/lab/' + ep, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snap.body), signal: ctl ? ctl.signal : undefined })
        .then(readReply)
        .then(function (d) {
          clearTimeout(abortT);
          if (late) throw new Error('late');
          w.remove(); busy = false; ST.setTools({ busy: false });
          if (!d.ok) {
            releaseLock();
            var code = d._status, soft = code === 429 && d.retry === true, capped = !soft && (code === 429 || code === 404);
            if (code === 413) d.reason = BIG;
            else if (code === 504) d.reason = SLOW;
            add(soft ? 'sys wl-soft' : 'sys', d.reason || 'AI 學伴暫時未能回答。');
            if (!capped && !review) input.value = text;
            if (code === 429 && !soft && d.reason) capsReason = d.reason;
            if (code === 404) closedReason = d.reason || 'Wonder Lab 這一課即將推出。';
            lockLab(false);
            consolNext();
            if (soft) return;
            refreshCaps();
            if (code === 429) setTimeout(checkCaps, 1000);
            return;
          }
          st.hist.push({ role: 'user', content: review ? REVIEW_TEXT : text }, { role: 'assistant', content: ((d.say || '') + ' ' + (d.question || '')).trim() });
          var after = d.consol && typeof d.consol.state === 'string' ? d.consol.state : null;
          var cs = after !== 'pending' && (CONSOL_ON[consolState] || after === 'step1' || after === 'step2') ? ' wl-cs' : '';
          if (d.say) add('bot' + cs, d.say);
          if (d.question) add('bot wl-q' + cs, d.question);
          showConsol(d.consol);
          if (d.masked) add('sys', '提醒：個人資料（名字、電話等）不要在網上分享，已幫你遮蓋。');
          var changes = ai && (d.ops || []).length > 0;          // 我自己砌: the 助教 never changes the program (ops ignored)
          turnSeen(snap.program);
          var done;
          if (changes) {
            var before = ST.state(600000);
            clearTimeout(lockT); lockT = setTimeout(releaseLock, ANIM_MAX);
            done = ST.apply(d, { animate: true, maxMs: 20000 }).then(function (res) {
              st.sprev = before; st.prev = snap.program; ST.setTools({ undo: true });
              st.seen = ST.program();
              if (res && res.skipped) add('sys', '有 ' + res.skipped + ' 個改動未能套用。');
              if (res && res.sideBySide) add('sys', '有一段程式用了 AI 看不懂的積木，AI 的版本放在旁邊，你原本的程式沒有改動。');
              return res;
            });
          } else done = Promise.resolve(null);
          return done.then(function () {
            releaseLock();
            if (d.focus || d.focus_sprite) ST.glow(typeof d.focus === 'object' ? d.focus : null, d.focus_sprite || (typeof d.focus === 'string' ? d.focus : null));
            save();
            consolNext();                        // the teacher started the wrap-up while this turn was in flight
            return refreshCaps();
          }).then(function () { if (labmode && mq('(pointer:fine)') && !input.disabled) try { input.focus(); } catch (e) {} });
        })
        .catch(function () {
          clearTimeout(abortT); w.remove(); busy = false; ST.setTools({ busy: false }); releaseLock();
          add('sys', late ? SLOW : DOWN); if (!review) input.value = text; lockLab(false); refreshCaps();
        });
    }
    function sendReview() { if (studio && ST && smode === 'self') studioTurn('', 'review'); }
    function taChip() {
      if (!ST || busy || !labmode || smode !== 'self' || (taEl && taEl.parentNode)) return;
      var d = []; try { d = ST.diff(st.seen, ST.program()); } catch (e) {}
      if (!d.length) return;
      taEl = chip('想助教看看？', 'wl-ta', function () { taEl = null; sendReview(); });
    }
    function studioUndo() {
      if (!ST || !st.sprev || busy) return;
      var p = st.sprev; st.sprev = null; st.prev = null; ST.setTools({ undo: false });
      st.note = '（學生按了「上一步」，程式回到 AI 上一次改動之前的版本。）'; sbase = sbase || zsig(); sbase.undo = 1;
      ST.loadState(p).then(function (ok) { save(); add('sys', ok ? '已回到上一步的程式。' : '未能回到上一步。'); });
    }
    window.addEventListener('pagehide', function () { if (studio) releaseLock(); });

    // ---- one lab turn ----
    function sendLab() {
      if (!input) return;
      var text = (input.value || '').trim();
      if (!text || busy || input.disabled) return;
      if (studio) return studioTurn(text, null);
      if (!wl) {                                 // still loading: keep the words and send them once the lab is ready
        if (!pendingSend) { pendingSend = true; add('sys', 'Wonder Lab 載入中，載入好就會送出'); }
        boot().then(function () { if (pendingSend) { pendingSend = false; sendLab(); } }, function () { pendingSend = false; });
        return;
      }
      add('me', text); input.value = ''; unexplain();
      var w = add('bot wait', '正在照你的想法砌積木…'); busy = true; lockLab(true);
      var run = ranSinceTurn ? (wl.trace ? wl.report() : (st.report || null)) : null;
      fetch('/api/ai/lab/' + ep, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, history: st.hist.slice(-8), program: wl.program, run: run, note: st.note, signals: sig, device: device() }) })
        .then(function (r) {
          return r.json().then(function (d) {
            if (!d || typeof d !== 'object') throw new Error('reply');
            d._status = r.status; return d;
          }).catch(function () {                 // not JSON (an HTML error page from the proxy)
            return { ok: false, retry: true, _status: r.status, reason: r.status === 413 ? BIG : SLOW };
          });
        })
        .then(function (d) {
          w.remove(); busy = false;
          if (!d.ok) {
            // 429 with retry: another turn of this login is still in flight (a second tab, or the shared class login):
            // nothing is capped, so the words stay in the box and the reason is only a line in the conversation
            var code = d._status, soft = code === 429 && d.retry === true, capped = !soft && (code === 429 || code === 404);
            if (code === 413) d.reason = BIG;
            else if (code === 504) d.reason = SLOW;
            add(soft ? 'sys wl-soft' : 'sys', d.reason || 'AI 學伴暫時未能回答。');
            if (!capped) input.value = text;     // keep the student's words to send again
            if (code === 429 && !soft && d.reason) capsReason = d.reason;
            if (code === 404) closedReason = d.reason || 'Wonder Lab 這一課即將推出。';
            lockLab(false);
            consolNext();
            if (soft) return;
            refreshCaps();
            if (code === 429) setTimeout(checkCaps, 1000);
            return;
          }
          st.hist.push({ role: 'user', content: text }, { role: 'assistant', content: ((d.say || '') + ' ' + (d.question || '')).trim() });
          // this answer belongs to the wrap-up: it was running before the turn (step 1 / 2, or pending and this turn
          // became step 1), or the turn started it (the class switch). Still 'pending' after the turn = the teacher
          // started it while this ordinary turn ran: not a wrap-up answer; consolNext() sends the wrap-up next.
          var after = d.consol && typeof d.consol.state === 'string' ? d.consol.state : null;
          var cs = after !== 'pending' && (CONSOL_ON[consolState] || after === 'step1' || after === 'step2') ? ' wl-cs' : '';
          if (d.say) add('bot' + cs, d.say);
          if (d.question) add('bot wl-q' + cs, d.question);
          showConsol(d.consol);
          if (d.masked) add('sys', '提醒：個人資料（名字、電話等）不要在網上分享，已幫你遮蓋。');
          var changed = (d.ops || []).length > 0;
          if (changed) { st.prev = wl.program; undoBtn.disabled = false; }
          ranSinceTurn = false; st.note = null; st.report = null; sig = { runs: 0, stops: 0, undo: 0 };
          return wl.applyTurn(d).then(function () {
            afterChange();
            consolNext();                        // the teacher started the wrap-up while this turn was in flight
            if (changed) {
              if (narrow()) lookChip();
              setTimeout(function () { if (wl.showNew) wl.showNew(); }, 60);
            }
            return refreshCaps();
          }).then(function () { if (labmode && mq('(pointer:fine)') && !input.disabled) try { input.focus(); } catch (e) {} });
        })
        .catch(function () { w.remove(); busy = false; add('sys', DOWN); input.value = text; lockLab(false); refreshCaps(); });
    }
    // a lab turn has ended: if the wrap-up is still waiting (the poll found it while the turn was in flight), send it now
    function consolNext() { if (consolState === 'pending' && labmode) setTimeout(sendConsol, 0); }
    // ---- wrap-up: every 8 s in lab mode, read consol from the lab GET (no AI call, a small database read). When the
    // teacher has started it (consol.pending), post a turn with {kind: "consol"} and no text: the AI's first wrap-up
    // question appears without the student typing (the teacher page promises about 20 s: 8 s poll + the AI's answer).
    // 409 = nothing pending any more; 429 retry:true = another turn of this login is in flight: try again in 3 s;
    // 429 without retry = caps: read the caps and let the poll try again. A lab turn that ends while the wrap-up is
    // pending sends it at once (sendLab), so a student who was typing does not wait for the next poll.
    // A new 'pending' is read once more 1.5 s later before anything shows: a 開始整合 that the teacher takes back at once
    // (停止整合 right after) never reaches the student.
    var CONSOL_POLL = 8000, CONSOL_CONFIRM = 1500, CONSOL_RETRY = 3000, consolRT = null, consolRetries = 0, consolSeen = false;
    function consolPoll() {
      clearTimeout(consolT); consolT = null;
      if (!labmode) return;
      consolT = setTimeout(consolPoll, CONSOL_POLL);
      if (document.hidden || consolBusy) return;
      getJSON('/api/ai/lab/' + ep).then(function (d) {
        if (!d || !d.ok) return;
        var pend = !!(d.consol && d.consol.pending);
        if (pend && !consolSeen && consolState !== 'pending') {
          consolSeen = true; clearTimeout(consolT); consolT = setTimeout(consolPoll, CONSOL_CONFIRM); return;
        }
        consolSeen = false;
        showConsol(d.consol);
        if (pend) sendConsol(); else consolRetries = 0;
      }).catch(noop);
    }
    function sendConsol() {
      if (consolBusy || busy || !labmode || Date.now() < consolWait || capsReason || closedReason) return;
      if (studio ? !ST : !wl) { boot().then(function () { setTimeout(sendConsol, 0); }, noop); return; }
      consolBusy = true; busy = true; lockLab(true);
      var w = add('bot wait wl-cs', 'AI 學伴正在看你的作品…');
      var snap = studio ? studioBody('', 'consol') : null;
      var run = studio ? snap.body.run : (ranSinceTurn ? (wl.trace ? wl.report() : (st.report || null)) : null);
      fetch('/api/ai/lab/' + ep, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studio ? (function () { var b = snap.body; delete b.text; return b; })()
          : { kind: 'consol', history: st.hist.slice(-8), program: wl.program, run: run, note: st.note, signals: sig, device: device() }) })
        .then(function (r) { return r.json().then(function (d) { d._status = r.status; return d; }, function () { return { ok: false, _status: r.status }; }); })
        .then(function (d) {
          w.remove(); busy = false; consolBusy = false; lockLab(false);
          if (!d.ok) {
            if (d.consol) showConsol(d.consol);
            clearTimeout(consolRT); consolRT = null;
            if (d._status === 429 && d.retry === true) {                   // a turn in flight: soon, not at the next poll
              if (++consolRetries <= 10) consolRT = setTimeout(function () { consolRT = null; if (consolState === 'pending') sendConsol(); }, CONSOL_RETRY);
            } else if (d._status === 429) refreshCaps();
            else if (d._status !== 409) consolWait = Date.now() + 60000;   // AI down: wait a minute
            return;
          }
          consolRetries = 0; clearTimeout(consolRT); consolRT = null;
          st.hist.push({ role: 'assistant', content: ((d.say || '') + ' ' + (d.question || '')).trim() });
          if (d.say) add('bot wl-cs', d.say);
          if (d.question) add('bot wl-q wl-cs', d.question);
          showConsol(d.consol);
          ranSinceTurn = false; st.note = null; st.report = null; sig = { runs: 0, stops: 0, undo: 0 };   // the run went with this turn
          if (studio && ST) { turnSeen(snap.program); if (d.focus || d.focus_sprite) ST.glow(typeof d.focus === 'object' ? d.focus : null, d.focus_sprite || null); }
          save();
          if (studio) { if (drawerMode() && !chat.classList.contains('open')) sOpen(); }      // the drawer opens so it is seen
          else if (narrow() && !chat.classList.contains('open') && fab) fab.click();      // tablets: open the drawer so it is seen
          setTimeout(function () { body.scrollTop = body.scrollHeight; }, 350);     // after the drawer has its height
          refreshCaps();
        })
        .catch(function () { w.remove(); busy = false; consolBusy = false; lockLab(false); consolWait = Date.now() + 60000; });
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden && labmode) consolPoll(); });

    // capture phase: in lab mode the chat form belongs to the lab (chat.js never sees the event)
    document.addEventListener('submit', function (e) {
      if (!labmode || e.target !== form) return;
      e.preventDefault(); e.stopImmediatePropagation(); sendLab();
    }, true);
    document.addEventListener('keydown', function (e) {
      if (!labmode || e.target !== input) return;
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopImmediatePropagation(); sendLab(); }
    }, true);

    // ---- toolbar (a button clicked with a pointer gives the keyboard back to the stage) ----
    $('wlrun').onclick = function (ev) {
      if (!wl) return;
      if (input) input.blur();
      wl.run(); ranSinceTurn = true; sig.runs += 1; save(); unexplain();
      if (narrow() && !side() && chat.classList.contains('open')) closePane();      // the drawer gives the stage back
      underBar($('wlstage'), true);                                                  // the output must be on screen
      seenChip();
      if (ev && ev.detail) this.blur();
    };
    $('wlstop').onclick = function (ev) { if (wl) { wl.stop(); sig.stops += 1; save(); } if (ev && ev.detail) this.blur(); };
    undoBtn.onclick = function () {
      if (!wl || !st.prev) return;
      var p = st.prev; st.prev = null; undoBtn.disabled = true;
      st.note = '（學生按了「上一步」，程式回到 AI 上一次改動之前的版本。）'; sig.undo = 1;
      wl.applyTurn({ program: p, ops: [] }).then(afterChange);
      save();
      add('sys', '已回到上一步的程式。');
    };
    Array.prototype.forEach.call(document.querySelectorAll('#wlpad button'), function (b) {
      var k = b.getAttribute('data-k');
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); if (wl) wl.key(k, true); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { b.addEventListener(ev, function () { if (wl) wl.key(k, false); }); });
    });
    var seenEl = null;
    function seenChip() {
      if (seenEl && seenEl.parentNode) return;
      seenEl = chip('說說你看到甚麼……', 'wl-seen', function () {
        seenEl = null;
        if (input) { input.value = '我看到'; try { input.focus(); } catch (e) {} }
      });
    }

    // reopen in lab mode after a reload, from a #lab link, or because the toggle was tapped while the probe retried
    showConsol(last && last.consol);
    var startLab = wantLab || location.hash === '#lab';
    wantLab = false;
    try { startLab = startLab || sessionStorage.getItem(MODEKEY) === 'lab'; } catch (e) {}
    if (startLab) setMode(true);
    }
  }
})();
