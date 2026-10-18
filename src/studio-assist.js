/*!
 * Wonder Lab Studio — the AI assistant, as a module.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS IS
 * The half of the editor that turns a sentence into blocks: build the turn's context, ask the
 * service, apply the ops it returns, and show the student which blocks changed. It is the piece
 * that was written twice — once in studio.js for the prototype page and once, differently, for the
 * lesson pages — which is why a fix to one never reached the other.
 *
 * WHAT IT DELIBERATELY DOES NOT OWN
 * The pane. No DOM, no ids, no classes, no wording. A caller passes four callbacks and gets the
 * behaviour; the prototype's chat bubble and the lesson's AI pane are free to look nothing alike,
 * because they are different products. Also not owned: the version history (a caller's concern —
 * `recordVersion` is a callback) and the ops application itself (window.StudioOps, unchanged).
 *
 *   var assist = StudioAssist.create({
 *     vm: vm, api: '/api/ai/lab/studio', ops: window.StudioOps, trace: trace,
 *     place: place,                       // (target, n) -> position the nth stack
 *     workspace: function () {...},       // Blockly workspace, for the highlight
 *     history: [],                        // the conversation, owned by the caller
 *     ui: {
 *       user:  function (text) {},        // the student's line
 *       bot:   function (text, isQuestion) {},
 *       sys:   function (text) {},        // notices that are not the assistant speaking
 *       busy:  function (on) {},
 *       source:function (src) {},         // 'stub' | 'deepseek' — so the pane can say which
 *       record:function (kind, label, extra) {}   // >> a version entry
 *     }
 *   });
 *   assist.send('角色向前行十步');
 *
 * ES5, like the rest of the studio's own code: this ships to old browsers.
 */
