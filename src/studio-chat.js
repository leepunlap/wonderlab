/*!
 * Wonder Lab Studio — the AI 學伴 pane, as a module.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS IS
 * The whole right-hand pane: header, message list, the R1 "thinking" state, the empty state and
 * the composer. It replaced the old pile of markup in index.html — a 48px header, a 36px tab strip,
 * a 232px model card, a 72px chip row and a 76px composer — which together took 464px of a 900px
 * column and left the conversation 436px. The conversation is the product; everything else here
 * exists to get out of its way.
 *
 * WHAT IT OWNS
 * - The pane's structure, and only the pane's structure: no ids, no page knowledge, no selectors
 *   into anyone else's DOM. Mount it anywhere by passing a container.
 * - Message rendering: student right, assistant left, notices centred.
 * - The R1 thinking state — a message state, not a control panel: 思考中… with a progress line,
 *   resolving in place into the answer with an optional collapsible 思考過程.
 * - The empty state (suggestion chips), which collapses for good once the student says something.
 * - The composer: an auto-growing input, one accessory slot (the model pill lives there), one
 *   secondary action (上一步) and one primary action (送出).
 * - An overflow menu and an overlay sheet, so 版本 / 說明 cost nothing until asked for.
 *
 * WHAT IT DOES NOT OWN
 * Sending anything. `onSend` belongs to the caller, and this module waits for it. Nor does it own
 * the version list, the about text, or the model list: those arrive as nodes and callbacks, which
 * is why the same pane can be mounted by the studio prototype and, later, by a lesson page.
 *
 *   var chat = StudioChat.create({
 *     mount: document.getElementById('wl-chat'),
 *     badge: '原型 · 模擬回覆',
 *     context: '送出時會附上：你的程式',
 *     chips: ['我想角色移動', '角色一直走'],
 *     menu: [{ id: 'versions', label: '版本記錄' }, { id: 'about', label: '說明' }],
 *     onSend: function (text) { return assist.send(text); },
 *     onMenu: function (id) {},
 *     onUndo: function () {}
 *   });
 *   chat.bot('你好！');
 *   chat.thinking('<think>…');      // R1: opens the 思考中 state
 *   chat.bot('先把「移動 10 步」拖進來');  // resolves it in place
 *
 * ES5, like the rest of the studio's own code: this ships to old browsers.
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var uid = 0;

  function noop() {}

  function h(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /** An inline icon, as the rest of the studio draws them (class "ic" carries the size). */
  function ic(paths, extra) {
    var s = doc.createElement('span');
    s.innerHTML = '<svg class="ic' + (extra ? ' ' + extra : '') + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      paths + '</svg>';
    return s.firstChild;
  }

  var ICON_BOT = '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>' +
    '<path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>';
  var ICON_MORE = '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/>' +
    '<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>' +
    '<circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>';
  var ICON_SEND = '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>';
  var ICON_BACK = '<path d="M15 18l-6-6 6-6"/>';
  var ICON_CHEV = '<path d="m6 9 6 6 6-6"/>';

  /** R1 wraps its reasoning in <think>…</think>; the student should never see the tags. */
  function cleanThinking(t) { return String(t || '').replace(/<\/?think>/g, '').trim(); }

  function create(cfg) {
    cfg = cfg || {};
    var onSend = cfg.onSend || noop;
    var onMenu = cfg.onMenu || noop;
    var onUndo = cfg.onUndo || noop;

    var busy = false;
    var pending = null;      // thinking text waiting for the answer that follows it
    var waiting = null;      // the 思考中… bubble, if one is on screen
    var empty = null;        // the suggestion chips; removed for good on the first send
    var uidn = ++uid;

    var shell = h('div', 'wl-chat-shell');

    /* ---------- header: 44px, and that is all the chrome the pane gets ---------- */
    var head = h('header', 'wl-chat-head');
    head.appendChild(ic(ICON_BOT));
    head.appendChild(h('h1', 'wl-chat-title', cfg.title || 'AI 學伴'));

    var badge = h('span', 'wl-chat-badge', cfg.badge || '');
    badge.hidden = !cfg.badge;
    head.appendChild(badge);
    head.appendChild(h('span', 'wl-head-spacer'));

    var verChip = h('button', 'wl-ver-chip', '');
    verChip.type = 'button';
    verChip.hidden = true;
    verChip.addEventListener('click', function () { onMenu('versions'); });
    head.appendChild(verChip);

    var more = h('button', 'wl-more-btn');
    more.type = 'button';
    more.setAttribute('aria-label', '更多');
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    more.appendChild(ic(ICON_MORE));
    head.appendChild(more);

    var menuBox = h('div', 'wl-menu');
    menuBox.setAttribute('role', 'menu');
    menuBox.hidden = true;
    shell.appendChild(head);

    // Only a pane that can be dismissed gets a dismiss button (the lesson page never offers one).
    if (cfg.onClose) {
      var closeBtn = h('button', 'wl-more-btn wl-close-btn');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', '收起 AI 學伴');
      closeBtn.appendChild(ic('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'));
      closeBtn.addEventListener('click', function () { cfg.onClose(); });
      head.appendChild(closeBtn);
    }

    function closeMenu() { menuBox.hidden = true; more.setAttribute('aria-expanded', 'false'); }
    function openMenu() {
      if (!menuItems.length) return;
      menuBox.hidden = false;
      more.setAttribute('aria-expanded', 'true');
      var first = menuBox.firstChild;
      if (first && first.focus) first.focus();
    }
    more.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menuBox.hidden) openMenu(); else closeMenu();
    });

    var menuItems = [];
    (cfg.menu || []).forEach(function (item) {
      var b = h('button', 'wl-menu-item');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.appendChild(h('span', 'wl-menu-label', item.label));
      if (item.badge) b.appendChild(h('span', 'wl-menu-badge', item.badge));
      b.addEventListener('click', function () { closeMenu(); onMenu(item.id); });
      menuBox.appendChild(b);
      menuItems.push(b);
    });
    shell.appendChild(menuBox);

    /* ---------- body: the conversation, and nothing else ---------- */
    var body = h('div', 'wl-chat-body');
    var msgs = h('div', 'wl-msgs');
    msgs.setAttribute('role', 'log');
    msgs.setAttribute('aria-live', 'polite');
    body.appendChild(msgs);

    if ((cfg.chips || []).length) {
      empty = h('div', 'wl-empty');
      empty.setAttribute('aria-label', '試試這樣說');
      cfg.chips.forEach(function (t) {
        var b = h('button', 'wl-chip', t);
        b.type = 'button';
        b.addEventListener('click', function () { input.value = t; grow(); input.focus(); });
        empty.appendChild(b);
      });
      body.appendChild(empty);
    }
    shell.appendChild(body);

    /* ---------- composer: one input, one accessory slot, one primary action ---------- */
    var comp = h('div', 'wl-composer');

    var ctx = h('p', 'wl-ctx', cfg.context || '');
    ctx.hidden = !cfg.context;
    comp.appendChild(ctx);

    var inputId = 'wl-chat-input-' + uidn;
    var srLabel = h('label', 'wl-sr', '你的想法');
    srLabel.setAttribute('for', inputId);
    comp.appendChild(srLabel);

    var input = h('textarea', 'wl-input');
    input.id = inputId;
    input.rows = 1;
    input.placeholder = cfg.placeholder || '說說你的想法，例如：按空白鍵時角色跳起';
    input.setAttribute('autocomplete', 'off');
    comp.appendChild(input);

    var row = h('div', 'wl-composer-row');
    var slot = h('span', 'wl-slot');
    row.appendChild(slot);
    row.appendChild(h('span', 'wl-spacer'));

    var undoBtn = h('button', 'wl-undo-btn', '上一步');
    undoBtn.type = 'button';
    undoBtn.hidden = true;
    undoBtn.addEventListener('click', function () { onUndo(); });
    row.appendChild(undoBtn);

    var sendBtn = h('button', 'wl-send');
    sendBtn.type = 'button';
    sendBtn.setAttribute('aria-label', '送出');
    sendBtn.appendChild(ic(ICON_SEND));
    row.appendChild(sendBtn);
    comp.appendChild(row);
    shell.appendChild(comp);

    /* ---------- the overlay sheet: 版本 / 說明, paid for only when opened ---------- */
    var sheet = h('div', 'wl-sheet');
    sheet.hidden = true;
    shell.appendChild(sheet);

    /** Put the pane into a container — an element or a selector. */
    function mountInto(into) {
      var host = typeof into === 'string' ? doc.querySelector(into) : into;
      if (!host) return null;
      while (host.firstChild) host.removeChild(host.firstChild);
      host.appendChild(shell);
      return shell;
    }

    if (cfg.mount) mountInto(cfg.mount);

    function closeSheet() { sheet.hidden = true; }
    function openSheet(title, node) {
      while (sheet.firstChild) sheet.removeChild(sheet.firstChild);
      var bar = h('div', 'wl-sheet-bar');
      var back = h('button', 'wl-sheet-back');
      back.type = 'button';
      back.setAttribute('aria-label', '返回');
      back.appendChild(ic(ICON_BACK));
      back.addEventListener('click', closeSheet);
      bar.appendChild(back);
      bar.appendChild(h('span', 'wl-sheet-title', title));
      sheet.appendChild(bar);
      var wrap = h('div', 'wl-sheet-body');
      if (node) wrap.appendChild(node);
      sheet.appendChild(wrap);
      sheet.hidden = false;
    }

    /* ---------- plumbing ---------- */
    function scroll() { body.scrollTop = body.scrollHeight; }

    function grow() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 110) + 'px';
    }

    function dismissEmpty() {
      if (empty && empty.parentNode) empty.parentNode.removeChild(empty);
    }

    function submit() {
      var t = (input.value || '').trim();
      if (!t || busy) return;
      input.value = '';
      grow();
      dismissEmpty();
      var r = onSend(t);
      if (r && typeof r.then === 'function') r.then(null, noop);
    }

    sendBtn.addEventListener('click', function (e) { e.preventDefault(); submit(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    input.addEventListener('input', grow);

    function addRow(kind, text) {
      var r = h('div', 'wl-mrow is-' + kind);
      var b = h('div', 'wl-bubble ' + kind);
      b.textContent = text || '';
      r.appendChild(b);
      msgs.appendChild(r);
      scroll();
      return r;
    }

    /** 思考中… — a state the answer later resolves into, so R1 never grows a control panel. */
    function startWaiting() {
      if (waiting) return waiting;
      var r = h('div', 'wl-mrow is-bot');
      var b = h('div', 'wl-bubble bot wl-waiting');
      b.appendChild(h('div', 'wl-waiting-label', '思考中…'));
      var track = h('div', 'wl-progress');
      track.appendChild(h('div', 'wl-progress-fill'));
      b.appendChild(track);
      r.appendChild(b);
      msgs.appendChild(r);
      scroll();
      waiting = { row: r, bubble: b };
      return waiting;
    }

    function resolveWaiting(text, isQ, think) {
      var r = waiting.row, b = waiting.bubble;
      waiting = null;
      b.className = 'wl-bubble ' + (isQ ? 'bot q' : 'bot');
      while (b.firstChild) b.removeChild(b.firstChild);
      if (text) b.appendChild(h('div', 'wl-answer', text));
      if (think) {
        var tg = h('button', 'wl-think-toggle');
        tg.type = 'button';
        tg.setAttribute('aria-expanded', 'false');
        var label = doc.createTextNode('顯示思考過程');
        tg.appendChild(label);
        tg.appendChild(ic(ICON_CHEV, 'wl-chev'));
        var tb = h('div', 'wl-think-body', think);
        tb.hidden = true;
        tg.addEventListener('click', function () {
          var open = tb.hidden;
          tb.hidden = !open;
          label.nodeValue = open ? '隱藏思考過程' : '顯示思考過程';
          tg.setAttribute('aria-expanded', String(open));
        });
        b.appendChild(tg);
        b.appendChild(tb);
      }
      scroll();
      return r;
    }

    return {
      el: shell,

      /** the student's own line. The empty state ends here, not at send time: the studio renders
          the student's message before it sends it, and a harness may add one without sending at
          all. Either way, once the student has spoken the suggestions have done their job. */
      user: function (text) {
        dismissEmpty();
        return addRow('me', text);
      },

      /** the assistant's line; resolves an open 思考中 state if there is one */
      bot: function (text, isQ) {
        if (waiting) {
          var think = pending; pending = null;
          return resolveWaiting(text, !!isQ, think);
        }
        var r = addRow(isQ ? 'q' : 'bot', text);
        if (pending) {
          var t = pending; pending = null;
          var b = r.firstChild;
          var body2 = h('div', 'wl-think-body', t);
          b.appendChild(body2);
        }
        return r;
      },

      /** notices that are not the assistant speaking */
      sys: function (text) { return addRow('sys', text); },

      /** R1 reasoning, arriving before the answer it belongs to */
      thinking: function (raw) {
        var t = cleanThinking(raw);
        if (!t) return null;
        pending = t;
        return startWaiting();
      },

      busy: function (on) {
        busy = !!on;
        input.disabled = busy;
        sendBtn.disabled = busy;
        if (!busy) input.focus();
      },

      setBadge: function (text) { badge.textContent = text || ''; badge.hidden = !text; },
      setContext: function (text) { ctx.textContent = text || ''; ctx.hidden = !text; },
      setVersionCount: function (n) {
        verChip.textContent = '版本 ' + n;
        verChip.hidden = !(n > 0);
      },
      /* 上一步 only exists once there is something to step back from: a greyed button beside 送出
         is a permanent reminder of a feature that is usually unavailable. */
      setUndoEnabled: function (on) { undoBtn.disabled = !on; undoBtn.hidden = !on; },

      /** where the model pill goes — the pane offers the slot and never looks inside it */
      setAccessory: function (node) {
        while (slot.firstChild) slot.removeChild(slot.firstChild);
        if (node) slot.appendChild(node);
      },

      openSheet: openSheet,
      closeSheet: closeSheet,
      focus: function () { input.focus(); },
      closeMenu: closeMenu,

      mount: mountInto,

      /** outside clicks close the overflow menu; the pane does not otherwise watch the document */
      bindOutside: function () {
        doc.addEventListener('click', function (e) {
          if (menuBox.hidden) return;
          if (!menuBox.contains(e.target) && !more.contains(e.target)) closeMenu();
        });
        doc.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') { closeMenu(); closeSheet(); }
        });
      }
    };
  }

  root.StudioChat = { create: create };
}(typeof window !== 'undefined' ? window : this));
