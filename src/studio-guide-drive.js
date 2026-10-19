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

    /**
     * The hand. Optional on purpose: a lesson page that mounts the guide without it still gets every
     * step, just without the arrow — the ring and the real press are what the step is made of, and the
     * pointer is the thing that explains them.
     */
    var cursorOf = cfg.cursor || null;
    var ownCursor;
    function C() {
      if (cursorOf) return cursorOf();
      if (ownCursor === undefined) {
        ownCursor = (root.StudioGuideCursor && typeof root.StudioGuideCursor.create === 'function')
          ? root.StudioGuideCursor.create({ i18n: i18n, sound: cfg.sound })
          : null;
      }
      return ownCursor;
    }

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

    /** The first of a list of selectors that is actually on screen. */
    function firstOf(list) {
      var d = root.document;
      for (var i = 0; i < (list || []).length; i++) {
        var el = d.querySelector(list[i]);
        if (!el) continue;
        var r = el.getBoundingClientRect();
        if (r.width && r.height) return el;
      }
      return null;
    }

    /**
     * A ring around a rectangle with a word on it.
     *
     * The block animation points at the palette by itself, but "press the green flag", "that is the
     * sprite pane" and "this tile, here" have no such mechanism, and a sentence without a place is how
     * a student learns to ignore the guide. `ms` is how long it stays: long enough to be looked at,
     * short enough that it is gone by the time the thing it rings has been clicked.
     */
    function ringRect(r, label, ms, strong) {
      clearPoint();
      if (!r || !r.width || !r.height) return;
      var box = root.document.createElement('div');
      box.className = 'wl-point' + (strong ? ' is-strong' : '');
      box.setAttribute('aria-hidden', 'true');
      box.style.left = Math.round(r.left - 5) + 'px';
      box.style.top = Math.round(r.top - 5) + 'px';
      box.style.width = Math.round(r.width + 10) + 'px';
      box.style.height = Math.round(r.height + 10) + 'px';
      if (label) {
        var pill = root.document.createElement('span');
        pill.className = 'wl-point-label';
        pill.textContent = label;
        // the green flag sits near the top of the window: a label above it would be off-screen
        if (r.top < 40) pill.style.top = Math.round(r.height + 11) + 'px';
        else pill.style.top = '-25px';
        box.appendChild(pill);
      }
      root.document.body.appendChild(box);
      pointEl = box;
      pointTimer = setTimeout(clearPoint, ms || 2800);
    }

    /** The same ring, around an element; returns the rectangle it used, or null. */
    function ringEl(el, label, ms, strong) {
      if (!el) return null;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      ringRect(r, label, ms, strong);
      return r;
    }

    /** Ring a named region of the editor (`addSprite`, `stage`, `flag`…), labelled from the locale. */
    function point(region, ms) {
      var list = REGION[region];
      if (!list) return;
      ringEl(firstOf(list), T('guide.point.' + region), ms);
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

    /* ---------- the library ---------- */
    /**
     * Bringing an actor in is the one thing a lesson never writes down, so the guide does not do it
     * out of sight any more: it presses the plus, waits for the library, scrolls to the tile, rings
     * it, and presses it — the four moves a child would make, at a speed a child can follow.
     *
     * The picker is the gui's, not ours: it is a modal with React inside it, and the only contract is
     * what it looks like. So every step of this can fail, and every failure has a way out — the
     * import falls back to the API, which is what this file did before, and a step still gets its
     * actors on the stage. A demonstration that breaks the lesson because a class name changed is a
     * worse bug than a demonstration that skips the pointing.
     */
    var PICK = {
      tile: '[class*="library-item_library-item"]',
      modal: '[class*="modal_modal-content"]'
    };

    function until(fn, tries, gap) {
      var n = 0;
      function step() {
        var v = false;
        try { v = fn(); } catch (e) { v = false; }
        if (v) return Promise.resolve(true);
        if (++n >= (tries || 40)) return Promise.resolve(false);
        return wait(gap || 120).then(step);
      }
      return step();
    }

    function pickerTiles() {
      return [].slice.call(root.document.querySelectorAll(PICK.tile));
    }

    function pickerOpen() { return pickerTiles().length > 0; }

    function tileLabel(el) {
      return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Every tile whose caption is this name, best first.
     *
     * Upstream draws each entry several times over — 343 actors, 1715 tiles — and the copies are not
     * all where the student is looking: some are measuring ghosts with a rectangle far below the
     * visible grid. So this returns the whole set and `settleTile` decides which one is really in
     * view; a ring drawn on a ghost points at nothing.
     */
    function pickerTilesNamed(name) {
      var want = String(name || '').toLowerCase(), exact = [], near = [];
      pickerTiles().forEach(function (el) {
        var t = tileLabel(el).toLowerCase();
        if (!t) return;
        if (t === want) exact.push(el);
        else if (t.indexOf(want) === 0) near.push(el);
      });
      if (!exact.length) {
        near.sort(function (a, b) { return tileLabel(a).length - tileLabel(b).length; });
        return near.slice(0, 4);
      }
      return exact;
    }

    /* The middle of the tile is on screen: the whole of it does not have to be. A short window
       scrolls a 160px tile into a 206px grid and it fits; a shorter one would never fit, and a
       demonstration that gives up because the laptop is small is the wrong kind of correct. */
    function inside(r, box) {
      if (!r.width || !r.height) return false;
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      return cx >= box.left && cx <= box.right && cy >= box.top && cy <= box.bottom;
    }

    /** Scroll a candidate into the middle of the grid and say whether it ended up where eyes are. */
    function settleTile(el) {
      var grid = root.document.querySelector('[class*="library_library-scroll-grid"]');
      try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); }
      catch (e) { try { el.scrollIntoView(); } catch (e2) { /* it is on screen already */ } }
      return wait(180).then(function () {
        var box = grid ? grid.getBoundingClientRect() : { top: 0, left: 0, bottom: root.innerHeight, right: root.innerWidth };
        return inside(el.getBoundingClientRect(), box) ? el : null;
      });
    }

    /** The first candidate that settles in view, or null. */
    function findTile(name) {
      var list = pickerTilesNamed(name), i = 0;
      function next() {
        if (i >= list.length) return Promise.resolve(null);
        var el = list[i++];
        return settleTile(el).then(function (ok) { return ok || next(); });
      }
      return next();
    }

    /** Shut the picker the way a student would, so a failed demonstration is not a locked screen. */
    function closePicker() {
      var d = root.document;
      var x = d.querySelector('[class*="close-button_close-button"], [class*="modal_close-button"]');
      if (x) { try { x.click(); return; } catch (e) { /* fall through to the key */ } }
      try {
        var ev = new root.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true });
        d.dispatchEvent(ev);
      } catch (e) { /* the overlay click below is the last resort */ }
      var overlay = d.querySelector('[class*="modal_modal-overlay"]');
      if (overlay) { try { overlay.click(); } catch (e) { /* nothing left to try */ } }
    }

    function targetIds() {
      var vm = VM();
      return vm && vm.runtime ? vm.runtime.targets.map(function (t) { return t.id; }) : [];
    }

    /**
     * Did the press land? `vm.addSprite` resolves with nothing and the picker's own path resolves
     * with nothing either, so the stage is the only witness: a new target for an actor, a new costume
     * for a backdrop.
     *
     * Polled, not read once. The picker closes before the sprite it created has been committed, so a
     * single look taken right after the modal goes finds nothing — and "nothing" here means the
     * caller falls back and adds a second one. The two wait together: the duplicate is the price of
     * being in a hurry.
     */
    function arrived(kind, name, alias, before, patience) {
      var vm = VM();
      if (!vm || !vm.runtime || !vm.runtime.targets.length) return Promise.resolve(false);
      function found() {
        if (kind === 'backdrop') {
          var stage = vm.runtime.targets[0];
          return (stage.getCostumes() || []).some(function (c) { return c.name === name; })
            ? { stage: true } : null;
        }
        var added = vm.runtime.targets.filter(function (t) { return before.indexOf(t.id) < 0; });
        return added.length ? { target: added[0] } : null;
      }
      var ms = patience || 4000;
      return until(found, Math.ceil(ms / 120), 120).then(function (ok) {
        if (!ok) return false;
        var t = found();
        if (t && t.target) {
          // the blocks in the steps address the actor by the lesson's name, not the library's
          if (alias && t.target.getName() !== alias) {
            try { vm.renameSprite(t.target.id, alias); } catch (e) { /* keep the library's name */ }
          }
          try { vm.setEditingTarget(t.target.id); } catch (e) { /* the next step will set it again */ }
        }
        return true;
      });
    }

    /**
     * Travel to a node, resolving true when the hand is there. Without a hand it resolves false at
     * once, and the caller falls back to the pause a ring on its own used to get.
     */
    function reach(node, ms) {
      var c = C();
      if (!c) return Promise.resolve(false);
      return c.moveToEl(node, Math.min(560, ms));
    }

    /**
     * Press where the hand is, then a beat.
     *
     * The beat is the ripple's: the press is what the student is meant to notice, and a modal that
     * opens in the same frame as the click hides the one thing worth seeing.
     */
    function pressHere() {
      var c = C();
      if (!c) return Promise.resolve(false);
      c.press();
      return wait(90).then(function () { return true; });
    }

    /**
     * One actor, the long way round. Resolves true when the picker did it, false when it could not —
     * the caller then falls back and nothing is lost but the pointing.
     */
    function pickOne(o, opts) {
      var kind = o['do'] === 'add_backdrop' ? 'backdrop' : 'sprite';
      var name = o.name;
      var alias = spriteName(o.sprite || o.name);
      var before = targetIds();
      var button = firstOf(REGION[kind === 'backdrop' ? 'addBackdrop' : 'addSprite']);
      if (!button) return Promise.resolve(false);

      /* The pause the caller asked for is the budget for the whole approach, not time on top of it:
         a hand that arrives and a ring that waits are the same beat, and only one of them says
         "press this". */
      var lead = opts.lead || 900;
      var approach = Math.min(560, lead);

      // the button first: "here is what opens the library" is the sentence the student needs most
      ringEl(button, T('guide.point.' + (kind === 'backdrop' ? 'addBackdrop' : 'addSprite')), 2600);
      return reach(button, lead).then(function (arrived) {
        return wait(arrived ? Math.max(140, lead - approach) : lead);
      }).then(pressHere).then(function () {
        (button.querySelector('button') || button).click();
        return until(pickerOpen, 45, 120);
      }).then(function (open) {
        if (!open) { if (C()) C().hide(); return false; }
        return findTile(name).then(function (tile) {
          if (!tile) { closePicker(); if (C()) C().hide(); return false; }
          var hold = opts.hold || 900;
          var walk = Math.min(560, hold);
          return reach(tile, hold).then(function (arrived) {
            // the pill says what the lesson calls it, which is not what the library calls it
            ringEl(tile, alias && alias !== name ? alias : null, hold, true);
            return wait(arrived ? Math.max(140, hold - walk) : hold);
          }).then(pressHere).then(function () {
            tile.click();
            /* The hand has done its job; left standing it is an arrow pointing at a closed dialog. Long
               enough to see the ripple, then gone. */
            if (C()) setTimeout(function () { if (C()) C().hide(); }, 320);
            /* The modal only closes when the picker has taken a selection: if it is gone, the press
               was accepted. That, not the arrival, is the moment to tell "landed" from "missed" — the
               actor itself can still be fetching its costume, and a backdrop is a whole picture. */
            return until(function () { return !pickerOpen(); }, 50, 100);
          }).then(function (closed) {
            if (!closed) { closePicker(); return false; }
            return arrived(kind, name, alias, before, kind === 'backdrop' ? 12000 : 4000);
          });
        });
      });
    }

    /** The short way: the library entry straight into the VM, with the lesson's name on it. */
    function addDirect(o) {
      var s = S(), kind = o['do'] === 'add_backdrop' ? 'backdrop' : 'sprite';
      var alias = spriteName(o.sprite || o.name);
      var out = kind === 'backdrop'
        ? Promise.resolve(s.addLibraryBackdrop(o.name))
        : Promise.resolve(s.addLibrarySprite(o.name, alias));
      return out.then(function (r) {
        /* the picker's path gets its missing-file report from the picker; this one has to ask */
        try { if (s.checkLibraryAssets) s.checkLibraryAssets(o.name); } catch (e) { /* a warning, not a step */ }
        return r;
      });
    }

    /**
     * Bring this step's actors in. With `opts.picker` each one is imported the visible way — plus,
     * library, tile, press — and silently falls back to the direct import if the picker cannot be
     * driven. Without it (rebuilding earlier steps on a rewind) nothing is shown: the student has
     * watched this once already, and the point of 再看一次 is the step, not the walk up to it.
     */
    function addThings(list, opts) {
      opts = opts || {};
      var show = !!opts.picker;
      var first = true;
      return (list || []).reduce(function (p, o, i) {
        return p.then(function () {
          if (opts.onProgress) { try { opts.onProgress(i + 1, list.length); } catch (e) {} }
          if (!show) {
            return Promise.resolve(addDirect(o)).then(function () {
              return wait(o.after || 450);
            }, function (e) {
              if (root.console) console.warn('[guide] could not add ' + (o && o.name) + ':', e && e.message);
            });
          }
          var lead = first ? 1000 : 700, hold = first ? 1100 : 800;
          first = false;
          return pickOne(o, { lead: lead, hold: hold }).then(function (byPicker) {
            if (byPicker) return wait(o.after || 350);
            return Promise.resolve(addDirect(o)).then(function () {
              return wait(o.after || 450);
            }, function (e) {
              if (root.console) console.warn('[guide] could not add ' + (o && o.name) + ':', e && e.message);
            });
          }, function (e) {
            if (root.console) console.warn('[guide] the picker failed for ' + (o && o.name) + ':', e && e.message);
            return Promise.resolve(addDirect(o)).then(function () { return wait(450); }, function () {});
          });
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
         actor that is already on the stage. When the step is only about importing, the counts under
         the button are the actors' — the block animation is not running, so nothing else is using it. */
      var chain = addThings(adds, {
        picker: true,
        onProgress: scripts.length ? null : onProgress
      }).then(function () {
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
      // a demonstration that was interrupted mid-import must not leave the library over the canvas
      if (pickerOpen()) closePicker();
      // the hand goes with the rest: an arrow left on screen points at a step that has stopped
      if (C()) C().hide();
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
      /** ring one element for a while, for a caller that has the element and not a region name */
      ring: ringEl,
      /** the hand, for a page that wants to drive it or a test that wants to read it */
      cursor: C,
      /** true while a demonstration is being prepared, explained or performed */
      busy: function () { return busyNow; }
    };
  }

  root.StudioGuideDrive = { create: create };
}(typeof window !== 'undefined' ? window : this));
