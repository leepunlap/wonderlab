/*!
 * Wonder Lab Studio — run report ("run and look"), ported from wonderlab-src/src/wonderlab.js (run/sample/report).
 * Copyright (C) 2026 IITS. GNU Affero General Public License v3.0 only (see LICENSE).
 * scratch-gui owns the green flag / stop buttons, so the trace starts on the VM's PROJECT_START (green flag) or on the
 * first PROJECT_RUN_START after an idle stage (a clicked script, a key hat) and ends on PROJECT_STOP_ALL.
 * The report has the shape lab_core.sanitize_run() keeps.
 */
(function (global) {
  'use strict';
  var WAIT_HATS = { event_whenkeypressed: 1, event_whenthisspriteclicked: 1, event_whenstageclicked: 1 };

  function Trace(vm) {
    this.vm = vm; this.trace = null; this.sig = { runs: 0, stops: 0, undo: 0 }; this.ranSinceTurn = false; this.onRun = null;
    this.colors = null;                  // lesson colours to sample (["#rrggbb"]), as the read-only lab does
    this.mapScript = null;               // (targetName, topBlockId) -> script id, set by the host (dual mode)
    var self = this, rt = vm.runtime, lastStop = 0;
    this.watchThreads();
    vm.on('PROJECT_START', function () { self.start('flag'); });
    // a run of an edited program is a new run (dirty: set by the host on every change); any other start after a turn
    // (a key, a click on the sprite while the program waits) still counts as "ran since the turn"
    this.dirty = false;
    vm.on('PROJECT_RUN_START', function () {
      if (!self.trace || self.trace.stoppedAt || self.dirty) self.start('script');
      else if (!self.ranSinceTurn) { self.ranSinceTurn = true; if (self.onRun) self.onRun('again'); }
    });
    vm.on('PROJECT_STOP_ALL', function () {
      lastStop = Date.now();
      var tr = self.trace;            // the 停止 button (or a green flag, which starts a new run at once) ends every script
      if (tr && !tr.stoppedAt && tr.scripts) Object.keys(tr.scripts).forEach(function (k) {
        var s = tr.scripts[k]; if (s.running > 0) { s.running = 0; s.stopped = self.secs(); s.by_stop = true; }
      });
      setTimeout(function () {            // greenFlag() = stopAll() + start: a stop followed at once by a start is not a 停止 press
        if (self.trace && self.trace.t0 < lastStop && !self.trace.stoppedAt) { self.trace.stoppedAt = lastStop; self.sig.stops += 1; clearInterval(self._tick); if (self.onRun) self.onRun('stop'); }
      }, 30);
    });
    rt.on('SAY', function (target, type, text) {
      if (self.trace && text && target && !target.isStage) {
        var s = self.sprite(target.getName()); if (s.said.indexOf(text) < 0 && s.said.length < 6) s.said.push(String(text).slice(0, 40));
      }
    });
    rt.on('ANSWER', function (a) { if (self.trace && self.trace.answers.length < 5) self.trace.answers.push(String(a).slice(0, 20)); });
    document.addEventListener('keydown', function (e) {
      if (!self.trace || self.trace.stoppedAt || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || e.repeat) return;
      if (self.trace.keys.length < 30) self.trace.keys.push(e.key === ' ' ? 'space' : String(e.key).replace('Arrow', '').toLowerCase());
    }, true);
    this.watchColors();
  }

  /* Which scripts ran (dual mode 2026-10-07): every new thread (green flag, a hat, a click on the sprite or on a script)
     goes through runtime._pushThread; a thread that is no longer in runtime.threads after a step has ended. Recorded per
     (sprite, top block) with the times relative to the start of the run; clones count for their sprite. */
  Trace.prototype.watchThreads = function () {
    var self = this, rt = this.vm.runtime;
    if (!rt || rt.__wlThreads || typeof rt._pushThread !== 'function' || typeof rt._step !== 'function') return;
    rt.__wlThreads = true;
    this.live = [];
    var push = rt._pushThread, step = rt._step;
    rt._pushThread = function (id, target, opts) {
      var th = push.apply(this, arguments);
      try { if (th && !(opts && opts.updateMonitor) && target) self.threadStarted(th, id, target); } catch (e) {}
      return th;
    };
    rt._step = function () {
      var r = step.apply(this, arguments);
      try { self.afterStep(); } catch (e) {}
      return r;
    };
  };
  Trace.prototype.secs = function () { return this.trace ? +((Date.now() - this.trace.t0) / 1000).toFixed(1) : 0; };
  Trace.prototype.threadStarted = function (th, top, target) {
    var name = target.isStage ? '舞台' : (target.sprite ? target.sprite.name : target.getName());
    if (target.blocks && target.blocks._blocks && !target.blocks._blocks[top]) return;       // a palette block, not a script
    this.live.push({ th: th, name: name, top: top });
    if (this.live.length > 400) this.live.splice(0, this.live.length - 400);
    if (this.trace && !this.trace.stoppedAt) this.scriptRec(name, top, true);
  };
  Trace.prototype.scriptRec = function (name, top, start) {
    var tr = this.trace, k = name + '\u0000' + top, s = tr.scripts[k];
    if (!s) {
      if (Object.keys(tr.scripts).length >= 40) return null;
      s = tr.scripts[k] = { name: name, top: top, started: this.secs(), stopped: null, starts: 0, running: 0 };
    }
    if (start) { s.starts += 1; s.running += 1; }
    return s;
  };
  Trace.prototype.afterStep = function () {
    if (!this.live || !this.live.length) return;
    var rt = this.vm.runtime, still = [], self = this;
    this.live.forEach(function (x) {
      if (rt.threads.indexOf(x.th) >= 0 && !x.th.isKilled) { still.push(x); return; }
      var tr = self.trace;
      if (tr && !tr.stoppedAt) {
        var s = tr.scripts[x.name + '\u0000' + x.top];
        if (s) { s.running = Math.max(0, s.running - 1); s.stopped = self.secs(); }
      }
    });
    this.live = still;
  };

  Trace.prototype.start = function (how) {
    var self = this;
    this.dirty = false;
    this.trace = { t0: Date.now(), how: how, sprites: {}, keys: [], answers: [], stoppedAt: null, idleAt: null, samples: 0, scripts: {} };
    // threads that started a moment before the run was noticed (a click on the sprite starts its thread first)
    (this.live || []).forEach(function (x) { var s = self.scriptRec(x.name, x.top, true); if (s) s.started = 0; });
    this.sig.runs += 1; this.ranSinceTurn = true;
    clearInterval(this._tick);
    this.sample();                       // PROJECT_START comes before the hats run: this is the true start position
    this._tick = setInterval(function () { self.sample(); }, 100);
    if (this.onRun) this.onRun('start');
  };
  Trace.prototype.sprite = function (name) {
    var s = this.trace.sprites[name];
    if (!s) s = this.trace.sprites[name] = { start: null, end: null, minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9, said: [], touched: {}, touchedColors: {}, edge: false, clones: 0, hidden: false };
    return s;
  };
  function hex(rgb) { return '#' + [0, 1, 2].map(function (i) { var v = Math.max(0, Math.min(255, Math.round(+rgb[i] || 0))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function rgbOf(h) { var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(h || '')); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null; }
  Trace.prototype.noteColor = function (name, rgb) {
    if (!this.trace || !name) return;
    var s = this.sprite(name), h = hex(rgb);
    if (!(h in s.touchedColors) && Object.keys(s.touchedColors).length < 6) s.touchedColors[h] = ((Date.now() - this.trace.t0) / 1000).toFixed(1);
  };
  /** a colour check the program makes (碰到顏色) that comes out true is recorded (sampling can miss a quick bounce) */
  Trace.prototype.watchColors = function () {
    var self = this, t = this.vm.runtime.targets[0], P = t && Object.getPrototypeOf(t);
    if (!P || typeof P.isTouchingColor !== 'function' || P.__wlColors) return;
    var orig = P.isTouchingColor;
    P.isTouchingColor = function (rgb) {
      var r = orig.apply(this, arguments);
      if (r && self.trace && !this.isStage && this.sprite && rgb && rgb.length >= 3) self.noteColor(this.sprite.name, rgb);
      return r;
    };
    P.__wlColors = true;
  };
  Trace.prototype.sample = function () {
    var tr = this.trace, rt = this.vm.runtime, self = this; if (!tr) return;
    if (!this.vm.runtime.targets[0] || !Object.getPrototypeOf(this.vm.runtime.targets[0]).__wlColors) this.watchColors();
    tr.samples += 1;
    var orig = rt.targets.filter(function (t) { return !t.isStage && t.isOriginal; });
    var colors = this._colors || (this._colors = (this.colors || []).map(function (h) { return [String(h).toLowerCase(), rgbOf(h)]; }).filter(function (c) { return c[1]; }));
    orig.forEach(function (t) {
      var s = self.sprite(t.getName()), x = Math.round(t.x) || 0, y = Math.round(t.y) || 0;
      if (!s.start) s.start = [x, y];
      // moves = samples in which the sprite stood somewhere new; pen_moves = the same with the pen down (as the read-only lab)
      if (s.end && (s.end[0] !== x || s.end[1] !== y)) {
        s.moves = (s.moves || 0) + 1;
        var pen = t.getCustomState && t.getCustomState('Scratch.pen');
        if (pen && pen.penDown) s.penMoves = (s.penMoves || 0) + 1;
      }
      if (tr.samples % 3 === 0 && colors.length && t.visible && t.isTouchingColor) colors.forEach(function (c) { if (!(c[0] in s.touchedColors) && t.isTouchingColor(c[1])) self.noteColor(t.getName(), c[1]); });
      s.end = [x, y]; s.dir = Math.round(t.direction); s.size = Math.round(t.size); s.visible = t.visible;
      if (!t.visible) s.hidden = true;
      s.minX = Math.min(s.minX, x); s.maxX = Math.max(s.maxX, x); s.minY = Math.min(s.minY, y); s.maxY = Math.max(s.maxY, y);
      if (Math.abs(x) >= 235 || Math.abs(y) >= 175) s.edge = true;
      var cs = t.getCostumes(); s.costume = cs[t.currentCostume] ? cs[t.currentCostume].name : '';
      s.costumeChanges = (s.costumeChanges || 0) + (s.lastCostume != null && s.lastCostume !== t.currentCostume ? 1 : 0); s.lastCostume = t.currentCostume;
      s.clones = Math.max(s.clones, t.sprite.clones.length - 1);
      if (tr.samples % 3 === 0) orig.forEach(function (o) {
        if (o !== t && !s.touched[o.getName()] && t.visible && o.visible && t.isTouchingSprite(o.getName())) s.touched[o.getName()] = ((Date.now() - tr.t0) / 1000).toFixed(1);
      });
    });
    if (rt.threads.length === 0 && tr.samples > 3 && !tr.idleAt) tr.idleAt = Date.now();
    if (Date.now() - tr.t0 > 120000) clearInterval(this._tick);
  };
  Trace.prototype.report = function (program) {
    var tr = this.trace; if (!tr) return null;
    var rt = this.vm.runtime, out = { secs: +(((tr.stoppedAt || Date.now()) - tr.t0) / 1000).toFixed(1),
      still_running: rt.threads.length > 0 && !tr.stoppedAt, ended_by_itself: !!tr.idleAt, keys: tr.keys.slice(0, 15), answers: tr.answers, sprites: {}, vars: {}, lists: {} };
    out.hat_wait = waitsForInput(program);
    if (out.hat_wait) out.ended_by_itself = false;
    Object.keys(tr.sprites).forEach(function (n) {
      var s = tr.sprites[n];
      out.sprites[n] = { start: s.start, end: s.end, x_range: [s.minX, s.maxX], y_range: [s.minY, s.maxY], dir: s.dir, size: s.size,
        visible_at_end: s.visible, was_hidden: s.hidden, reached_edge: s.edge, said: s.said, touched: s.touched, costume: s.costume,
        costume_changes: s.costumeChanges || 0, max_clones: s.clones, touched_colors: s.touchedColors || {}, moves: s.moves || 0, pen_moves: s.penMoves || 0 };
    });
    // per script (dual mode): when it started / stopped, whether it was still running when the report was made
    if (this.mapScript && tr.scripts) {
      var map = this.mapScript, list = [];
      Object.keys(tr.scripts).forEach(function (k) {
        var s = tr.scripts[k], id = map(s.name, s.top); if (!id) return;
        var o = { sprite: s.name, id: id, started: s.started, stopped: s.running > 0 && !tr.stoppedAt ? null : s.stopped, running_at_end: s.running > 0 && !tr.stoppedAt };
        if (s.starts > 1) o.starts = s.starts;
        if (s.by_stop) o.stopped_by_stop = true;
        list.push(o);
      });
      list.sort(function (a, b) { return a.started - b.started; });
      out.scripts = list.slice(0, 30);
    }
    var st = rt.getTargetForStage();
    Object.keys(st.variables).forEach(function (k) {
      var v = st.variables[k];
      if (v.type === '') out.vars[v.name] = v.value;
      else if (v.type === 'list') out.lists[v.name] = { length: v.value.length, first: v.value.slice(0, 12) };
    });
    out.backdrop = st.getCostumes()[st.currentCostume] ? st.getCostumes()[st.currentCostume].name : '';
    return out;
  };
  Trace.prototype.turnDone = function () { this.ranSinceTurn = false; this.sig = { runs: 0, stops: 0, undo: 0 }; };

  function waitsForInput(prog) {
    var found = false;
    function scan(scr) { Object.keys(scr || {}).forEach(function (k) { var a = scr[k]; if (a && a[0] && WAIT_HATS[a[0].op]) found = true; }); }
    Object.keys((prog && prog.sprites) || {}).forEach(function (n) { scan((prog.sprites[n] || {}).scripts); });
    scan(prog && prog.stage && prog.stage.scripts);
    return found;
  }
  global.StudioTrace = Trace;
})(window);
