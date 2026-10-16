/*!
 * Wonder Lab — the lab conversation: the second history, in the AI 學伴 pane, and the form that feeds it.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 (see LICENSE).
 *
 * The lab keeps its own transcript (#wlbody) beside the normal Q&A (#chbody). chat.js knows nothing about any of
 * this and this file never touches chat.js:
 *   · a lab chip has its own class (wl-chip, not chat.js's .sq) and stops its own clicks, so chat.js never sends a
 *     chip as a question and never disables one when the Q&A is capped;
 *   · in lab mode the box belongs to the lab, and the form event is taken in the CAPTURE phase, so chat.js never
 *     sees the submit at all.
 *
 * ES5 on purpose (see lab-core.js).
 */
WLR.define('chat', function (L, req) {
  'use strict';
  var C = req('core'), P = req('page');

  var body = null;                 // #wlbody, created by mount()

  /** Build the lab transcript beside the page's own Q&A body. */
  function mount() {
    if (body) return body;
    body = C.el('div', 'chbody wl-chbody');
    body.id = 'wlbody'; body.hidden = true; body.setAttribute('aria-live', 'polite');
    if (P.chbody && P.chbody.parentNode) P.chbody.parentNode.insertBefore(body, P.chbody.nextSibling);
    else P.chat.appendChild(body);
    return body;
  }

  function add(cls, text) {
    var d = C.el('div', 'msg ' + cls);
    d.textContent = text;
    body.appendChild(d); body.scrollTop = body.scrollHeight;
    return d;
  }
  function replay(hist) {
    (hist || []).forEach(function (m) { if (m && typeof m.content === 'string') add(m.role === 'user' ? 'me' : 'bot', m.content); });
  }
  function toEnd() { if (body) body.scrollTop = body.scrollHeight; }

  /** A chip in the lab conversation: its own class (wl-chip, styled like the Q&A chips). See the header. */
  function chip(text, cls, fn) {
    var c = C.el('div', 'sqs' + (cls ? ' ' + cls : '')), b = C.el('button', 'wl-chip');
    b.type = 'button'; b.textContent = text; c.appendChild(b); body.appendChild(c); body.scrollTop = body.scrollHeight;
    b.onclick = function (e) { e.stopPropagation(); c.remove(); fn(); };
    return c;
  }

  /** In lab mode the chat form belongs to the lab (chat.js never sees the event). */
  function attach() {
    document.addEventListener('submit', function (e) {
      if (!L.labmode || e.target !== P.form) return;
      e.preventDefault(); e.stopImmediatePropagation(); L.mode.sendLab();
    }, true);
    document.addEventListener('keydown', function (e) {
      if (!L.labmode || e.target !== P.input) return;
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopImmediatePropagation(); L.mode.sendLab(); }
    }, true);
  }

  return { mount: mount, add: add, replay: replay, chip: chip, attach: attach, toEnd: toEnd,
           get body() { return body; } };
});
