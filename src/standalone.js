/*!
 * Wonder Lab — standalone: mount the lab on a page that is not a lesson page.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 (see LICENSE).
 *
 * One tag, no lesson site around it:
 *
 *   <script src="…/lab-standalone.js" data-wl-base="…" data-wl-lesson="demo" data-wl-gate="open" defer></script>
 *
 * What it does, in order:
 *   1. builds its own container and the page contract (the shell lab-page.js knows how to make: .layout > main.wrap +
 *      #chat with a head, a body, the box and the caps box) — a page that already has that markup is left alone;
 *   2. links lab-standalone.css (the page chrome a lesson site supplies and a bare page does not);
 *   3. reads <base>/manifest.json through the same code the lesson lab uses (WLLab.load) and mounts the Studio
 *      through the SAME host (lab-host.js) when the manifest names a studio-<hex>/ folder;
 *   4. falls back to the read-only runtime when it does not: no "studio" in the manifest, or the folder is not
 *      deployed (lab-host.js fails the frame fast and lab-studio.js hands the page to lab-ro.js).
 *
 * It adds no global: everything it needs is on its own <script> tag, and it prints one line to the console when it
 * cannot start at all (no manifest) rather than failing silently.
 *
 * Options (all optional):
 *   data-wl-base="<folder>"        where manifest.json, lab.css and the engine live [this script's folder]
 *   data-wl-manifest="<url>"       the manifest itself [<base>manifest.json]
 *   data-wl-lesson="<id>"          the lesson id under the lab API ['standalone']
 *   data-wl-container="<selector>" where to build the shell [a new div appended to <body>]
 *   data-wl-lab-api="<url>"        the lab turn endpoint [<origin>/api/ai/lab/]
 *   data-wl-status-api="<url>"     the caps endpoint [<origin>/api/ai/status/]
 *   data-wl-start="lab|material"   which view to open [lab]
 *   data-wl-css="none"             do not link lab-standalone.css (the page brings its own chrome)
 *
 * ES5 on purpose (see lab-core.js).
 */
(function () {
  'use strict';
  var P = WLR.require('page', null);
  var script = document.currentScript || null;
  function attr(name) { try { return (script && script.getAttribute && script.getAttribute(name)) || null; } catch (e) { return null; } }

  var self = script && script.src ? script.src.slice(0, script.src.lastIndexOf('/') + 1).replace(/\?.*$/, '') : null;
  var base = attr('data-wl-base') || self;
  var ep = attr('data-wl-lesson') || 'standalone';
  var cfg = {
    lesson: ep, base: base, manifest: attr('data-wl-manifest'), container: attr('data-wl-container'),
    labApi: attr('data-wl-lab-api'), statusApi: attr('data-wl-status-api'),
    gate: 'open', start: attr('data-wl-start') === 'material' ? 'material' : 'lab', shell: true, standalone: true
  };

  function container() {
    if (cfg.container) { try { return document.querySelector(cfg.container); } catch (e) { return null; } }
    var d = document.createElement('div');
    d.className = 'wl-standalone';
    document.body.appendChild(d);
    return d;
  }
  function stylesheet() {
    if (attr('data-wl-css') === 'none' || !self) return;
    var href = self + 'lab-standalone.css', id = 'wl-standalone-css';
    if (document.getElementById(id)) return;
    var link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet'; link.href = href;
    document.head.appendChild(link);
  }

  if (!P.mount({ script: script, ep: ep, base: base, manifest: cfg.manifest, container: container(),
                 lessonPath: null, shell: true, start: cfg.start })) {
    if (window.console) console.warn('Wonder Lab standalone: this page already has a lab, or no container could be built.');
    return;
  }
  stylesheet();
  var lab = WLLab.create({ host: window.WonderLabHost || null });
  WLLab.load(lab, cfg);
  if (window.console) console.log('Wonder Lab standalone:', P.ep, 'base', P.base, 'manifest', P.manifestUrl);
}());
