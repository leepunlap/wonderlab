/*!
 * Wonder Lab Studio — loaded BEFORE the editor bundle. Copyright (C) 2026 IITS. AGPL-3.0-only.
 * scratch-gui (and scratch-paint inside it) pick their layout from VIEWPORT width: JS media queries such as
 * "(min-width: 1096px)" (stage size) and CSS @media rules such as "(max-width: 1249px)" (paint editor). Next to the
 * chat pane the editor only has (viewport - PANE) pixels, so both kinds are rewritten to ask about the editor's own
 * width. The pane is side by side from PANE_FROM px up (studio.css); below that it is a drawer and nothing changes.
 */
(function () {
  'use strict';
  var PANE = 360, PANE_FROM = 1280;        // keep in step with --wl-chat-w and the @media (max-width: 1279px) rule
  var BELOW = PANE_FROM - 0.02;

  // editor >= t  <=>  viewport >= max(t + PANE, PANE_FROM)  or  t <= viewport < PANE_FROM
  function minW(t, pre) {
    var a = pre + '(min-width: ' + Math.max(t + PANE, PANE_FROM) + 'px)';
    return t < PANE_FROM ? a + ', ' + pre + '(min-width: ' + t + 'px) and (max-width: ' + BELOW + 'px)' : a;
  }
  // editor <= m  <=>  PANE_FROM <= viewport <= m + PANE  or  viewport <= min(m, PANE_FROM - 0.02)
  function maxW(m, pre) {
    var parts = [];
    if (m + PANE >= PANE_FROM) parts.push(pre + '(min-width: ' + PANE_FROM + 'px) and (max-width: ' + (m + PANE) + 'px)');
    parts.push(pre + '(max-width: ' + Math.min(m, BELOW) + 'px)');
    return parts.join(', ');
  }
  // only simple queries with ONE width feature are rewritten: "[only screen and ](min|max)-width: Npx"
  var RX = /^\s*((?:only\s+)?screen\s+and\s+)?\(\s*(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)\s*$/i;
  function shift(q) {
    var m = RX.exec(String(q)); if (!m) return null;
    var pre = m[1] ? m[1].replace(/\s+/g, ' ') : '';
    return m[2].toLowerCase() === 'min' ? minW(+m[3], pre) : maxW(+m[3], pre);
  }
  window.WL_PANE = { width: PANE, from: PANE_FROM, shift: shift };

  var mm = window.matchMedia && window.matchMedia.bind(window);
  if (mm) window.matchMedia = function (q) { var s = shift(q); return mm(s || q); };

  var done = typeof WeakSet === 'function' ? new WeakSet() : null;
  function fixRules(rules) {
    for (var i = 0; rules && i < rules.length; i++) {
      var r = rules[i];
      if (r.type === 4 && r.media && !(done && done.has(r))) {      // CSSMediaRule
        var s = shift(r.media.mediaText);
        if (s) try { r.media.mediaText = s; } catch (e) {}
        if (done) done.add(r);
      }
      if (r.cssRules) fixRules(r.cssRules);
    }
  }
  function fixCss() {
    for (var i = 0; i < document.styleSheets.length; i++) {
      var sh = document.styleSheets[i], own = sh.href && /studio\.css/.test(sh.href);
      if (own) continue;                                              // our own layout rules ask about the viewport
      try { fixRules(sh.cssRules); } catch (e) { /* cross-origin sheet: not ours to change */ }
    }
  }
  var queued = false;
  function soon() { if (queued) return; queued = true; (window.requestAnimationFrame || setTimeout)(function () { queued = false; fixCss(); }); }
  window.WL_PANE.fixCss = fixCss;
  // style-loader adds the editor's <style> tags to <head>
  if (window.MutationObserver) new MutationObserver(soon).observe(document.head || document.documentElement, { childList: true });
  document.addEventListener('DOMContentLoaded', fixCss);
})();
