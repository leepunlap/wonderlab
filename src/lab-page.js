/*!
 * Wonder Lab — the page contract: the ONE place that knows what the parent page must look like.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 (see LICENSE).
 *
 * Everything the lab needs from the page it is dropped into, and nothing else:
 *
 *   #chat[data-ep]          the AI 學伴 pane; data-ep is the lesson id the lab APIs are addressed with
 *   .chhead                 its head — the mode toggle goes just under it, and its <small> carries the head line
 *   #chbody                 the normal Q&A body; the lab conversation is inserted as its next sibling (#wlbody)
 *   #chform #chin #chsend   the box; in lab mode the lab intercepts this form (lab-chat.js, capture phase)
 *   #chcaps                 the caps box; the "turns left" line goes in it (lab-mode.js)
 *   .chfab                  the narrow-screen "問 AI 學伴" button (lab-ui.js)
 *   .chclose                its close button (lab-ui.js)
 *   .lessonbar              the sticky lesson bar the toolbar and the right pane start under (lab-ui.js)
 *   main.wrap               the lesson body; the lab pane is inserted as its next sibling (lab-ui.js)
 *
 * The deployed L4 lesson pages have all of it (and test/browser_test_labhost.mjs stands one up). A page that merely
 * WANTS a lab — examples/standalone/index.html, src/standalone.js — asks for `shell: true` and this module builds
 * the same contract inside a container of its own. That is why the old hard `/(^|\/)L4\/lessons\//` test on data-ep
 * is gone: WHICH pages may mount is now an option (`lessonPath`), and a page that is not a lesson page passes
 * `lessonPath: null`.
 *
 * The instance returned here is the single contract object the whole lab reads (lab-core.js's WLR.require('page')),
 * filled in by mount(); there is no second copy of "#chin" anywhere in src/.
 *
 * ES5 on purpose (see lab-core.js).
 */
WLR.define('page', function () {
  'use strict';

  // The default rule, kept exactly as it was: only an L4 lesson page carries a lab. It is a default now, not a law —
  // src/standalone.js and any page that opts in pass lessonPath: null (or their own pattern).
  var LESSON_PATH = /(^|\/)L4\/lessons\//;

  function attr(script, name) {
    try { return (script && script.getAttribute && script.getAttribute(name)) || null; } catch (e) { return null; }
  }
  function asElement(v) {
    if (!v) return null;
    if (typeof v === 'string') { try { return document.querySelector(v); } catch (e) { return null; } }
    return v && v.nodeType === 1 ? v : null;
  }
  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /** The shell: the same contract a lesson page already has, built for a page that has none. */
  function buildShell(container, ep) {
    var layout = mk('div', 'layout'), main = mk('main', 'wrap'), chat = mk('aside', 'chat');
    chat.id = 'chat'; chat.setAttribute('data-ep', ep);
    var head = mk('div', 'chhead');
    head.appendChild(mk('b', null, 'Wonder Lab'));
    head.appendChild(mk('small', null, '照你的想法砌積木，一起試、一起看'));
    var close = mk('button', 'chclose', '×'); close.type = 'button'; close.setAttribute('aria-label', '關閉');
    head.appendChild(close);
    chat.appendChild(head);
    var caps = mk('div', 'chcaps'); caps.id = 'chcaps'; chat.appendChild(caps);
    var cbody = mk('div', 'chbody'); cbody.id = 'chbody'; chat.appendChild(cbody);
    var form = mk('form', 'chform'); form.id = 'chform';
    var input = mk('textarea'); input.id = 'chin'; input.rows = 1;
    input.setAttribute('placeholder', '輸入你的問題…'); input.setAttribute('aria-label', '問 AI 學伴');
    var send = mk('button', null, '問'); send.id = 'chsend'; send.type = 'submit';
    form.appendChild(input); form.appendChild(send); chat.appendChild(form);
    var fab = mk('div', 'chfab', '問 AI 學伴'); fab.id = 'chfab'; chat.appendChild(fab);
    layout.appendChild(main); layout.appendChild(chat);
    (asElement(container) || document.body).appendChild(layout);
    return chat;
  }

  var P = {
    LESSON_PATH: LESSON_PATH,
    mount: mount,
    chat: null, ep: '', slug: '', base: '', host: null, manifestUrl: '',
    head: null, chbody: null, form: null, input: null, send: null, fab: null, capsBox: null, closeBtn: null, mainEl: null,
    matPlaceholder: '', sendLabel: '問',
    startInLab: null,                     // true = open in Wonder Lab at once; null/false = the page's own memory decides
    lessonbar: function () { return document.querySelector('.lessonbar'); }
  };

  /** Resolve the contract on this page. Returns false when this page is not (and did not ask to be) a lab page. */
  function mount(cfg) {
    var c = cfg || {}, script = c.script || (document.currentScript || null);
    var chat = asElement(c.chat) || document.getElementById('chat');
    var ep = c.ep || (chat && chat.getAttribute('data-ep')) || null;
    var path = c.lessonPath === undefined ? LESSON_PATH : c.lessonPath;
    if (!ep && !c.shell) return false;
    if (chat && !ep) return false;
    if (ep && path && !path.test(ep)) return false;      // the old hard test, now an option (see the header)
    if (!chat) {
      if (!c.shell) return false;
      chat = buildShell(c.container, ep);
    }
    var input0 = document.getElementById('chin'), send0 = document.getElementById('chsend');
    var me = (c.base ? null : (script && script.src)) || null;
    P.chat = chat;
    P.ep = ep;
    P.slug = String(ep).split('/').pop();
    P.base = c.base || (me ? me.slice(0, me.lastIndexOf('/') + 1).replace(/\?.*$/, '') : new URL('../assets/lab/', location.href).href);
    P.host = c.host !== undefined ? c.host : (window.WonderLabHost || null);
    P.manifestUrl = c.manifest || (P.base + 'manifest.json');
    P.head = chat.querySelector('.chhead');
    P.chbody = document.getElementById('chbody');
    P.form = document.getElementById('chform');
    P.input = input0;
    P.send = send0;
    P.fab = document.getElementById('chfab');
    P.capsBox = document.getElementById('chcaps');
    P.closeBtn = chat.querySelector('.chclose');
    P.mainEl = document.querySelector('.layout > main.wrap') || document.querySelector('main.wrap');
    P.matPlaceholder = (input0 && input0.getAttribute('placeholder')) || '輸入你的問題…';
    P.sendLabel = send0 ? send0.textContent : '問';
    P.startInLab = c.start === 'lab' ? true : (c.start === 'material' ? false : null);
    return true;
  }

  return P;
});