(function (root) {
  'use strict';

  var STAGE = '舞台';

  function noop() {}

  function create(cfg) {
    cfg = cfg || {};
    var vm = cfg.vm;
    var ui = cfg.ui || {};
    var ops = cfg.ops || (root.StudioOps);
    var trace = cfg.trace || null;
    var api = cfg.api || '/api/ai/lab/studio';
    var place = cfg.place || noop;
    var workspace = cfg.workspace || noop;
    var history = cfg.history || [];

    // The animated build, if the page has one. studio-anim.js performs the edit visibly on the
    // gui's own workspace; it is PRESENTATION, so a failure here must never cost the student their
    // turn - anything other than a clean `ok` falls back to applying the ops instantly.
    var animate = cfg.animate || null;
    var animBudget = cfg.animBudget || 8000;

    var busy = false;
    var applying = false;
    var lastAIProgram = null;
    var note = null;
    var undoTo = null;

    var onUser = ui.user || noop;
    var onBot = ui.bot || noop;
    var onSys = ui.sys || noop;
    var onBusy = ui.busy || noop;
    var onSource = ui.source || noop;
    var record = ui.record || noop;

    /** What the service is told about the stage: who is on it, where, and what they look like. */
    function targetsInfo() {
      return vm.runtime.targets.filter(function (t) { return t.isOriginal; }).map(function (t) {
        return {
          name: t.isStage ? STAGE : t.getName(),
          isStage: t.isStage,
          costumes: t.getCostumes().map(function (c) { return c.name; }),
          x: Math.round(t.x || 0), y: Math.round(t.y || 0), visible: t.visible !== false
        };
      });
    }

    /** Flash the blocks this turn changed, and bring the first one into view. */
    function highlight(done) {
      var ws = workspace();
      if (!ws || !done) return;
      var first = null;
      done.forEach(function (x) {
        if (!x.top || x.target !== vm.editingTarget) return;
        var b = ws.getBlockById(x.top);
        if (!b) return;
        var el = b.getSvgRoot && b.getSvgRoot();
        if (el && el.classList) {
          el.classList.add('wl-ai');
          setTimeout(function () { el.classList.remove('wl-ai'); }, 8000);
        }
        if (!first) first = b;
      });
      if (first) {
        try {
          if (ws.scrollBoundsIntoView) ws.scrollBoundsIntoView(first.getBoundingRectangle());
          else ws.centerOnBlock(first.id);
        } catch (e) { /* a scroll failure is not worth breaking a turn over */ }
      }
    }

    /** Apply one reply, animated if a presentation layer is mounted.
     *
     *  The animation is a nicety; ops.apply is the truth. Whatever the animator returns, the program
     *  ends up in the same place - either it performed the edit itself (`ok`), or we apply instantly.
     */
    function applyReply(d, text) {
      if (!d || !(d.ops || []).length) return applyInstant(d, text);
      var canAnim = false;
      try {
        canAnim = !!(animate && typeof animate.play === 'function' &&
                     (typeof animate.enabled !== 'function' || animate.enabled()));
      } catch (e) { canAnim = false; }
      if (!canAnim) return applyInstant(d, text);

      var before = ops.snapshot(vm);
      applying = true;
      return Promise.resolve()
        .then(function () {
          return animate.play({
            vm: vm,
            before: JSON.parse(JSON.stringify(before.program)),
            after: JSON.parse(JSON.stringify(d.program || {})),
            ops: JSON.parse(JSON.stringify(d.ops || [])),
            workspace: workspace(),
            studioOps: ops, place: place, budgetMs: animBudget,
            focus: typeof d.focus === 'string' ? d.focus : undefined
          });
        })
        .then(function (res) {
          applying = false;
          // `ok` means the animator verified its own end state against the instant apply.
          if (res && res.ok) {
            record('ai', 'AI 改', { say: d.say, text: text, ops: d.ops, animated: true });
            lastAIProgram = ops.snapshot(vm).program;
            return res;
          }
          if (root.console) console.info('[assist] animation did not verify; applying instantly');
          return applyInstant(d, text);
        }, function (e) {
          applying = false;
          if (root.console) console.warn('[assist] animation failed; applying instantly:', e && e.message);
          return applyInstant(d, text);
        });
    }

    /** The instant path: build the blocks directly. This is the ground truth. */
    function applyInstant(d, text) {
      if (!d || !(d.ops || []).length) {
        record('ai', 'AI 回覆（沒有改程式）', { say: d && d.say, text: text, noChange: true });
        lastAIProgram = ops.snapshot(vm).program;
        return;
      }
      applying = true;
      var before = undoTo;
      return ops.apply(vm, d, place).then(function (res) {
        var focus = d.focus && ops.targetByName(vm, d.focus);
        var first = res.done.length ? res.done[0].target : null;
        var show = focus || first;
        if (show && vm.editingTarget !== show) vm.setEditingTarget(show.id);
        else vm.emitWorkspaceUpdate();
        vm.emitTargetsUpdate(false);

        if (res.sideBySide.length) {
          onSys('有一段程式用了 AI 看不懂的積木，AI 的版本放在旁邊，你原本的程式沒有改動。');
        }
        if (res.skipped.length) onSys('有 ' + res.skipped.length + ' 個改動未能套用。');

        setTimeout(function () { highlight(res.done); }, 50);
        applying = false;

        record('ai', 'AI 改', { say: d.say, text: text, ops: d.ops, prev: before ? before.n : null });
        lastAIProgram = ops.snapshot(vm).program;
        return res;
      }, function (e) {
        applying = false;
        onSys('套用積木時出錯。');
        if (root.console) console.error(e);
      });
    }

    /** Ask, then apply. The whole turn, in the order the student sees it happen. */
    function send(text) {
      text = (text || '').trim();
      if (!text || busy) return Promise.resolve(null);
      onUser(text);
      busy = true;
      onBusy(true);

      var snap = ops.snapshot(vm);
      var run = trace && trace.ranSinceTurn ? trace.report(snap.program) : null;
      if (run && undoTo) { /* the caller's version store may want it; recorded below */ }
      // diff is a static on the StudioOps CONSTRUCTOR, while snapshot/apply live on the instance
      // the caller passes in - getting these the wrong way round is what broke the first wiring.
      var diff = cfg.opsDiff || (root.StudioOps && root.StudioOps.diff);
      var edits = diff && lastAIProgram ? diff(lastAIProgram, snap.program) : [];

      var body = {
        text: text,
        history: history.slice(-8),
        program: snap.program,
        run: run,
        note: note,
        signals: trace ? trace.sig : undefined,
        studio: {
          targets: targetsInfo(),
          focus: vm.editingTarget ? (vm.editingTarget.isStage ? STAGE : vm.editingTarget.getName()) : null,
          unsupported: snap.unsupported,
          hand_edits: edits
        }
      };

      return fetch(api, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
        .then(function (r) {
          return r.json().then(function (d) { d._status = r.status; return d; },
                              function () { return { ok: false, reason: 'AI 學伴暫時未能回答。' }; });
        })
        .then(function (d) {
          if (!d.ok) {
            onSys(d.reason || 'AI 學伴暫時未能回答。');
            return null;
          }
          onSource(d.source);
          history.push(
            { role: 'user', content: text },
            { role: 'assistant', content: ((d.say || '') + ' ' + (d.question || '')).trim() }
          );
          if (d.say) onBot(d.say, false);
          if (d.question) onBot(d.question, true);
          note = null;
          if (trace && trace.turnDone) trace.turnDone();
          return applyReply(d, text);
        })
        .catch(function (e) {
          onSys('連線有問題，請再試一次。');
          if (root.console) console.error(e);
          return null;
        })
        .then(function (res) {
          busy = false;
          onBusy(false);
          return res || null;
        });
    }

    /** One step back: undo the last AI change. Returns the version to restore, or null. */
    function undo() {
      var v = undoTo;
      if (!v) return null;
      note = '（學生按了「上一步」，程式回到 AI 上一次改動之前的版本。）';
      if (trace && trace.sig) trace.sig.undo = 1;
      undoTo = null;
      return v;
    }

    return {
      send: send,
      applyReply: applyReply,
      applyInstant: applyInstant,
      highlight: highlight,
      targetsInfo: targetsInfo,
      undo: undo,
      setNote: function (n) { note = n; },
      setUndoTo: function (v) { undoTo = v; },
      canUndo: function () { return !!undoTo; },
      isBusy: function () { return busy; },
      lastProgram: function () { return lastAIProgram; },
      setLastProgram: function (p) { lastAIProgram = p; }
    };
  }

  root.StudioAssist = { create: create, STAGE: STAGE };
}(typeof window !== 'undefined' ? window : this));
