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
 * A STEP HAS TWO MOMENTS, AND THEY ARE NOT THE SAME MOMENT
 * `prepare` puts the stage in the state the step starts from — the student's project held, a clean
 * stage loaded, the earlier steps of the topic rebuilt if this one is being repeated. `perform` is the
 * build and the running of it. Between them the guide says what is about to happen; that is why they
 * are two verbs and not one, and why `run` (prepare then perform, with nothing in between) still
 * exists for a caller that has nothing to say.
 *
 * THE FIRST STEPS OF A LESSON ARE NOT BLOCKS
 * "From scratch" means the stage is empty and the student has to bring the actors in, so a step can
 * carry `add: [{do:'add_sprite', name, sprite}]` or `[{do:'add_backdrop', name}]` instead of scripts.
 * Those are the two things a newcomer cannot guess and an experienced child is tired of being shown,
 * which is why the lesson data marks them `basic` and the guide's own mode decides whether they are
 * walked through at all. `project.empty` is what makes the stage start bare.
 *
 * WHAT IT DOES NOT OWN
 * Navigation and wording: those are studio-guide.js's and the locale files'. Nor the shapes themselves:
 * `explain` hands the step's annotations to studio-guide-marks.js, which knows where the palette is.
 * This file has one exported verb per thing the pane can ask for, and builds no DOM node the student
 * reads, except the pointer's label.
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
    palette: ['[class*="blocks_blocks"]'],
    /* The two buttons a newcomer is looking for and cannot name. They are what "import a sprite" and
       "set a background" mean, so the ring goes round the button, not round the pane. */
    addSprite: ['[class*="sprite-selector_add-button"]', '[aria-label*="選擇角色"]', '[aria-label*="Choose a Sprite"]'],
    addBackdrop: ['[class*="stage-selector_add-button"]', '[aria-label*="選擇背景"]', '[aria-label*="Choose a Backdrop"]']
  };

  function create(cfg) {
    cfg = cfg || {};

    var studio = cfg.studio || function () { return root.WLStudio; };
    var anim = cfg.anim || function () { return root.WLAnim; };
    var marks = cfg.marks || function () { return null; };
    var i18n = cfg.i18n || (root.StudioI18n && typeof root.StudioI18n.t === 'function' ? root.StudioI18n : null);
    function T(key, params) { return i18n ? i18n.t(key, params) : key; }

    var saved = null;        // the student's session, held while a demonstration is on the canvas
    var loadedTopic = null;  // which topic's stage is on the canvas
    var lastIndex = -1;      // the step last performed in that topic, so a repeat knows to rewind
    var names = {};          // '@pico' -> the sprite name this demonstration used
    var pointEl = null;      // the current spotlight
    var pointTimer = null;

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

    /** The clean stage a topic starts from. `spec.empty` is a stage with nothing on it, which is
        where a lesson that begins "from scratch" has to begin. */
    function projectOf(spec) {
      var empty = !!(spec && spec.empty);
      var list = empty ? [] : ((spec && spec.sprites && spec.sprites.length) ? spec.sprites : [{ ref: '@pico' }]);
      return S().blankProject({
        empty: empty,
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
     * Bring an actor or a backdrop in from the library, and wait for it to be really there.
     *
     * Not animated: the library is a modal with a hundred thumbnails, and driving it would be a
     * demonstration of the picker rather than of the idea. What the student needs to see is which
     * button opens it (the ring, drawn by `explain`) and that the actor arrives — the same two things
     * they are told to do by hand.
     */
    function addThings(list) {
      var s = S();
      return (list || []).reduce(function (p, o) {
        return p.then(function () {
          if (o['do'] === 'add_sprite') return Promise.resolve(s.addLibrarySprite(o.name, spriteName(o.sprite || o.name)));
          if (o['do'] === 'add_backdrop') return Promise.resolve(s.addLibraryBackdrop(o.name));
          return null;
        }).then(function () { return wait(o.after || 450); }, function (e) {
          if (root.console) console.warn('[guide] could not add ' + (o && o.name) + ':', e && e.message);
        });
      }, Promise.resolve());
    }

    /**
     * Put an earlier step's outcome back, without animating it.
     *
     * Replaying step three has to start where step three started, which is: a clean stage with steps
     * one and two already built. Rebuilding those the short way is the whole point — the student has
     * seen them built once, and watching them again would make "再看一次" a rewind of the topic rather
     * than of the step.
     *
     * Earlier steps can have imported actors as well as built blocks, and a script that addresses an
     * actor which is not on the stage builds nothing — so the imports are redone first, in order, and
     * only then the blocks.
     */
    function applyPrefix(earlier) {
      var vm = VM(), ops = OPS();
      if (!vm || !ops) return Promise.resolve();
      var adds = [], scripts = [];
      (earlier || []).forEach(function (st) {
        ((st && st.demo && st.demo.add) || []).forEach(function (a) { adds.push(a); });
        ((st && st.demo && st.demo.scripts) || []).forEach(function (s) {
          scripts.push({ sprite: s.sprite, id: s.id, blocks: (s.blocks || []).map(resolveBlock) });
        });
      });
      if (!adds.length && !scripts.length) return Promise.resolve();
      // a prefix that cannot be rebuilt must not take the step itself down with it
      return addThings(adds).then(function () {
        if (!scripts.length) return;
        var before = JSON.parse(JSON.stringify(ops.snapshot(vm).program));
        return applyInstant(setScripts(before, scripts));
      }).then(noop, function (e) {
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
    var take = 0;        // bumped by stop(): a prepared step that nobody wants any more
    var prepared = null; // { step, demo, scripts, idx, token }
    var busyNow = false; // preparing, being explained, or being performed

    /** The marks a step asks for, in one of its two moments: while it is said, or once it is built. */
    function marksFor(step, when) {
      var list = (step && step.demo && step.demo.annotate) || [];
      return list.filter(function (m) { return (m && (m.when || 'say')) === when; });
    }

    function clearMarks() {
      var m = marks();
      if (m) m.clear();
    }

    /**
     * Point at what the step is about to say. Called once the stage is in place, so the shapes ring
     * what is actually on the screen rather than where it was a moment ago.
     */
    function explain(step) {
      var m = marks();
      if (!m) return;
      var list = marksFor(step, 'say');
      if (!list.length) { m.clear(); return; }
      m.draw(list);
    }

    /**
     * Put the canvas in the state the step starts from, and say nothing. Resolves true when the stage
     * is ready for its blocks; false when there is no editor to prepare.
     */
    function prepare(step, topic) {
      var demo = step && step.demo;
      if (!demo) return Promise.resolve(true);
      var vm = VM(), ops = OPS();
      if (!vm || !ops) return Promise.resolve(false);
      if (S().isLoading && S().isLoading()) return Promise.resolve(false);

      clearPoint();
      clearMarks();
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
      var token = ++take;

      // hold the student's session before the first thing that overwrites it, once per demonstration
      if (saved === null) {
        try { saved = S().state(); } catch (e) { saved = null; }
      }
      busyNow = true;

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

      return prep.then(function () {
        prepared = {
          step: step, demo: demo, idx: idx, token: token,
          adds: demo.add || [],
          scripts: (demo.scripts || []).map(function (s) {
            return { sprite: s.sprite, id: s.id, blocks: (s.blocks || []).map(resolveBlock) };
          })
        };
        return true;
      }, function (e) {
        busyNow = false;
        throw e;
      });
    }

    /**
     * Do the step that was prepared: the blocks, then the running of them. Resolves true when the
     * editor ended up in the state the step describes; false when it could not, which the guide shows
     * as a plain "this one did not work" rather than a silent no-op.
     */
    function perform(onProgress) {
      var st = prepared;
      prepared = null;
      if (!st || st.token !== take) { busyNow = false; return Promise.resolve(false); }
      var demo = st.demo, scripts = st.scripts, adds = st.adds || [], vm = VM(), ops = OPS();
      if (!vm || !ops) { busyNow = false; return Promise.resolve(false); }

      // the words are finished; from here the animation is the pointer
      clearMarks();

      /* Imports first, in the order the lesson asked for them: a script can only be built on an
         actor that is already on the stage. */
      var chain = addThings(adds).then(function () {
        return scripts.length
          ? build(scripts, { focus: demo.focus ? spriteName(demo.focus) : null, onProgress: onProgress })
          : { ok: true };
      });

      return chain.then(function (res) {
        if (!res || res.ok === false) return false;

        if (!scripts.length) {
          if (demo.focus) { var f = ops.targetByName(vm, spriteName(demo.focus)); if (f) { try { vm.setEditingTarget(f.id); } catch (e) {} } }
          if (demo.point) point(demo.point);
          return true;
        }

        var target = demo.focus ? ops.targetByName(vm, spriteName(demo.focus)) : null;
        if (target && vm.editingTarget !== target) { try { vm.setEditingTarget(target.id); } catch (e) {} }
        if (demo.point) point(demo.point);

        return settled(scripts).then(function () {
          var after = Promise.resolve();
          /* The block is on the canvas now, so the number it is about can be ringed where it sits:
             "drag this" before the drag, "change this" once there is something to change. */
          var later = marksFor(st.step, 'built');
          var m = marks();
          if (later.length && m) {
            after = after.then(function () { return m.draw(later); }).then(function () { return wait(900); });
          }
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
        busyNow = false;
        clearMarks();
        // where the stage is now, so the next press knows whether it is moving on or going back
        if (ok !== false) lastIndex = st.idx;
        return ok;
      }, function (e) {
        busyNow = false;
        clearMarks();
        if (root.console) console.warn('[guide] step failed:', e && e.message);
        return false;
      });
    }

    /** Prepare and perform, without a word in between: for a caller that has nothing to say. */
    function run(step, onProgress, topic) {
      return prepare(step, topic).then(function (ok) {
        return ok === false ? false : perform(onProgress);
      }, function (e) {
        if (root.console) console.warn('[guide] could not prepare:', e && e.message);
        return false;
      });
    }

    /** Stop what is moving: the animation, the program, the spotlight, the marks. Not the stage itself. */
    function stop() {
      take++;              // whatever was prepared or in flight is no longer wanted
      prepared = null;
      busyNow = false;
      clearPoint();
      clearMarks();
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
      prepare: prepare,
      perform: perform,
      explain: explain,
      stop: stop,
      restore: restore,
      isActive: isActive,
      point: point,
      /** true while a demonstration is being prepared, explained or performed */
      busy: function () { return busyNow; }
    };
  }

  root.StudioGuideDrive = { create: create };
}(typeof window !== 'undefined' ? window : this));
