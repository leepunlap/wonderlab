/*!
 * Wonder Lab — core: the primitives and the wording every lab module shares.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 (see LICENSE).
 *
 * This module owns nothing about the page, the conversation, the API, the Studio or the mode: only the small
 * functions that would otherwise be copied into each of them (build a styled element, ask a media query, read a
 * browser capability) and the sentences the lab says out loud. Adding a module to the lab? Register it with
 * WLR.define and take what you need from here — do not add a fifth copy of el().
 *
 * ES5 on purpose: this ships inside the L4 bundle, which runs on every lesson page, also on old browsers that
 * cannot run the lab itself. tools/build.mjs puts it first in dist/lab.js; test/check_bundle.mjs fails if a module
 * reaches for a global instead of registering here.
 */
WLR.define('core', function () {
  'use strict';

  // What the lab says when it cannot do what was asked. One place, so the same failure never gets two wordings.
  var MSG = {
    OLD: '這部裝置的瀏覽器太舊，請更新系統或改用其他裝置',
    NET: '連線不穩，按一下再試',
    BIG: '程式太大了。可以按「上一步」，或者請 AI 刪去一段不用的程式。',
    SLOW: 'AI 學伴想得太久了，請再送出一次。',
    DOWN: 'AI 學伴暫時連不上，請稍後再試。',
    EXPORT: '匯出 .sb3 coming soon：與 UCMake 的檔案格式相容性仍待官方格式規範。',
    LAB_PH: '說說你的想法：你想角色怎樣做？',
    LAB_HEAD: '照你的想法砌積木，一起試、一起看',
    REPLAY_OPEN: '你想舞台上發生甚麼事？用你自己的說話講，我會照你說的砌積木。'
  };

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
  function $(id) { return document.getElementById(id); }
  function mq(q) { return !!(window.matchMedia && window.matchMedia(q).matches); }
  function narrow() { return mq('(max-width:1099px)'); }
  // held sideways under 1100 px (tablets from 900 px wide, phones): the AI 學伴 is a right pane (lab.css, same queries)
  function side() { return mq('(max-width:1099px) and (orientation:landscape) and (min-width:900px), (max-width:1099px) and (orientation:landscape) and (max-height:500px)'); }
  function noop() {}
  // the pointer of this device, sent with every lab turn: the AI then says 「手指」 on a touch screen and 「滑鼠」 elsewhere
  function device() { return mq('(pointer:coarse)') ? 'touch' : 'mouse'; }
  function idle(fn) { if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 4000 }); else setTimeout(fn, 1500); }
  /** The engine files a manifest names, and how many the loading line counts to. */
  function scripts(man) { return (man && man.scripts) || []; }
  /** The lesson a page boots with when the manifest names no lesson data file (src/standalone.js). The Studio reads
      lesson.stage / lesson.sprites and falls back to this shape itself, so pass it rather than a bare {}. */
  function emptyLesson(title) { return { title: title || 'Wonder Lab', stage: { backdrops: [] }, sprites: [] }; }

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

  return { MSG: MSG, ICO: ICO, ic: ic, el: el, $: $, mq: mq, narrow: narrow, side: side, noop: noop, device: device,
           idle: idle, supported: supported, scripts: scripts, emptyLesson: emptyLesson };
});
