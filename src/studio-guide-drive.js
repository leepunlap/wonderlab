/*!
 * Wonder Lab Studio — the guide's hands.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS IS
 * The half of the guide that touches the editor. A step says "build this and let it run"; this turns
 * that into: a clean stage with the named sprites on it, the blocks dragged in by the same animator
 * the AI's turns use (so the student sees the palette open, the block picked and dropped, the number
 * typed), the green flag pressed, and — when the step is about a key or a click — the key pressed or
 * the region pointed at.
 *
 * WHY IT KEEPS THE STUDENT'S WORK
 * A demonstration needs a stage it can predict, which means loading one. Loading over a student's
 * project without a way back would make the guide the most destructive thing in the product, so the
 * first demonstration saves the whole session (S.state(): project, assets, script ids) and every
 * exit — 返回我的作品, leaving the tab, changing language — puts it back exactly.
 *
 * WHAT IT DOES NOT OWN
 * Navigation and wording: those are studio-guide.js's and the locale files'. This file has one
 * exported verb per thing the pane can ask for, and never builds a DOM node the student reads,
 * except the pointer's label.
 *
 * ES5, like the rest of the studio's own code: this ships to old browsers.
 */
(function (root) {
  'use strict';

  var STAGE = '舞台';

  function noop() {}
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /** The regions a step can point at. Upstream's class names carry a build hash, so match the prefix. */
  var REGION = {
    flag: ['[class*="green-flag_green-flag-button"]', '[aria-label="Start project"]'],
    stage: ['[class*="stage-wrapper_stage-wrapper"]', '[aria-label="舞台"]'],
    sprites: ['[class*="sprite-selector_sprite-selector"]'],
    palette: ['[class*="blocks_blocks"]']
  };

  function create(cfg) {
    cfg = cfg || {};

    var studio = cfg.studio || function () { return root.WLStudio; };
    var anim = cfg.anim || function () { return root.WLAnim; };
    var i18n = cfg.i18n || (root.StudioI18n && typeof root.StudioI18n.t === 'function' ? root.StudioI18n : null);
    function T(key, params) { return i18n ? i18n.t(key, params) : key; }

    var saved = null;        // the student's session, held while a demonstration is on the canvas
    var loadedTopic = null;  // which topic's stage is on the canvas
    var lastIndex = -1;      // the step last performed in that topic, so a repeat knows to rewind
    var names = {};          // '@pico' -> the sprite name this demonstration used
    var pointEl = null;      // the current spotlight
    var pointTimer = null;
    var running = null;      // the promise of the demonstration in flight

    function S() { return studio(); }
    function OPS() { var s = S(); return s && s.ops ? s.ops() : null; }
    function VM() { var s = S(); return s && s.vm; }

    /* ---------- names and words ---------- */
    /**
     * `@pico` is a sprite reference, not a sprite name: the topic file has no language, so the name is
     * resolved once per demonstration through `guide.sprite.pico`. Resolved once and remembered,
     * because a language change mid-topic must not rename a sprite the blocks already address.
     */
    function spriteName(ref) {
      if (!ref || String(ref).charAt(0) !== '@') return ref;
      if (names[ref]) return names[ref];
      var id = String(ref).slice(1), key = 'guide.sprite.' + id, v = T(key);
      names[ref] = v === key ? id.charAt(0).toUpperCase() + id.slice(1) : v;
      return names[ref];
    }

    /** `{ k: 'guide.say.hello' }` anywhere a block holds text, resolved at build time. */
    function resolveBlock(b) {
      var o = {};
      Object.keys(b || {}).forEach(function (k) {
        var v = b[k];
        if (v && typeof v === 'object') {
          if (Array.isArray(v)) o[k] = v.map(resolveBlock);
          else if (v.op) o[k] = resolveBlock(v);
          else if (v.k) o[k] = T(v.k);
          else o[k] = v;
        } else o[k] = v;
      });
      return o;
    }

    /** The clean stage a topic starts from. */
    function projectOf(spec) {
      var list = (spec && spec.sprites && spec.sprites.length) ? spec.sprites : [{ ref: '@pico' }];
      return S().blankProject({
        sprites: list.map(function (s) {
          return { name: spriteName(s.ref || s.name), costume: s.costume || 0,
                   x: s.x || 0, y: s.y || 0, size: s.size || 100 };
        })
      });
    }

    /* ---------- the spotlight ---------- */
    function clearPoint() {
      if (pointTimer) { clearTimeout(pointTimer); pointTimer = null; }
      if (pointEl && pointEl.parentNode) pointEl.parentNode.removeChild(pointEl);
      pointEl = null;
    }

    /**
     * A ring around a region of the editor with its name on it. The block animation points at the
     * palette by itself, but "press the green flag" and "that is the sprite pane" have no such
     * mechanism, and a sentence without a place is how a student learns to ignore the guide.
     */
    function point(region, ms) {
      clearPoint();
      var list = REGION[region];
      if (!list) return;
      var host = null;
      for (var i = 0; i < list.length && !host; i++) host = root.document.querySelector(list[i]);
      if (!host) return;
      var r = host.getBoundingClientRect();
      if (!r.width || !r.height) return;

      var box = root.document.createElement('div');
      box.className = 'wl-point';
      box.setAttribute('aria-hidden', 'true');
      box.style.left = Math.round(r.left - 5) + 'px';
      box.style.top = Math.round(r.top - 5) + 'px';
      box.style.width = Math.round(r.width + 10) + 'px';
      box.style.height = Math.round(r.height + 10) + 'px';
      var label = root.document.createElement('span');
      label.className = 'wl-point-label';
      label.textContent = T('guide.point.' + region);
      // the green flag sits near the top of the window: a label above it would be off-screen
      if (r.top < 40) { label.style.top = Math.round(r.height + 11) + 'px'; }
      else { label.style.top = '-25px'; }
      box.appendChild(label);
      root.document.body.appendChild(box);
      pointEl = box;
      pointTimer = setTimeout(clearPoint, ms || 2800);
    }

    /* ---------- keys ---------- */
    /**
     * A real keyboard event through the VM's IO layer, so the hat scripts start exactly as they would
     * for a hand on the keyboard. `settle` is not decoration: Blockly delivers a block it created a
     * frame or two after the animation resolves, and a key pressed before that finds no hat to start.
     */
    function press(key, holdMs) {
      var vm = VM();
      if (!vm) return Promise.resolve();
      try { vm.postIOData('keyboard', { key: key, isDown: true }); } catch (e) { return Promise.resolve(); }
      return wait(holdMs || 240).then(function () {
        try { vm.postIOData('keyboard', { key: key, isDown: false }); } catch (e) { /* nothing to undo */ }
        return wait(160);
      });
    }

    /* ---------- applying one step ---------- */
    function setScripts(before, scripts) {
      var after = JSON.parse(JSON.stringify(before));
      after.sprites = after.sprites || {};
      after.stage = after.stage || { scripts: {} };
      var list = [];
      scripts.forEach(function (s) {
        var name = spriteName(s.sprite);
        var holder = name === STAGE ? after.stage : (after.sprites[name] = after.sprites[name] || { scripts: {} });
        holder.scripts = holder.scripts || {};
        holder.scripts[s.id] = s.blocks;
        list.push({ do: 'set_script', sprite: name, id: s.id, n: s.blocks.length });
      });
      return { program: after, ops: list };
    }

    function applyInstant(built) {
      var vm = VM(), ops = OPS();
      var place = function (target, n) { return root.StudioCore.place(vm, target, n); };
      return ops.apply(vm, built, place).then(function (res) {
        var first = res.done.length ? res.done[0].target : null;
        if (first) { try { vm.setEditingTarget(first.id); } catch (e) {} }
        vm.emitWorkspaceUpdate();
        return res;
      });
    }

    /**
     * Put an earlier step's outcome back, without animating it.
     *
     * Replaying step three has to start where step three started, which is: a clean stage with steps
     * one and two already built. Rebuilding those the short way is the whole point — the student has
     * seen them built once, and watching them again would make "再看一次" a rewind of the topic rather
     * than of the step.
     */
    function applyPrefix(earlier) {
      var vm = VM(), ops = OPS();
      if (!vm || !ops) return Promise.resolve();
      var scripts = [];
      (earlier || []).forEach(function (st) {
        ((st && st.demo && st.demo.scripts) || []).forEach(function (s) {
          scripts.push({ sprite: s.sprite, id: s.id, blocks: (s.blocks || []).map(resolveBlock) });
        });
      });
      if (!scripts.length) return Promise.resolve();
      var before = JSON.parse(JSON.stringify(ops.snapshot(vm).program));
      // a prefix that cannot be rebuilt must not take the step itself down with it
      return applyInstant(setScripts(before, scripts)).then(noop, function (e) {
        if (root.console) console.info('[guide] could not rebuild the earlier steps:', e && e.message);
      });
    }

    function build(scripts, opts) {
      var vm = VM(), ops = OPS();
      if (!vm || !ops) return Promise.reject(new Error('guide: the editor is not ready'));
      var before = JSON.parse(JSON.stringify(ops.snapshot(vm).program));
      var built = setScripts(before, scripts);

      var a = anim();
      var canAnim = false;
      try {
        canAnim = !!(a && typeof a.play === 'function' && (typeof a.enabled !== 'function' || a.enabled()));
      } catch (e) { canAnim = false; }

      if (!canAnim) return applyInstant(built).then(function () { return { ok: true, instant: true }; });

      return a.play({
        vm: vm, before: before, after: JSON.parse(JSON.stringify(built.program)), ops: built.ops,
        workspace: root.StudioCore.workspace(), studioOps: ops,
        place: function (target, n) { return root.StudioCore.place(vm, target, n); },
        focus: opts.focus,
        budgetMs: 14000,
        onProgress: opts.onProgress
      }).then(function (res) {
        // `ok` means the animator verified its own end state; anything else is applied the short way
        if (res && res.ok) return res;
        if (root.console) console.info('[guide] animation did not verify; building instantly');
        return applyInstant(built).then(function () { return { ok: true, instant: true }; });
      }, function (e) {
        if (root.console) console.warn('[guide] animation failed; building instantly:', e && e.message);
        return applyInstant(built).then(function () { return { ok: true, instant: true }; });
      });
    }

    /**
     * Wait until the VM holds exactly the script that was asked for.
     *
     * The animator promises the *GUI* has the blocks; the VM learns about them through Blockly's
     * events, and the last one can land a frame or two later. Anything that starts a script — a key,
     * the green flag — races that, and losing the race looks like "the demonstration did nothing"
     * (a hat whose input has not arrived yet moves the sprite by zero). Polling for the real state is
     * cheap, bounded, and can only help: on timeout the step carries on exactly as before.
     */
    function settled(scripts, ms) {
      var vm = VM(), ops = OPS();
      if (!vm || !ops) return Promise.resolve(false);
      var deadline = Date.now() + (ms || 2500);
      function check() {
        var prog = ops.snapshot(vm).program;
        var ok = scripts.every(function (s) {
          var name = spriteName(s.sprite);
          var holder = name === STAGE ? prog.stage : (prog.sprites || {})[name];
          var have = holder && holder.scripts && holder.scripts[s.id];
          return JSON.stringify(have) === JSON.stringify(s.blocks);
        });
        if (ok || Date.now() > deadline) return Promise.resolve(ok);
        return wait(60).then(check);
      }
      return check();
    }

    /* ---------- the public verbs ---------- */
    /**
     * Perform one step. Resolves true when the editor ended up in the state the step describes;
     * false when it could not, which the guide shows as a plain "this one did not work" rather than
     * a silent no-op.
     */
    function run(step, onProgress, topic) {
      var demo = step && step.demo;
      if (!demo) return Promise.resolve(true);
      var vm = VM(), ops = OPS();
      if (!vm || !ops) return Promise.resolve(false);
      if (S().isLoading && S().isLoading()) return Promise.resolve(false);

      clearPoint();
      try { if (anim() && anim().busy()) anim().skip(); } catch (e) {}

      var topicId = topic && topic.id || 'default';
      var steps = (topic && topic.steps) || [];
      var idx = steps.indexOf(step);
      var fresh = saved === null || loadedTopic !== topicId;
      /* Pressing 示範 again on the step you are looking at, or going back to an earlier one, starts
         that step from its own beginning: a clean stage carrying only the steps before it. Moving
         forward does not reload anything, so a step that inserts a block inserts it into the stack
         the student has just watched being built. */
      var rewind = !fresh && idx >= 0 && lastIndex >= 0 && idx <= lastIndex;
      var resolved = [];

      // hold the student's session before the first thing that overwrites it, once per demonstration
      if (saved === null) {
        try { saved = S().state(); } catch (e) { saved = null; }
      }

      var prep = Promise.resolve();
      if (fresh || rewind) {
        if (fresh) names = {};
        try { vm.stopAll(); } catch (e) {}
        prep = S().loadState({ project: projectOf(demo.project) }).then(function (ok) {
          if (ok === false) throw new Error('guide: could not load the demonstration stage');
          loadedTopic = topicId;
          return wait(120);   // let the gui finish swapping the workspace before it is dragged in
        }).then(function () {
          if (rewind) return applyPrefix(steps.slice(0, idx));
        });
      }

      running = prep.then(function () {
        resolved = (demo.scripts || []).map(function (s) {
          return { sprite: s.sprite, id: s.id, blocks: (s.blocks || []).map(resolveBlock) };
        });
        if (!resolved.length) return { ok: true };
        return build(resolved, { focus: demo.focus ? spriteName(demo.focus) : null, onProgress: onProgress });
      }).then(function (res) {
        if (!res || res.ok === false) return false;

        if (!resolved.length) {
          if (demo.focus) { var f = ops.targetByName(vm, spriteName(demo.focus)); if (f) { try { vm.setEditingTarget(f.id); } catch (e) {} } }
          if (demo.point) point(demo.point);
          return true;
        }

        var target = demo.focus ? ops.targetByName(vm, spriteName(demo.focus)) : null;
        if (target && vm.editingTarget !== target) { try { vm.setEditingTarget(target.id); } catch (e) {} }
        if (demo.point) point(demo.point);

        return settled(resolved).then(function () {
          var after = Promise.resolve();
          if (demo.run) {
            after = after.then(function () {
              try { vm.greenFlag(); } catch (e) {}
              return wait(demo.run);
            }).then(function () { try { vm.stopAll(); } catch (e) {} });
          }
          (demo.keys || []).forEach(function (key) {
            after = after.then(function () { return press(key); });
          });
          return after.then(function () { return true; });
        });
      }).then(function (ok) {
        running = null;
        // where the stage is now, so the next press knows whether it is moving on or going back
        if (ok !== false) lastIndex = idx;
        return ok;
      }, function (e) {
        running = null;
        if (root.console) console.warn('[guide] step failed:', e && e.message);
        return false;
      });

      return running;
    }

    /** Stop what is moving: the animation, the program, the spotlight. Not the stage itself. */
    function stop() {
      clearPoint();
      try { if (anim() && anim().busy()) anim().skip(); } catch (e) {}
      var vm = VM();
      if (vm) { try { vm.stopAll(); } catch (e) {} }
    }

    /** Give the canvas back. The one call that undoes a demonstration, and the only way out of one. */
    function restore() {
      stop();
      lastIndex = -1;
      if (!saved) { loadedTopic = null; return Promise.resolve(false); }
      var state = saved;
      saved = null;
      loadedTopic = null;
      names = {};
      return Promise.resolve(S().loadState(state)).then(function (ok) {
        if (root.console && ok === false) console.warn('[guide] could not put the student\'s project back');
        return ok !== false;
      }, function () { return false; });
    }

    function isActive() { return saved !== null; }

    return {
      run: run,
      stop: stop,
      restore: restore,
      isActive: isActive,
      point: point,
      /** true while a demonstration promise is in flight (a page may hold a language switch back) */
      busy: function () { return running !== null; }
    };
  }

  root.StudioGuideDrive = { create: create };
}(typeof window !== 'undefined' ? window : this));
