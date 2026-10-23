/*!
 * Wonder Lab — the lesson frame's binder.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS IS
 * lab-frame.html used to load studio-lab.js — 1,093 lines that were half editor and half lesson page.
 * The editor half is now studio-app.js (the shell) and the lesson model is lesson-page.js. This file
 * is what is left: the lesson page's own UI, mounted over the shell.
 *
 * THE LINE THIS FILE DRAWS
 * Everything here is the lesson page's and nothing else:
 *   · boot(lesson) - build the project from the lesson and hand it to the shell
 *   · the tools row (上一步 / export / AI 學伴) and the toast
 *   · the lock panes, and holding back hand edits while the AI is working
 * The shell knows nothing of lessons, the tools row or the lock: it is handed a project, an api url
 * and callbacks, exactly as docs/PORT-TO-PRODUCTION.md describes.
 *
 * WHAT IT MUST NOT DO: contain editor logic. If something here needs the VM, the shell should expose
 * it instead - that is the rule that keeps the next port from being a rewrite.
 */
(function (root) {
  'use strict';

  var doc = root.document;
  function $(id) { return doc.getElementById(id); }

  /** A short message that is never treated as markup. */
  function toast(msg, ms) {
    var t = doc.createElement('div');
    t.className = 'wl-toast';
    t.textContent = String(msg);
    doc.body.appendChild(t);
    var life = ms || (String(msg).length > 60 ? 9000 : 5000);
    setTimeout(function () { t.className = 'wl-toast out'; }, life);
    setTimeout(function () { try { t.parentNode.removeChild(t); } catch (e) {} }, life + 400);
  }

  /** The lesson's own notice line under the tools. */
  function toolNote(text) {
    var el = $('wl-toolnote');
    if (!el) return;
    if (!text) { el.hidden = true; return; }
    el.textContent = String(text);
    el.hidden = false;
  }

  /**
   * Show a tool only when it can do something.
   *
   * The lesson page sets these from across the frame (上一步 once there is something to undo, the
   * AI 學伴 button when it wants the drawer, and a turn in flight which disables both), so the
   * state is kept: each call adds to the last rather than replacing it.
   */
  var toolState = { undo: false, chat: false, busy: false };
  function setTools(opt) {
    opt = opt || {};
    Object.keys(opt).forEach(function (k) { toolState[k] = opt[k]; });
    var u = $('wl-tool-undo'), c = $('wl-tool-chat');
    if (u) u.disabled = !toolState.undo || !!toolState.busy;
    if (c) c.hidden = !toolState.chat;
  }

  /** The lock panes: two bars over the editor and the stage, plus body.wl-locked. */
  function lockPanes(on, text) {
    var a = $('wl-lock-a'), b = $('wl-lock-b'), m = $('wl-lockmsg');
    if (a) a.hidden = !on;
    if (b) b.hidden = !on;
    if (m) { m.hidden = !on; if (text) $('wl-locktext').textContent = text; }
    doc.body.classList.toggle('wl-locked', !!on);
  }

  function create(cfg) {
    cfg = cfg || {};
    var S = null, booted = null, ctrlHeld = false;

    /**
     * The four things the lesson page listens for (lab.js's onStudio): change (save), run (the
     * 助教 appears after a hand run), undo (上一步) and chat (open the AI pane).
     *
     * They are the page's business, not the frame's, so they go out through the onEvent callback
     * the page handed to boot() — the same way studio-lab.js did it. lab-frame.html's
     * parent.postMessage is not heard by anything; it was left in as a guess and never answered.
     */
    var onEvent = null;
    function emit(type, data) { try { if (onEvent) onEvent(type, data || null); } catch (e) {} }

    /** Build the shell once; later boots reload the lesson into it. */
    function shell() {
      if (!S) {
        S = root.StudioApp.create({
          root: '#wl-editor',
          library: false,                 // a lesson shows the curated surface, not the whole library
          locale: cfg.locale || 'zh-tw',
          ucmake: true,
          ui: {
            sys: function (t) { toast(t); },
            fail: function (kind, msg) { toast(msg); },
            busy: function () {}
          },
          onLoaded: function (s) { setTools({ undo: false, chat: !!cfg.chat }); },
          onRun: function () { emit('run', { what: 'start' }); },
          onProjectChanged: function () { emit('change'); }
        });
        // Keep the shell's own boot. lab-frame.html replaces WLStudio.boot with the lesson-facing one
        // below, and if the binder then called `S.boot` it would call itself - which is exactly what
        // it did the first time, and the editor simply never came up.
        S._shellBoot = S.boot;
        root.WLStudio = S;
        /* The lesson page calls these three on WLStudio. studio-lab.js answered them; the split
           left the calls with nowhere to land, so a page that said 「上一步 可以用了」 was writing
           to a method that did not exist. They belong here because the buttons are this page's. */
        S.setTools = function (opt) {
          opt = opt || {};
          setTools({ undo: !!opt.undo, chat: !!(opt.drawer || opt.chat), busy: !!opt.busy });
        };
        S.toolNote = toolNote;
      }
      return S;
    }

    /**
     * boot(lesson) - what the lesson page calls across the frame.
     *
     * The lesson becomes a project here, through LessonPage.project, so the shell is never told what
     * a lesson is. A second boot with a different lesson reloads the project into the same shell.
     */
    function boot(c) {
      c = c || {};
      if (typeof c.onEvent === 'function') onEvent = c.onEvent;
      var s = shell();
      if (!root.LessonPage) {
        toast('lesson-page.js 未載入：無法建立課程');
        return Promise.reject(new Error('LessonPage missing'));
      }
      var project = root.LessonPage.project(c.lesson || { stage: { backdrops: [] }, sprites: [] });
      if (c.api) s.api = c.api;
      // assetBase: where the lesson's own costumes and sounds live. studio-lab.js's boot took it and
      // test/anim_labframe.py still passes it, so the shell is told rather than left to guess.
      if (c.assetBase) s.libraryUrl = c.assetBase;
      if (booted) {
        // already running: replace the project rather than mounting a second editor
        return s.loadState({ project: JSON.stringify(project), sids: {}, hand: 0, assets: {} });
      }
      booted = true;
      return s._shellBoot({ project: project, api: c.api, library: false }).then(function () {
        /* The buttons are wired before a program is restored, not after: a lesson reopened onto the
           student's last program used to return early and leave 上一步 and AI 學伴 dead. */
        var undo = $('wl-tool-undo');
        if (undo) undo.addEventListener('click', function () {
          /* 上一步 is the lesson page's when there is a page: it holds the project from before the
             turn and says so in the conversation. The shell's own version history is the fallback
             for a frame with nobody listening. */
          if (onEvent) { emit('undo'); return; }
          var v = s.undo();
          if (v) s.restoreVersion(v, '回到 AI 上一次改動之前');
        });
        var chat = $('wl-tool-chat');
        if (chat) chat.addEventListener('click', function () {
          if (onEvent) { emit('chat'); return; }
          if (cfg.onChat) cfg.onChat(s);
        });
        setTools({ undo: false, chat: !!cfg.chat });
        // a program to open on top of the lesson's project (the page restores one from the last turn)
        if (c.program) return s.loadProgram(c.program).then(function () { return s; });
        return s;
      });
    }

    /**
     * The lock the lesson page drives: while an AI turn is in flight the editor is covered and hand
     * edits are held back. The panes are this page's; the state is the shell's.
     */
    function lock(on, text) {
      ctrlHeld = !!on;
      var s = shell();
      s.lock(on);
      lockPanes(on, text);
      return on;
    }

    return {
      boot: boot,
      lock: lock,
      isLocked: function () { return ctrlHeld; },
      toast: toast,
      toolNote: toolNote,
      setTools: setTools,
      shell: shell,
      get S() { return S; }
    };
  }

  root.LessonFrame = { create: create, toast: toast, toolNote: toolNote, setTools: setTools, lockPanes: lockPanes };
}(typeof window !== 'undefined' ? window : this));
