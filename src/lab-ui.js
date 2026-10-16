/*!
 * Wonder Lab — the chrome: the mode toggle, the status line, the lab pane's markup and the geometry of a narrow screen.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 (see LICENSE).
 *
 * What this module owns, and all it owns: the widgets and where they sit. It decides nothing about when the lab may
 * open (lab-mode.js), what a turn means (lab-ro.js / lab-studio.js) or what the page is (lab-page.js). Every
 * measurement of a box in this file is made at the moment it is needed and written into a style - the rule is
 * "measure, do not reason about geometry", and the old file had this spread over four places.
 *
 * ES5 on purpose (see lab-core.js).
 */
WLR.define('ui', function (L, req) {
  'use strict';
  var C = req('core'), P = req('page');
  var el = C.el, ic = C.ic, $ = C.$, mq = C.mq, narrow = C.narrow, side = C.side;

  var bar = null, bMat = null, bLab = null, note = null, noteT = null, shown = false, onShown = [];
  var pane = null, leftEl = null, headSmall = null, headText = '';
  var barNote = null, barT = null, lookEl = null;

  /* ---- the toggle in the AI 學伴 pane, and the one status line under it ---- */

  function reveal() { if (!shown) { shown = true; bar.style.visibility = ''; onShown.splice(0).forEach(function (f) { f(); }); } }
  function whenShown(f) { if (shown) f(); else onShown.push(f); }       // the toggle turns usable only once it is visible
  function tell(msg) {          // clear first, so a screen reader announces the same message again on a second tap
    clearTimeout(noteT); note.textContent = ''; note.hidden = false;
    noteT = setTimeout(function () { note.textContent = msg; }, 30);
  }
  function hush() { clearTimeout(noteT); note.hidden = true; note.textContent = ''; }
  function rove() { [bMat, bLab].forEach(function (b) { b.tabIndex = b.getAttribute('aria-selected') === 'true' ? 0 : -1; }); }

  // not available here: looks disabled (aria-disabled, so a tap still explains why) and never loads the engine
  function soon(hw) {
    var msg = hw ? '這一課要用 UC-Mind 主控板，Wonder Lab 版本 coming soon，請用課堂教材。' : 'Wonder Lab 版本 coming soon。';
    bLab.disabled = false; bLab.setAttribute('aria-disabled', 'true'); bLab.classList.add('soon'); bLab.title = msg;
    if (!bLab.querySelector('small')) bLab.insertAdjacentHTML('beforeend', '<small>coming soon</small>');
    bLab.onclick = function () { tell(msg); };
  }

  /** The toggle (always shown on a lab page) plus the stylesheet the lab needs. */
  function mountToggle(ready) {
    if (bar) return;
    // the toggle stays invisible (it keeps its room) until lab.css has loaded, or 3 s at most: no unstyled flash
    bar = el('div', 'wl-mode'); bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', '模式');
    bar.style.visibility = 'hidden';
    var css = el('link');
    css.rel = 'stylesheet'; css.onload = css.onerror = reveal; css.href = P.base + L.man.css; document.head.appendChild(css);
    setTimeout(reveal, 3000);
    bMat = el('button', 'on', ic('book') + '<span>課堂教材</span>');
    bLab = el('button', '', ic('flask') + '<span>Wonder Lab</span>' + (ready ? '' : '<small>coming soon</small>'));
    [bMat, bLab].forEach(function (b, i) { b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', i === 0 ? 'true' : 'false'); bar.appendChild(b); });
    // ARIA tabs, manual activation: Tab reaches the selected tab only (roving tabindex); Left / Right / Home / End move
    // the focus between the two; Enter or Space switches (switching to Wonder Lab loads the engine, so never on focus)
    rove();
    bar.addEventListener('keydown', function (e) {
      var list = [bMat, bLab].filter(function (b) { return !b.disabled; }), i = list.indexOf(document.activeElement), k = e.key;
      if (i < 0 || e.altKey || e.ctrlKey || e.metaKey || !/^(ArrowLeft|ArrowRight|Home|End)$/.test(k)) return;
      e.preventDefault();
      var j = k === 'Home' ? 0 : k === 'End' ? list.length - 1 : (i + (k === 'ArrowLeft' ? -1 : 1) + list.length) % list.length;
      list[j].focus();
    });
    note = el('p', 'wl-note'); note.setAttribute('role', 'status'); note.hidden = true;
    if (P.head && P.head.parentNode) P.head.parentNode.insertBefore(bar, P.head.nextSibling); else P.chat.insertBefore(bar, P.chat.firstChild);
    bar.parentNode.insertBefore(note, bar.nextSibling);
    bMat.onclick = function () { hush(); };
  }
  function select(on) { bMat.classList.toggle('on', !on); bLab.classList.toggle('on', on); bMat.setAttribute('aria-selected', on ? 'false' : 'true'); bLab.setAttribute('aria-selected', on ? 'true' : 'false'); rove(); }

  /* ---- the lab pane (left, replaces the lesson while in lab mode) ---- */

  function mountPane() {
    if (pane) return pane;
    var NS = C.scripts(L.man).length || 5;
    pane = el('section', 'wl-lab'); pane.id = 'wllab'; pane.hidden = true; pane.setAttribute('aria-label', 'Wonder Lab');
    pane.innerHTML =
      '<div class="wl-bar">' +
        '<button type="button" class="wl-go" id="wlrun">' + ic('play') + '<span>執行</span></button>' +
        '<button type="button" class="wl-ionly" id="wlstop" aria-label="停止" title="停止">' + ic('stop') + '<span>停止</span></button>' +
        '<button type="button" class="wl-ionly" id="wlundo" disabled aria-label="上一步" title="回到 AI 上一次改動之前的程式">' + ic('undo') + '<span>上一步</span></button>' +
        '<span class="wl-sp"></span>' +
        '<button type="button" class="wl-soon" id="wlexport" aria-disabled="true" title="' + C.MSG.EXPORT + '">' + ic('download') +
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
      '<p class="wl-foot">Wonder Lab · <a href="' + P.base + (L.man.source || 'SOURCE.html') + '" target="_blank" rel="noopener">開源授權／原始碼</a></p>';
    if (P.mainEl && P.mainEl.parentNode) P.mainEl.parentNode.insertBefore(pane, P.mainEl.nextSibling); else document.body.appendChild(pane);
    barNote = $('wlbarnote');
    return pane;
  }

  /* ---- the chat pane's own bits: the head line, the send label and the "turns left" line ---- */
  function mountChat() {
    headSmall = P.head && P.head.querySelector('small'); headText = headSmall ? headSmall.textContent : '';
    leftEl = el('div', 'wl-left'); leftEl.hidden = true;
    if (P.capsBox) P.capsBox.appendChild(leftEl);
  }
  function setHead(text) { if (headSmall) headSmall.textContent = text; }
  function headTextNow() { return headText; }
  function setSendLabel(text) { if (P.send) P.send.textContent = text; }

  /* ---- a status line under the toolbar (the chat pane's note says the same where the pane is on screen) ---- */
  function explain(msg) {
    tell(msg);
    var onScreen = getComputedStyle(P.chat).display !== 'none';
    barNote.setAttribute('role', 'status');
    if (onScreen) barNote.setAttribute('aria-hidden', 'true'); else barNote.removeAttribute('aria-hidden');
    barNote.textContent = msg; barNote.hidden = false;
    clearTimeout(barT);
    barT = setTimeout(function () { barNote.hidden = true; if (note.textContent === msg) hush(); }, 10000);
  }
  function unexplain() { clearTimeout(barT); barNote.hidden = true; }

  /* ---- geometry ---- */
  function wlTop() { return parseFloat(document.body.style.getPropertyValue('--wl-top')) || 0; }
  function stickyTop() {
    var lb = P.lessonbar(), top = 0;
    if (lb && getComputedStyle(lb).display !== 'none') top = Math.max(0, Math.round(lb.getBoundingClientRect().bottom));
    document.body.style.setProperty('--wl-top', top + 'px');
    return top;
  }
  /** Narrow screens: the chat is a drawer that ends just below the stage (held sideways: a right pane). */
  function sizeDrawer() {
    var s = $('wlstage'); if (!s) return;
    s.style.maxWidth = '';
    // the lesson bar sticks to the top: the lab toolbar and the right pane start under it
    var lb = P.lessonbar(), top = 0;
    if (lb && narrow() && getComputedStyle(lb).display !== 'none') top = Math.round(lb.getBoundingClientRect().height);
    document.body.style.setProperty('--wl-top', top + 'px');
    if (!L.labmode || !narrow() || side()) return;
    var r = s.getBoundingClientRect(); if (!r.height) return;
    var room = window.innerHeight - r.bottom - 6;
    if (room < 300) {          // a short phone: a slightly smaller stage, so the drawer keeps a few lines of conversation
      var h = Math.max(150, window.innerHeight - r.top - 300 - 6);
      if (h < r.height) { s.style.maxWidth = Math.round(h * 4 / 3) + 'px'; r = s.getBoundingClientRect(); room = window.innerHeight - r.bottom - 6; }
    }
    P.chat.style.setProperty('--wl-dh', Math.max(240, Math.round(room)) + 'px');
  }
  /** A phone or a tablet held upright, or held sideways with the AI 學伴 pane closed: the zoom buttons go to the top
      right of the blocks area, with the reset button beside zoom-in (two rows, not three), so the floating 問 AI 學伴
      button (bottom right of the screen) does not cover them while the page scrolls. CSS translate adds to Blockly's
      own placement; elsewhere (a laptop, or the right pane open) Blockly's place is kept. */
  function placeZoom() {
    // the zoom-in, zoom-out and reset buttons (.blocklyZoom) share one parent group, which Blockly places
    var zb = pane.querySelector('#wlblocks .blocklyZoom'), z = zb && zb.parentNode, bl = $('wlblocks');
    if (!z || !bl || !z.getBoundingClientRect || /blocklyWorkspace|blocklySvg/.test(z.getAttribute('class') || '')) return;
    var zi = z.querySelector('.blocklyZoomIn'), rs = z.querySelector('.blocklyZoomReset');
    try {
      z.style.translate = ''; if (rs) rs.style.translate = '';
      if (!L.labmode || !narrow() || (side() && P.chat.classList.contains('open'))) return;
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
  function openPane() { P.chat.classList.add('open'); document.body.classList.add('chatopen'); parentFull(true); }
  function closePane() { P.chat.classList.remove('open'); document.body.classList.remove('chatopen'); }
  function parentFull(on) { try { if (window.parent !== window) window.parent.document.documentElement.classList.toggle('chatfull', on); } catch (e) {} }
  /** Scroll the page so that an element starts just under the sticky toolbar (narrow screens only). */
  function underBar(elm, onlyIfHidden) {
    if (!narrow() || !elm) return;
    try {
      var b = pane.querySelector('.wl-bar').getBoundingClientRect(), r = elm.getBoundingClientRect(), top = wlTop() + b.height + 6;
      if (onlyIfHidden && r.top >= top - 1 && r.bottom <= window.innerHeight + 1) return;
      window.scrollBy(0, Math.round(r.top - top));
    } catch (e) {}
  }
  /** After a change on a narrow screen: one tap shows the changed script. The drawer closes for it; the right pane
      stays, and there the chip is only offered when the blocks are below the screen (a phone held sideways). */
  function lookChip() {
    if (lookEl && lookEl.parentNode) lookEl.remove();
    if (side() && $('wlblocks').getBoundingClientRect().top < window.innerHeight - 100) return;
    lookEl = L.chat.chip('看看積木', 'wl-look', function () {
      lookEl = null;
      if (!side()) closePane();
      setTimeout(function () { underBar(pane.querySelector('.wl-codecol')); L.ro.showNew(); }, 30);
    });
  }

  /** The window and pane events the geometry above depends on. */
  function attach() {
    window.addEventListener('resize', function () {
      if (!L.labmode) return;
      if (L.studioOn) { L.studio.size(); return; }
      sizeDrawer(); L.ro.showEmpty(); placeZoom();
    });
    if (P.fab) P.fab.addEventListener('click', function () { if (L.labmode && !L.studioOn) setTimeout(sizeDrawer, 0); });
    // the AI 學伴 pane opens or closes (held sideways the 問 AI 學伴 button then shows or hides): place the zoom buttons again
    if (window.MutationObserver) new MutationObserver(function () { if (L.labmode && !L.studioOn) setTimeout(placeZoom, 0); })
      .observe(P.chat, { attributes: true, attributeFilter: ['class'] });
  }

  return {
    mountToggle: mountToggle, mountPane: mountPane, mountChat: mountChat, attach: attach,
    select: select, rove: rove, tell: tell, hush: hush, soon: soon, whenShown: whenShown, reveal: reveal,
    setHead: setHead, headText: headTextNow, setSendLabel: setSendLabel,
    explain: explain, unexplain: unexplain,
    sizeDrawer: sizeDrawer, stickyTop: stickyTop, placeZoom: placeZoom, openPane: openPane, closePane: closePane,
    parentFull: parentFull, underBar: underBar, lookChip: lookChip,
    get pane() { return pane; }, get bar() { return bar; }, get bMat() { return bMat; }, get bLab() { return bLab; },
    get note() { return note; }, get leftEl() { return leftEl; }, get barNote() { return barNote; }
  };
});
