/*!
 * Wonder Lab — the lesson entry: read this page, read manifest.json, wire the modules, get out of the way.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 (see LICENSE).
 *
 * The deployed L4 lesson page carries exactly one tag and this is what that tag runs:
 *
 *   <script src="../assets/lab/lab.js?v=…" defer></script>
 *
 * tools/build.mjs puts this file second-to-last in both bundles, after the registry, the host (lab-host.js) and the
 * modules; the last file is the entry (src/lab-entry.js for the lesson page, src/standalone.js for a page that asks
 * for a lab), and it is the only thing that calls boot(). Nothing here decides anything a module could decide:
 * boot() resolves the page contract, fetches the manifest once and starts the gate; setup() is the ORDER the modules
 * are wired in, and that order is the one the old single-file lab used. The audit of 2026-10-16 asked for this file
 * to be wiring only, and it is.
 *
 * On a page that is not a lesson page the bundle stays inert (no #chat, or data-ep outside the lesson path): the
 * teachers' playground loads dist/lab.js as its fallback host and relies on that. A page that wants to mount anyway
 * says so on its own tag — see the options below, and src/standalone.js.
 *
 * Options, read from this script's own tag (all optional; the lesson default in brackets):
 *   data-wl-mount="lesson|always"   which pages may mount [lesson = the L4 lesson path]
 *   data-wl-lesson="<id>"           the lesson id under the lab API [the page's #chat[data-ep]]
 *   data-wl-base="<folder>"         where manifest.json, lab.css and the engine live [this script's folder]
 *   data-wl-manifest="<url>"        the manifest itself [<base>manifest.json]
 *   data-wl-lab-api="/api/ai/lab/"  the lab turn endpoint [the same path on this origin]
 *   data-wl-status-api="…"          the caps endpoint [the same path on this origin]
 *   data-wl-gate="service|open"     does the server decide? [service = the lab GET decides]
 *   data-wl-start="lab|material"    which view to open [whatever this page was left in]
 *
 * ES5 on purpose (see lab-core.js).
 */
var WLLab = (function () {
  'use strict';
  var P = WLR.require('page', null);
  var API = { create: create, boot: boot, setup: setup, load: load, options: options };
  var THE = null;                       // one lab per page; every module instance below is bound to it

  function attr(script, name) {
    try { return (script && script.getAttribute && script.getAttribute(name)) || null; } catch (e) { return null; }
  }
  function options(script) {
    return {
      mount: attr(script, 'data-wl-mount'), lesson: attr(script, 'data-wl-lesson'), base: attr(script, 'data-wl-base'),
      manifest: attr(script, 'data-wl-manifest'), container: attr(script, 'data-wl-container'),
      labApi: attr(script, 'data-wl-lab-api'), statusApi: attr(script, 'data-wl-status-api'),
      gate: attr(script, 'data-wl-gate'), start: attr(script, 'data-wl-start'),
      shell: attr(script, 'data-wl-shell') !== null, standalone: attr(script, 'data-wl-standalone') !== null
    };
  }

  /** The lab instance: the two runtimes, the modules bound to them, and the state they share. */
  function create(opts) {
    if (THE) return THE;
    var o = opts || {};
    THE = {
      doc: document, host: o.host !== undefined ? o.host : (window.WonderLabHost || null), opts: {},
      man: null, info: { status: 'soon' }, ready: false,
      st: null, sig: null, ranSinceTurn: false, labmode: false, busy: false,
      capsReason: '', closedReason: '', pendingSend: false, wantLab: false, prefetched: false,
      last: null, KEY: '', studioOn: null, wl: null, booting: null, ST: null, sbooting: null,
      setupDone: false
    };
    ['core', 'page', 'api', 'chat', 'ui', 'ro', 'studio', 'mode'].forEach(function (name) { THE[name] = WLR.require(name, THE); });
    THE.main = API;
    return THE;
  }

  /** Read manifest.json once and start whatever this page is entitled to. `cfg.gate === 'open'` skips the lab GET. */
  function load(lab, cfg) {
    lab.opts = cfg || {};
    lab.api.paths((cfg.labApi || cfg.statusApi) ? { lab: cfg.labApi, status: cfg.statusApi } : null);
    fetch(P.manifestUrl, { cache: 'no-cache', credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
      .then(function (man) { init(lab, cfg || {}, man); })
      .catch(function (e) { if (window.console) console.warn('Wonder Lab unavailable:', e); });
    return lab;
  }

  function init(lab, cfg, man) {
    lab.man = man;
    lab.info = (man.lessons || {})[P.slug] || { status: 'soon' };
    // a standalone page may have no lessons map at all: it asked for the lab, so it gets it
    lab.ready = lab.info.status === 'ready' || cfg.gate === 'open';
    lab.ui.mountToggle(lab.ready);
    if (!lab.ready) { lab.ui.soon(lab.info.status === 'hw'); return; }
    if (cfg.gate === 'open') {
      // no lab GET on this page: the manifest decides whether the Studio is available, and the lab opens
      P.startInLab = cfg.start === 'material' ? false : true;
      setup({ ok: true, studio: !!(lab.host && lab.host.studioDef(man)), modes: ['ai', 'self'], program: null, consol: { state: 'off' } });
      return;
    }
    lab.mode.arm();
  }

  /** The ORDER the modules are wired in. Once. */
  function setup(last) {
    var lab = THE;
    if (!lab || lab.setupDone) return;
    lab.setupDone = true;
    lab.ui.mountPane();
    lab.chat.mount();
    lab.ui.mountChat();
    lab.mode.wrapup();
    lab.mode.begin(last);
    lab.chat.replay(lab.st.hist);
    lab.ro.toolbar();
    lab.ro.showEmpty();
    lab.ui.attach();
    lab.mode.buttons();
    lab.mode.caps();
    lab.studio.init();
    lab.studio.attach();
    lab.chat.attach();
    lab.mode.finish();
  }

  /** The lesson entry: exactly what the one <script> tag on an L4 lesson page runs. */
  function boot() {
    var script = document.currentScript || null;
    var cfg = options(script);
    if (cfg.standalone) return null;                       // src/standalone.js owns this page
    var lessonPath = cfg.mount === 'always' ? null : P.LESSON_PATH;
    if (!P.mount({ script: script, ep: cfg.lesson, base: cfg.base, lessonPath: lessonPath, shell: false })) return null;
    return load(create({ host: P.host }), cfg);
  }

  return API;
}());
