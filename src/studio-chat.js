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
 * - Every word it renders. Since it owns the words, it also owns re-rendering them when the
 *   language changes: pass `i18n` (StudioI18n), and the pane re-labels itself in place — the
 *   conversation stays, which is the point of switching language mid-lesson rather than reloading.
 *
 * WHAT IT DOES NOT OWN
 * Sending anything. `onSend` belongs to the caller, and this module waits for it. Nor does it own
 * the version list, the about text, or the model list: those arrive as nodes and callbacks, which
 * is why the same pane can be mounted by the studio prototype and, later, by a lesson page.
 *
 *   var chat = StudioChat.create({
 *     mount: document.getElementById('wl-chat'),
 *     i18n: StudioI18n,                     // optional: without it the pane renders keys
 *     chips: ['chat.chips'],                // or a literal array of strings
 *     menu: [{ id: 'versions', labelKey: 'chat.menu.versions' }],
 *     onSend: function (text) { return assist.send(text); },
 *     onMenu: function (id) {},
 *     onUndo: function () {}
 *   });
 *   chat.bot(t('chat.greeting'));
 *   chat.thinking('<think>…');      // R1: opens the 思考中 state
 *   chat.bot('…');                  // resolves it in place
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

  /**
   * The one or two characters the header pill can afford: 繁 / 简 / EN. Derived from the label the
   * locale registered, not from the locale code, so a new language file needs no change here.
   */
  function shortLang(label) {
    var s = String(label || '');
    return /^[\u3400-\u9fff]/.test(s) ? s.charAt(0) : s.slice(0, 2).toUpperCase();
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

    /* The pane never branches on a language code. It asks for keys and is handed text; when the
       language changes it asks again. `i18n.t` returns the key when nothing is registered, which
       is why a module mounted without it shows `chat.send` rather than an empty button. */
    var i18n = cfg.i18n || (root.StudioI18n && typeof root.StudioI18n.t === 'function' ? root.StudioI18n : null);
    function T(key, params) { return i18n ? i18n.t(key, params) : key; }

    var busy = false;
    var pending = null;      // thinking text waiting for the answer that follows it
    var waiting = null;      // the 思考中… bubble, if one is on screen
    var empty = null;        // the suggestion chips; removed for good on the first send
    var chipsOn = false;
    var badgeKey = cfg.badgeKey || null;
    var versionN = 0;
    var sheetTitle = null;   // the key (or literal) the open sheet was given
    var thinkToggles = [];   // every reasoning toggle on screen, so a language change can relabel them
    var uidn = ++uid;

    var shell = h('div', 'wl-chat-shell');

    /* ---------- header: 44px, and that is all the chrome the pane gets ---------- */
    var head = h('header', 'wl-chat-head');
    head.appendChild(ic(ICON_BOT));
    var titleEl = h('h1', 'wl-chat-title', cfg.title || T('chat.title'));
    head.appendChild(titleEl);

    var badge = h('span', 'wl-chat-badge', cfg.badge || (badgeKey ? T(badgeKey) : ''));
    badge.hidden = !(cfg.badge || badgeKey);
    head.appendChild(badge);
    head.appendChild(h('span', 'wl-head-spacer'));

    var verChip = h('button', 'wl-ver-chip', '');
    verChip.type = 'button';
    verChip.hidden = true;
    verChip.addEventListener('click', function () { onMenu('versions'); });
    head.appendChild(verChip);

    // Language sits in the header, not behind ⋯. It was in the menu, on the argument that a student
    // touches it once; the argument was wrong — a teacher looking for it never opened the menu at all.
    // One pill, showing the language the pane is currently in, so the answer is visible without a
    // click as well.
    var langBtn = null;
    if (i18n && typeof i18n.available === 'function' && i18n.available().length > 1) {
      langBtn = h('button', 'wl-lang-toggle');
      langBtn.type = 'button';
      langBtn.setAttribute('aria-haspopup', 'true');
      langBtn.setAttribute('aria-expanded', 'false');
      langBtn.appendChild(h('span', 'wl-lang-short', ''));
      langBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleLang(); });
      head.appendChild(langBtn);
    }

    var more = h('button', 'wl-more-btn');
    more.type = 'button';
    more.setAttribute('aria-label', T('chat.more'));
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    more.appendChild(ic(ICON_MORE));
    head.appendChild(more);

    var menuBox = h('div', 'wl-menu');
    menuBox.setAttribute('role', 'menu');
    menuBox.hidden = true;
    shell.appendChild(head);

    // Only a pane that can be dismissed gets a dismiss button (the lesson page never offers one).
    var closeBtn = null;
    if (cfg.onClose) {
      closeBtn = h('button', 'wl-more-btn wl-close-btn');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', T('chat.collapse'));
      closeBtn.appendChild(ic('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'));
      closeBtn.addEventListener('click', function () { cfg.onClose(); });
      head.appendChild(closeBtn);
    }

    // The two popovers are siblings under the same header triangle; opening one closes the other,
    // so a student never ends up with ⋯ and the language list open on top of each other.
    function closeMenu() { menuBox.hidden = true; more.setAttribute('aria-expanded', 'false'); }
    function openMenu() {
      if (!menuItems.length) return;
      if (typeof closeLang === 'function') closeLang();
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
      var label = h('span', 'wl-menu-label', item.labelKey ? T(item.labelKey) : item.label);
      b.appendChild(label);
      if (item.badge) b.appendChild(h('span', 'wl-menu-badge', item.badge));
      b.addEventListener('click', function () { closeMenu(); onMenu(item.id); });
      menuBox.appendChild(b);
      menuItems.push({ node: b, label: label, key: item.labelKey || null, text: item.label });
    });
    shell.appendChild(menuBox);

    /**
     * The popover under the header pill. Built from StudioI18n's registry, so adding a language file
     * adds a row here with no change to this module — and the pill relabels itself from the same
     * registry, which is why nothing in this file names a locale.
     */
    var langGroup = null;
    var langPop = null;
    if (langBtn) {
      langPop = h('div', 'wl-lang-pop');
      langPop.hidden = true;
      langGroup = h('div', 'wl-lang');
      langGroup.setAttribute('role', 'group');
      langGroup.setAttribute('aria-label', T('chat.language'));
      i18n.available().forEach(function (loc) {
        var b = h('button', 'wl-lang-btn', loc.label);
        b.type = 'button';
        b.setAttribute('data-locale', loc.id);
        b.setAttribute('data-label', loc.label);
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          i18n.set(loc.id);
          closeLang();
        });
        langGroup.appendChild(b);
      });
      langPop.appendChild(langGroup);
      shell.appendChild(langPop);
      markLang();
    }

    function toggleLang() {
      if (!langPop) return;
      var opening = langPop.hidden;
      if (opening) closeMenu();
      langPop.hidden = !opening;
      langBtn.setAttribute('aria-expanded', String(opening));
      if (opening) {
        var on = langGroup.querySelector('.wl-lang-btn.is-on');
        if (on) on.focus();
      }
    }

    function closeLang() {
      if (!langPop || langPop.hidden) return;
      langPop.hidden = true;
      langBtn.setAttribute('aria-expanded', 'false');
    }

    /** Which of the three is current — needed on first paint, not only after a switch. */
    function markLang() {
      if (!langGroup) return;
      var code = i18n.locale();
      var btns = langGroup.querySelectorAll('.wl-lang-btn');
      var label = code;
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i].getAttribute('data-locale') === code;
        btns[i].className = 'wl-lang-btn' + (on ? ' is-on' : '');
        btns[i].setAttribute('aria-pressed', String(on));
        if (on) label = btns[i].getAttribute('data-label') || code;
      }
      var short = langBtn && langBtn.firstChild;
      if (short) short.textContent = shortLang(label);
      if (langBtn) langBtn.setAttribute('aria-label', T('chat.language') + '：' + label);
    }

    /* ---------- body: the conversation, and nothing else ---------- */
    var body = h('div', 'wl-chat-body');
    var msgs = h('div', 'wl-msgs');
    msgs.setAttribute('role', 'log');
    msgs.setAttribute('aria-live', 'polite');
    body.appendChild(msgs);

    /* A caller that supplies its own chips (a lesson's own prompts) overrides the translated
       defaults permanently. Resolved per render, not captured at create time - otherwise the
       suggestions keep the language the pane was built in. */
    var customChips = cfg.chips || null;

    function chipList() {
      var list = customChips || T('chat.chips');
      if (typeof list === 'string') list = [list];
      return list || [];
    }

    function buildChips() {
      var list = chipList();
      if (!list.length) return null;
      var box = h('div', 'wl-empty');
      box.setAttribute('aria-label', T('chat.trySaying'));
      list.forEach(function (c) {
        var label = c.indexOf('chat.') === 0 ? T(c) : c;
        var b = h('button', 'wl-chip', label);
        b.type = 'button';
        b.addEventListener('click', function () { input.value = label; grow(); input.focus(); });
        box.appendChild(b);
      });
      return box;
    }

    if (chipList().length) {
      empty = buildChips();
      chipsOn = true;
      body.appendChild(empty);
    }
    shell.appendChild(body);

    /* ---------- composer: one input, one accessory slot, one primary action ---------- */
    var comp = h('div', 'wl-composer');

    var ctx = h('p', 'wl-ctx', cfg.context || '');
    ctx.hidden = !cfg.context;
    comp.appendChild(ctx);

    var inputId = 'wl-chat-input-' + uidn;
    var srLabel = h('label', 'wl-sr', T('chat.yourIdea'));
    srLabel.setAttribute('for', inputId);
    comp.appendChild(srLabel);

    var input = h('textarea', 'wl-input');
    input.id = inputId;
    input.rows = 1;
    input.placeholder = T('chat.placeholder');
    input.setAttribute('autocomplete', 'off');
    comp.appendChild(input);

    var row = h('div', 'wl-composer-row');
    var slot = h('span', 'wl-slot');
    row.appendChild(slot);
    row.appendChild(h('span', 'wl-spacer'));

    var undoBtn = h('button', 'wl-undo-btn', T('chat.undo'));
    undoBtn.type = 'button';
    undoBtn.hidden = true;
    undoBtn.addEventListener('click', function () { onUndo(); });
    row.appendChild(undoBtn);

    var sendBtn = h('button', 'wl-send');
    sendBtn.type = 'button';
    sendBtn.setAttribute('aria-label', T('chat.send'));
    sendBtn.appendChild(ic(ICON_SEND));
    row.appendChild(sendBtn);
    comp.appendChild(row);
    shell.appendChild(comp);

    /* ---------- the overlay sheet: 版本 / 說明, paid for only when opened ---------- */
    var sheet = h('div', 'wl-sheet');
    sheet.hidden = true;
    shell.appendChild(sheet);
    var sheetTitleEl = null;

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
      sheetTitle = title;
      while (sheet.firstChild) sheet.removeChild(sheet.firstChild);
      var bar = h('div', 'wl-sheet-bar');
      var back = h('button', 'wl-sheet-back');
      back.type = 'button';
      back.setAttribute('aria-label', T('chat.back'));
      back.appendChild(ic(ICON_BACK));
      back.addEventListener('click', closeSheet);
      bar.appendChild(back);
      sheetTitleEl = h('span', 'wl-sheet-title', T(title));
      bar.appendChild(sheetTitleEl);
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
      chipsOn = false;
      if (empty && empty.parentNode) empty.parentNode.removeChild(empty);
      empty = null;
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
      var label = h('div', 'wl-waiting-label', T('chat.thinking'));
      b.appendChild(label);
      var track = h('div', 'wl-progress');
      track.appendChild(h('div', 'wl-progress-fill'));
      b.appendChild(track);
      r.appendChild(b);
      msgs.appendChild(r);
      scroll();
      waiting = { row: r, bubble: b, label: label };
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
        var label = doc.createTextNode(T('chat.showReasoning'));
        tg.appendChild(label);
        tg.appendChild(ic(ICON_CHEV, 'wl-chev'));
        var tb = h('div', 'wl-think-body', think);
        tb.hidden = true;
        var entry = { label: label, body: tb, btn: tg };
        thinkToggles.push(entry);
        tg.addEventListener('click', function () {
          var open = tb.hidden;
          tb.hidden = !open;
          entry.open = open;
          label.nodeValue = open ? T('chat.hideReasoning') : T('chat.showReasoning');
          tg.setAttribute('aria-expanded', String(open));
        });
        b.appendChild(tg);
        b.appendChild(tb);
      }
      scroll();
      return r;
    }

    /**
     * Re-read every string the pane is currently showing. Called once, from the locale subscription:
     * mutating text nodes rather than rebuilding the shell is what keeps the conversation, the open
     * sheet and the student's half-typed sentence alive across a language change.
     */
    function refresh() {
      titleEl.textContent = cfg.title || T('chat.title');
      more.setAttribute('aria-label', T('chat.more'));
      if (closeBtn) closeBtn.setAttribute('aria-label', T('chat.collapse'));
      srLabel.textContent = T('chat.yourIdea');
      input.placeholder = T('chat.placeholder');
      undoBtn.textContent = T('chat.undo');
      sendBtn.setAttribute('aria-label', T('chat.send'));
      if (badgeKey) badge.textContent = T(badgeKey);
      if (versionN) verChip.textContent = T('chat.versionN', { n: versionN });
      if (sheetTitle && sheetTitleEl) sheetTitleEl.textContent = T(sheetTitle);

      menuItems.forEach(function (it) {
        if (it.key) it.label.textContent = T(it.key);
      });
      if (langGroup) {
        langGroup.setAttribute('aria-label', T('chat.language'));
        markLang();
      }

      // the empty state is rebuilt rather than relabelled: its chips are buttons whose width
      // depends on the text, and English chips are twice the length of the Chinese ones
      if (chipsOn) {
        var fresh = buildChips();
        if (fresh) {
          if (empty && empty.parentNode) empty.parentNode.replaceChild(fresh, empty);
          else body.appendChild(fresh);
          empty = fresh;
        }
      }

      if (waiting) waiting.label.textContent = T('chat.thinking');
      thinkToggles.forEach(function (e) {
        e.label.nodeValue = e.open ? T('chat.hideReasoning') : T('chat.showReasoning');
      });
    }

    // The subscription is the whole of the live-switch story: no reload, no replayed conversation.
    if (i18n && typeof i18n.on === 'function') i18n.on(refresh);

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

      /** a badge that follows the language: pass the key, not the text */
      setBadgeKey: function (key) {
        badgeKey = key || null;
        badge.textContent = badgeKey ? T(badgeKey) : '';
        badge.hidden = !badgeKey;
      },
      /** a badge that does not: pass text and it stays exactly as given */
      setBadge: function (text) {
        badgeKey = null;
        badge.textContent = text || '';
        badge.hidden = !text;
      },
      setContext: function (text) { ctx.textContent = text || ''; ctx.hidden = !text; },
      setVersionCount: function (n) {
        versionN = n || 0;
        verChip.textContent = T('chat.versionN', { n: versionN });
        verChip.hidden = !(versionN > 0);
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
      refresh: refresh,

      mount: mountInto,

      /** outside clicks close the pane's popovers; it does not otherwise watch the document */
      bindOutside: function () {
        doc.addEventListener('click', function (e) {
          if (!menuBox.hidden && !menuBox.contains(e.target) && !more.contains(e.target)) closeMenu();
          if (langPop && !langPop.hidden && !langPop.contains(e.target) && !langBtn.contains(e.target)) closeLang();
        });
        doc.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') { closeMenu(); closeLang(); closeSheet(); }
        });
      }
    };
  }

  root.StudioChat = { create: create };
}(typeof window !== 'undefined' ? window : this));
