/*!
 * Wonder Lab Studio — the AI's block edits, shown as if a person made them with the mouse (package ANIM, 2026-10-07).
 * Copyright (C) 2026 IITS (工信學堂（香港）). GNU Affero General Public License v3.0 only (see LICENSE).
 * Icons: Lucide "mouse-pointer-2" and "skip-forward" (lucide-static 1.52.0, ISC licence).
 *
 *   window.WLAnim.play({vm, before, after, ops, root, onProgress, focus?, studioOps?, place?, budgetMs?, instant?})
 *       -> Promise<{ok, skipped, fallback, animated, cut, done, notApplied, sideBySide, editing, ms, diffs}>
 *   WLAnim.enabled() / WLAnim.setEnabled(bool) / WLAnim.skip() / WLAnim.busy()
 *
 * How: every op of the reply becomes the moves a student would make on the GUI's own Blockly workspace. A visible
 * pointer goes to the palette, selects the category (the palette scrolls), picks the block, and drags it with Blockly's
 * own dragger (insertion-marker preview, snapping) to its place; numbers and text are typed into the field editor,
 * dropdown options are picked from the real menu, and removed blocks are dragged back to the palette (a single block
 * is lifted out like a ctrl-drag, so the stack heals). Only the blocks that differ between the old and the new script
 * are touched (a stack-by-stack LCS diff that also recognises "wrap these blocks in a loop"). The VM receives the
 * ordinary Blockly events (create / move / change / delete), exactly as for a real drag.
 * Correctness: afterwards the live program is decompiled exactly as studio-ops.js does and compared, script by
 * script, with what the instant apply gives (build + decompile of the reply's program). On any difference the touched
 * sprites are put back to their state before the turn and the instant apply runs instead (fallback: true, logged).
 * Skip / time budget / hidden page: the animation stops where it is and the rest is applied instantly the same way.
 */
(function (global) {
  'use strict';
  var STAGE = '舞台';
  var PREF = 'wl-anim';
  var BUDGET = 8000;                 // ms of animation per turn at most
  var MIN_K = 0.4;                   // fastest time scale; beyond that the rest of the turn is applied instantly
  var SPEC = null, OPS = null, ACTIVE = null, MEM_PREF = null, LAST_PTR = null;
  var STOP = { stop: true };         // thrown through the animation when it must finish instantly
  var CAT = { motion: 'motion', looks: 'looks', sound: 'sound', event: 'events', control: 'control', sensing: 'sensing',
    operator: 'operators', data: 'variables', pen: 'pen' };
  var SHADOW_FIELD = { num: 'NUM', pos: 'NUM', whole: 'NUM', int: 'NUM', angle: 'NUM', color: 'COLOUR', text: 'TEXT' };
  var NUMERIC = { num: 1, pos: 1, whole: 1, int: 1, angle: 1 };
  var SOUP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var PTR_SVG = '<svg class="wl-anim-ptr-ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/></svg>';
  var SKIP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 4v16"/><path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z"/></svg>';
  var CSS = '.wl-anim-ptr{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483000;pointer-events:none;color:#0f172a;' +
    'filter:drop-shadow(0 0 1.5px #fff) drop-shadow(0 1px 2px rgba(15,23,42,.45));opacity:0;transition:opacity .18s ease;will-change:transform}' +
    '.wl-anim-ptr.on{opacity:1}.wl-anim-ptr svg{display:block;width:26px;height:26px}' +
    '.wl-anim-ring{position:fixed;left:0;top:0;width:24px;height:24px;margin:-12px 0 0 -12px;border:2px solid #6a3fc0;border-radius:50%;' +
    'z-index:2147483000;pointer-events:none;opacity:0}' +
    '.wl-anim-ring.on{animation:wl-anim-ring .34s ease-out}' +
    '@keyframes wl-anim-ring{from{opacity:.95;transform:scale(.35)}to{opacity:0;transform:scale(1.45)}}' +
    '.wl-anim-skip{position:fixed;z-index:2147483001;pointer-events:auto;display:inline-flex;align-items:center;gap:6px;min-height:44px;' +
    'padding:0 16px;border-radius:999px;border:1px solid #6a3fc0;background:#6a3fc0;color:#fff;cursor:pointer;white-space:nowrap;' +
    'font:700 14px/1.2 system-ui,-apple-system,"PingFang HK","Noto Sans TC","Microsoft JhengHei",sans-serif;box-shadow:0 6px 18px rgba(60,30,110,.25)}' +
    '.wl-anim-skip:hover{background:#5a2ea0}.wl-anim-skip:focus-visible{outline:3px solid #ffb000;outline-offset:2px}' +
    '.wl-anim-skip svg{width:16px;height:16px;flex:none}';

  /* ------------------------------------------------------------------ small helpers */
  function now() { return global.performance && performance.now ? performance.now() : Date.now(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function noop() {}
  function js(x) { return JSON.stringify(x); }
  function rand6() { var s = ''; for (var i = 0; i < 6; i++) s += SOUP.charAt(Math.floor(Math.random() * SOUP.length)); return s; }
  function topIdFor(sid) { return 'wl_' + sid + '_' + rand6(); }
  function scriptsOf(prog, sprite) {
    var t = sprite === STAGE ? (prog && prog.stage) : (prog && prog.sprites && prog.sprites[sprite]);
    return (t && t.scripts) || {};
  }
  function countOps(x) { var n = 0; js(x || []).replace(/"op":/g, function () { n += 1; }); return n; }
  function reducedMotion() {
    try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function rafP() {
    return new Promise(function (r) { try { requestAnimationFrame(function () { r(); }); } catch (e) { setTimeout(r, 16); } });
  }
  /** Blockly fires its events after the next animation frame (+ a timeout): wait until the VM has received them. */
  function flushEvents() {
    return new Promise(function (res) {
      function go() { rafP().then(function () { setTimeout(function () { rafP().then(function () { setTimeout(res, 0); }); }, 0); }); }
      if (!document.hidden) return go();
      var on = function () { if (!document.hidden) { document.removeEventListener('visibilitychange', on); go(); } };
      document.addEventListener('visibilitychange', on);
    });
  }
  function pe(x, y, heal) {
    var o = { clientX: x, clientY: y, pointerId: 7311, pointerType: 'mouse', isPrimary: true, bubbles: true, button: 0, buttons: 1, ctrlKey: !!heal };
    try { return new PointerEvent('pointermove', o); } catch (e) { return new MouseEvent('mousemove', o); }
  }
  /** onProgress(done, total, info): steps done so far, steps planned, {phase: start|task|step|done, kind, sprite, id}. */
  function progress(fn, done, total, info) {
    if (typeof fn === 'function') try { fn(done, total, info || {}); } catch (e) { /* the host's callback must not break the run */ }
  }

  /* ------------------------------------------------------------------ preference */
  function enabled() {
    if (reducedMotion()) return false;
    if (MEM_PREF !== null) return MEM_PREF;
    try { return global.localStorage.getItem(PREF) !== '0'; } catch (e) { return true; }
  }
  function setEnabled(on) {
    MEM_PREF = !!on;
    try { global.localStorage.setItem(PREF, on ? '1' : '0'); MEM_PREF = null; } catch (e) { /* storage blocked: keep it for this page */ }
    return enabled();
  }

  /* ------------------------------------------------------------------ program model (same rules as studio-ops.js) */
  function loadSpec(opts) {
    if (SPEC) return Promise.resolve(SPEC);
    var so = opts.studioOps || (global.WLStudio && global.WLStudio.ops);
    if (so && so.spec && so.spec.opcodes) { SPEC = so.spec; OPS = new global.StudioOps(SPEC); return Promise.resolve(SPEC); }
    return fetch(opts.specUrl || 'opcodes.json', { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('opcodes.json ' + r.status);
      return r.json();
    }).then(function (j) { SPEC = j; OPS = new global.StudioOps(SPEC); return SPEC; });
  }
  function defOf(op) { return (SPEC && SPEC.opcodes[op]) || null; }
  function isHat(op) { var d = defOf(op); return !!d && d.shape === 'hat'; }
  function hasSubstack(op) { var d = defOf(op); return !!(d && d.inputs && d.inputs.SUBSTACK === 'stack'); }
  /** What the instant apply makes of a compact script: build (studio-ops) + decompile, with a side-effect-free VM stand-in. */
  function canon(vm, target, list) {
    var real = vm.runtime.getTargetForStage();
    var fakeStage = { isStage: true, variables: {}, createVariable: noop, getCostumes: function () { return real.getCostumes(); } };
    var fakeVm = { runtime: { getTargetForStage: function () { return fakeStage; } } };
    var fakeT = target.isStage ? fakeStage : { isStage: false, variables: {}, getCostumes: function () { return target.getCostumes(); } };
    var built = OPS.build(fakeVm, fakeT, Array.isArray(list) ? list : [], 0, 0, 'x');
    if (!built.top) return [];
    var B = {};
    built.blocks.forEach(function (b) { B[b.id] = b; });
    return OPS.stackOut(B, built.top, { bad: [] });
  }
  function liveScripts(target) {
    var B = target.blocks._blocks;
    return target.blocks.getScripts().filter(function (id) { return B[id] && !B[id].shadow; }).map(function (top) {
      var ctx = { bad: [] }, blocks = OPS.stackOut(B, top, ctx);
      return { top: top, blocks: blocks, foreign: ctx.bad.length > 0, x: B[top].x || 0, y: B[top].y || 0 };
    });
  }

  /* ------------------------------------------------------------------ diff: which old blocks stay, which are new */
  function lcs(n, m, w) {
    var S = [], i, j;
    for (i = 0; i <= n; i++) { S.push([]); for (j = 0; j <= m; j++) S[i].push(0); }
    for (i = 1; i <= n; i++) for (j = 1; j <= m; j++) {
      var best = Math.max(S[i - 1][j], S[i][j - 1]), wt = w(i - 1, j - 1);
      if (wt > 0) best = Math.max(best, S[i - 1][j - 1] + wt);
      S[i][j] = best;
    }
    var pairs = [];
    i = n; j = m;
    while (i > 0 && j > 0) {
      var w2 = w(i - 1, j - 1);
      if (w2 > 0 && Math.abs(S[i][j] - (S[i - 1][j - 1] + w2)) < 1e-9) { pairs.push([i - 1, j - 1]); i--; j--; }
      else if (S[i - 1][j] >= S[i][j - 1]) i--; else j--;
    }
    return pairs.reverse();
  }
  function sim(a, b) {
    var ks = {}, eq = 0, keys;
    Object.keys(a || {}).concat(Object.keys(b || {})).forEach(function (k) { if (k !== 'op') ks[k] = 1; });
    keys = Object.keys(ks);
    if (!keys.length) return 1;
    keys.forEach(function (k) { if (js(a[k]) === js(b[k])) eq += 1; });
    return eq / keys.length;
  }
  /** O: [{op, c}] (old stack), N: [compact] (new stack). A non-top old block never becomes the top of a script (the top
      block carries the script id). An unmatched new C-block may wrap a run of unmatched old blocks that match its inside. */
  function align(O, N, isTop) {
    var pairs = lcs(O.length, N.length, function (i, j) {
      if (O[i].op !== N[j].op) return 0;
      if (isTop && j === 0 && i !== 0) return 0;
      return 1 + 0.5 * sim(O[i].c, N[j]);
    });
    var pi = {}, pj = {}, wraps = {}, wrapped = {};
    pairs.forEach(function (p) { pi[p[0]] = p[1]; pj[p[1]] = p[0]; });
    for (var j = 0; j < N.length; j++) {
      if (j in pj || !hasSubstack(N[j].op)) continue;
      var lo = -1, hi = O.length, jj, i;
      for (jj = j - 1; jj >= 0; jj--) if (jj in pj) { lo = pj[jj]; break; }
      for (jj = j + 1; jj < N.length; jj++) if (jj in pj) { hi = pj[jj]; break; }
      var run = [];
      for (i = lo + 1; i < hi; i++) { if (wrapped[i]) run = []; else if (!(i in pi) && !isHat(O[i].op)) run.push(i); }
      var sub = N[j].SUBSTACK || [];
      if (!run.length || !sub.length) continue;
      var inner = lcs(run.length, sub.length, function (a, b) { return O[run[a]].op === sub[b].op ? 1 : 0; });
      if (!inner.length) continue;
      var range = run.slice(inner[0][0], inner[inner.length - 1][0] + 1);
      wraps[j] = range;
      range.forEach(function (k) { wrapped[k] = true; });
    }
    return { pi: pi, pj: pj, wraps: wraps, wrapped: wrapped };
  }
  /* rough cost of a diff, for the time budget: d = drags, e = field edits */
  function costNew(n) {
    var d = 1, e = 0, def = defOf(n.op) || {};
    Object.keys(def.inputs || {}).forEach(function (k) {
      var v = n[k], t = def.inputs[k];
      if (t === 'stack') { (v || []).forEach(function (b) { var c = costNew(b); d += c.d; e += c.e; }); return; }
      if (v && typeof v === 'object') { if (v.op) { var c2 = costNew(v); d += c2.d; e += c2.e; } else d += 1; return; }
      if (v !== undefined) e += 0.6;
    });
    Object.keys(def.fields || {}).forEach(function (k) { if (n[k] !== undefined) e += 0.4; });
    return { d: d, e: e };
  }
  function costBlock(o, n) {
    var d = 0, e = 0, def = defOf(n.op) || {};
    Object.keys(def.inputs || {}).forEach(function (k) {
      var t = def.inputs[k], a = o[k], b = n[k];
      if (t === 'stack') { var c = costStack(a || [], b || [], false); d += c.d; e += c.e; return; }
      if (js(a) === js(b)) return;
      if (b && typeof b === 'object') {
        if (a && typeof a === 'object' && a.op && b.op && a.op === b.op) { var c3 = costBlock(a, b); d += c3.d; e += c3.e; }
        else { var c4 = b.op ? costNew(b) : { d: 1, e: 0 }; d += c4.d + (a && typeof a === 'object' ? 1 : 0); e += c4.e; }
      } else { e += 1; if (a && typeof a === 'object') d += 1; }
    });
    Object.keys(def.fields || {}).forEach(function (k) { if (js(o[k]) !== js(n[k])) e += 1; });
    return { d: d, e: e };
  }
  function costStack(O, N, isTop) {
    var al = align(O.map(function (c) { return { op: c.op, c: c }; }), N, isTop), d = 0, e = 0, i, j;
    for (i = 0; i < O.length; i++) {
      if ((i in al.pi) || al.wrapped[i]) continue;
      d += 1;
      var rest = true;
      for (var k = i; k < O.length; k++) if ((k in al.pi) || al.wrapped[k]) { rest = false; break; }
      if (rest) break;
    }
    for (j = 0; j < N.length; j++) {
      var c;
      if (j in al.pj) c = costBlock(O[al.pj[j]], N[j]);
      else if (al.wraps[j]) {
        var inner = costStack(al.wraps[j].map(function (x) { return O[x]; }), N[j].SUBSTACK || [], false);
        c = { d: 2 + inner.d, e: inner.e };
      } else c = costNew(N[j]);
      d += c.d; e += c.e;
    }
    return { d: d, e: e };
  }

  /* ------------------------------------------------------------------ the editor (scratch-gui's Blocks container) */
  function guiBlocks() {
    var els = document.querySelectorAll('.injectionDiv');
    for (var n = 0; n < els.length; n++) {
      for (var node = els[n]; node; node = node.parentElement) {
        var key = Object.keys(node).filter(function (k) { return k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0; })[0];
        if (!key) continue;
        for (var f = node[key]; f; f = f['return']) { var s = f.stateNode; if (s && s.workspace && s.ScratchBlocks) return s; }
      }
    }
    return null;
  }
  function chain(first) { var out = []; for (var b = first, g = 0; b && g < 500; g++) { out.push(b); b = b.getNextBlock(); } return out; }
  function isInside(b, c) {
    var p = b && b.previousConnection && b.previousConnection.targetConnection;
    return !!p && p.getSourceBlock() === c && p !== c.nextConnection;
  }
  /** Decompile one Blockly block (the workspace's own state, used for the diff while the VM may lag one frame). */
  function bOut(b) {
    var def = defOf(b.type), o = { op: b.type };
    if (!def) return o;
    Object.keys(def.inputs || {}).forEach(function (name) {
      var t = def.inputs[name], inp = b.getInput(name), c = inp && inp.connection && inp.connection.targetBlock();
      if (!c) return;
      if (t === 'stack') { o[name] = chain(c).map(bOut); return; }
      if (t === 'bool') { o[name] = bOut(c); return; }
      if (c.type === 'data_variable') { var vf = c.getField('VARIABLE'); o[name] = { 'var': vf ? vf.getText() : '' }; return; }
      if (c.type === 'data_listcontents') { var lf = c.getField('LIST'); o[name] = { list: lf ? lf.getText() : '' }; return; }
      if (c.isShadow()) {
        var f = c.inputList[0] && c.inputList[0].fieldRow[0], v = f ? f.getValue() : '';
        if (t === 'broadcast' && f) v = f.getText();
        o[name] = NUMERIC[t] && v !== '' && isFinite(+v) ? +v : v;
        return;
      }
      o[name] = bOut(c);
    });
    Object.keys(def.fields || {}).forEach(function (name) {
      var f = b.getField(name), ft = def.fields[name];
      if (f) o[name] = (ft === 'var' || ft === 'list' || ft === 'broadcast') ? f.getText() : f.getValue();
    });
    return o;
  }

  /* ------------------------------------------------------------------ one turn */
  function Run(vm, opts) {
    this.vm = vm; this.opts = opts || {};
    this.k = 1; this.instant = false; this.skipFlag = false; this.why = null;
    this.waiters = []; this.holding = null; this.lastCat = null; this.cleanups = [];
    this.res = { ok: false, skipped: false, fallback: false, animated: false, cut: null, done: [], notApplied: [], sideBySide: [], editing: null, ms: 0, diffs: [] };
  }

  Run.prototype.prepare = async function () {
    var vm = this.vm, self = this, opts = this.opts;
    this.after = opts.after || { sprites: {}, stage: { scripts: {} } };
    this.so = opts.studioOps || (global.WLStudio && global.WLStudio.ops) || null;
    var g = guiBlocks();
    if (g && g.workspace) { this.gui = g; this.SB = g.ScratchBlocks; this.ws = g.workspace; }
    var ops = (opts.ops || []).filter(function (o) { return o && (o['do'] === 'set_script' || o['do'] === 'delete_script'); });
    var pen = ops.some(function (o) { return o['do'] === 'set_script' && /"op":"pen_/.test(js(scriptsOf(self.after, o.sprite)[o.id] || [])); });
    if (pen && !vm.extensionManager.isExtensionLoaded('pen')) await vm.extensionManager.loadExtensionURL('pen');
    this.byName = {};
    OPS.targets(vm).forEach(function (t) { self.byName[OPS.nameOf(t)] = t; });
    this.start = {}; this.tops = {}; this.saved = {}; this.final = {}; this.touched = {};
    var tasks = [];
    ops.forEach(function (o) {
      var t = self.byName[o.sprite];
      if (!t) { self.res.notApplied.push(o); return; }
      var name = OPS.nameOf(t), st = self.startOf(t), sid = String(o.id);
      var exists = self.simTop(name, sid), foreign = exists && !!st.foreign[sid];
      if (o['do'] === 'delete_script') {
        if (!exists || foreign) { self.res.notApplied.push(o); return; }
        tasks.push({ op: o, kind: 'delete', target: t, name: name, sid: sid, sidOut: sid });
        self.sim[name][sid] = false;
        self.final[name][sid] = null; self.touched[name][sid] = 1;
        return;
      }
      var list = scriptsOf(self.after, o.sprite)[o.id];
      if (!Array.isArray(list)) { self.res.notApplied.push(o); return; }
      var side = !!foreign, sidOut = side ? sid + 'b' : sid;
      if (side) self.res.sideBySide.push(o);
      var c = canon(vm, t, list);
      tasks.push({ op: o, kind: 'set', target: t, name: name, sid: sid, sidOut: sidOut, side: side, list: list, canon: c,
        pos: (!side && st.pos[sid]) || null });
      self.sim[name][sidOut] = c.length > 0;
      self.final[name][sidOut] = c; self.touched[name][sidOut] = 1;
    });
    // one sprite after the other: the sprite on screen first (no switch), the reply's focus sprite last
    var order = [], ed = vm.editingTarget, focus = opts.focus && this.byName[opts.focus];
    if (ed && tasks.some(function (k) { return k.target === ed; }) && ed !== focus) order.push(ed);
    tasks.forEach(function (k) { if (order.indexOf(k.target) < 0 && k.target !== focus) order.push(k.target); });
    if (focus && tasks.some(function (k) { return k.target === focus; })) order.push(focus);
    this.tasks = [];
    order.forEach(function (t) { tasks.forEach(function (k) { if (k.target === t) self.tasks.push(k); }); });
  };
  /** State of a sprite before the turn: saved VM blocks (for an exact restore), scripts, their ids and positions. */
  Run.prototype.startOf = function (t) {
    var name = OPS.nameOf(t);
    if (this.start[name]) return this.start[name];
    var B = t.blocks._blocks, scripts = liveScripts(t), map = this.sidMap(t, name, scripts), sidOf = {}, foreign = {}, pos = {};
    Object.keys(map).forEach(function (sid) { sidOf[map[sid]] = sid; });
    scripts.forEach(function (s) { var sid = sidOf[s.top]; if (sid) { foreign[sid] = s.foreign; pos[sid] = { x: s.x, y: s.y }; } });
    this.saved[t.id] = { target: t, blocks: JSON.parse(js(B)), scripts: t.blocks._scripts.slice() };
    this.start[name] = { target: t, scripts: scripts, topOf: map, sidOf: sidOf, foreign: foreign, pos: pos };
    this.tops[name] = Object.assign({}, map);
    this.final[name] = {}; this.touched[name] = {};
    (this.sim || (this.sim = {}))[name] = {};
    Object.keys(map).forEach(function (sid) { this.sim[name][sid] = true; }, this);
    return this.start[name];
  };
  Run.prototype.simTop = function (name, sid) { return this.sim[name][sid] !== false && (sid in this.sim[name]); };
  /** script id -> top block id, as studio.js's snapshot names them (its StudioOps map if we have it, else rebuilt). */
  Run.prototype.sidMap = function (t, name, scripts) {
    var map = {}, claimed = {}, B = t.blocks._blocks, so = this.so;
    if (so && so.sids && so.sids[name]) {
      var m = so.sids[name];
      Object.keys(m).forEach(function (top) { if (B[top] && B[top].topLevel && !(m[top] in map)) { map[m[top]] = top; claimed[top] = 1; } });
    }
    var want = scriptsOf(this.opts.before, name);
    Object.keys(want).forEach(function (sid) {
      if (sid in map) return;
      var j = js(want[sid]), hit = scripts.filter(function (s) { return !claimed[s.top] && js(s.blocks) === j; });
      var pick = hit.filter(function (s) { return s.top.indexOf('wl_' + sid + '_') === 0; })[0] || hit[0];
      if (pick) { map[sid] = pick.top; claimed[pick.top] = 1; }
    });
    scripts.forEach(function (s) {
      if (claimed[s.top]) return;
      var mm = /^wl_([A-Za-z0-9-]{1,12})_/.exec(s.top);
      if (mm && !(mm[1] in map)) { map[mm[1]] = s.top; claimed[s.top] = 1; }
    });
    return map;
  };

  Run.prototype.go = async function () {
    var t0 = this.t0 = now(), res = this.res;
    this.log = this.opts.debug ? [] : null;
    await this.prepare();
    this.mark('prepared ' + this.tasks.length);
    this.idx = 0;
    this.stepsDone = 0; this.stepsTotal = Math.max(1, this.tasks.length);
    progress(this.opts.onProgress, 0, this.stepsTotal, { phase: 'start', tasks: this.tasks.length });
    if (this.tasks.length) {
      var animate = !this.opts.instant && enabled() && this.canAnimate();
      try {
        if (animate) {
          res.animated = true;
          try { await this.animateAll(); } catch (e) {
            if (e !== STOP) { this.err = e; if (global.console) console.warn('[WLAnim] animation error, applying instantly:', e && e.message || e); }
          }
          this.teardown();
          if (this.skipFlag) res.skipped = true;
          res.cut = this.why || null;                // why the rest was applied instantly: skip | budget | hidden
        }
        this.mark('animation ended' + (this.why ? ' (' + this.why + ')' : ''));
        // the editor's own events of the animation must reach the VM before anything is written into the VM directly
        // (Blockly delivers them after the next frame; in a hidden page only once it is shown again)
        if (res.animated) await flushEvents();
        if (this.idx < this.tasks.length) { this.exactApply(this.idx); this.mark('instant apply from task ' + this.idx); }
        var v = this.verify();
        this.mark('verified ' + v.ok);
        if (!v.ok) {
          res.fallback = true; res.diffs = v.diffs;
          if (global.console) console.warn('[WLAnim] end state differs from the reply; applied instantly instead', v.diffs);
          this.restore();
          this.exactApply(0);
          var v2 = this.verify();
          if (!v2.ok) { res.diffs2 = v2.diffs; if (global.console) console.warn('[WLAnim] instant apply check', v2.diffs); }
        }
        this.syncWorkspace();
      } catch (e) {
        this.teardown();
        try { this.restore(); this.syncWorkspace(); } catch (x) { /* nothing more we can do */ }
        throw e;                                     // the caller applies instantly (its own path)
      }
    }
    try { var g = guiBlocks(); if (g && g.workspace) g.workspace.clearUndo(); } catch (e) { /* undo history is only a convenience */ }
    res.ok = true;
    res.done = this.doneList();
    res.editing = this.vm.editingTarget ? OPS.nameOf(this.vm.editingTarget) : null;
    res.ms = Math.round(now() - t0);
    if (this.log) { res.timeline = this.log; res.k = +this.k.toFixed(2); res.estimate = this.est; }
    progress(this.opts.onProgress, this.stepsTotal, this.stepsTotal, { phase: 'done', animated: res.animated, skipped: res.skipped, fallback: res.fallback });
    return res;
  };
  Run.prototype.doneList = function () {
    var self = this, out = [];
    this.tasks.forEach(function (k) {
      var top = k.kind === 'set' ? (self.tops[k.name][k.sidOut] || null) : null;
      if (k.kind === 'set' && !top) return;
      out.push({ op: k.op, sprite: k.name, id: k.sidOut, top: top, target: k.target });
    });
    return out;
  };

  Run.prototype.canAnimate = function () {
    var g = guiBlocks();
    if (!g || !g.workspace || document.hidden) return false;
    var ws = g.workspace;
    if (ws.isVisible && !ws.isVisible()) return false;
    var inj = ws.getInjectionDiv && ws.getInjectionDiv();
    if (!inj) return false;
    var r = inj.getBoundingClientRect();
    if (r.width < 300 || r.height < 240) return false;
    if (!ws.getFlyout || !ws.getFlyout() || !ws.getToolbox || !ws.getToolbox()) return false;
    this.gui = g; this.SB = g.ScratchBlocks; this.ws = ws;
    return !!(this.SB.dragging && this.SB.registry && this.SB.serialization);
  };

  /* ------------------------------------------------------------------ timing primitives (all honour skip) */
  Run.prototype.goInstant = function (why) {
    if (this.instant) return;
    this.instant = true; this.why = why;
    var w = this.waiters; this.waiters = [];
    w.forEach(function (x) { try { x.finish(); } catch (e) { /* ignore */ } });
  };
  Run.prototype.skip = function () { this.skipFlag = true; this.goInstant('skip'); };
  Run.prototype.check = function () {
    if (!this.instant && this.budgetAt && now() > this.budgetAt) this.goInstant('budget');
    if (this.instant) throw STOP;
  };
  Run.prototype.wait = function (ms) {
    var self = this;
    this.check();
    if (ms <= 0) return Promise.resolve();
    return new Promise(function (res, rej) {
      var entry = { finish: function () { clearTimeout(id); rej(STOP); } };
      var id = setTimeout(function () { self.waiters = self.waiters.filter(function (x) { return x !== entry; }); res(); }, ms * self.k);
      self.waiters.push(entry);
    });
  };
  Run.prototype.tween = function (ms, step) {
    var self = this;
    this.check();
    var dur = Math.max(1, ms * this.k), t0 = now();
    return new Promise(function (res, rej) {
      var done = false;
      var entry = { finish: function () { if (done) return; done = true; rej(STOP); } };
      self.waiters.push(entry);
      function frame() {
        if (done) return;
        var t = Math.min(1, (now() - t0) / dur);
        try { step(ease(t)); } catch (e) { done = true; self.waiters = self.waiters.filter(function (x) { return x !== entry; }); return rej(e); }
        if (t >= 1) { done = true; self.waiters = self.waiters.filter(function (x) { return x !== entry; }); return res(); }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  };
  Run.prototype.frame = function () {
    var self = this;
    this.check();
    return new Promise(function (res, rej) {
      var entry = { finish: function () { rej(STOP); } };
      self.waiters.push(entry);
      requestAnimationFrame(function () { self.waiters = self.waiters.filter(function (x) { return x !== entry; }); if (self.instant) rej(STOP); else res(); });
    });
  };
  Run.prototype.until = async function (fn, maxMs) {
    var t0 = now();
    while (!fn()) { if (now() - t0 > maxMs) return false; await this.frame(); }
    return true;
  };
  Run.prototype.rendered = async function () {
    var SB = this.SB, done = false;
    try { SB.renderManagement.finishQueuedRenders().then(function () { done = true; }); } catch (e) { done = true; }
    await this.until(function () { return done; }, 400);
  };
  Run.prototype.events = async function () { await this.frame(); await this.wait(0); await this.frame(); };

  /* ------------------------------------------------------------------ pointer, skip button, guards */
  Run.prototype.ui = function () {
    var self = this;
    if (!document.getElementById('wl-anim-style')) {
      var st = document.createElement('style'); st.id = 'wl-anim-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    var ptr = this.ptrEl = document.createElement('div');
    ptr.className = 'wl-anim-ptr'; ptr.setAttribute('aria-hidden', 'true'); ptr.innerHTML = PTR_SVG;
    var ring = this.ringEl = document.createElement('div'); ring.className = 'wl-anim-ring'; ring.setAttribute('aria-hidden', 'true');
    var btn = this.skipEl = document.createElement('button');
    btn.type = 'button'; btn.className = 'wl-anim-skip'; btn.innerHTML = SKIP_SVG + '<span>跳過動畫</span>';
    btn.setAttribute('aria-label', '跳過動畫，立即完成 AI 的改動');
    document.body.appendChild(ring); document.body.appendChild(ptr); document.body.appendChild(btn);
    this.placeSkip();
    var ws = this.ws, svg = ws.getParentSvg().getBoundingClientRect(), view = this.viewRect();
    var p0 = LAST_PTR && LAST_PTR.x > svg.left && LAST_PTR.x < svg.right ? LAST_PTR : { x: view.right - 40, y: view.top + Math.min(160, view.height / 3) };
    this.ptr = { x: p0.x, y: p0.y };
    this.drawPtr();
    document.documentElement.setAttribute('data-wl-anim', '1');
    // a real drag runs inside a Blockly Gesture, and the focus code (block focus -> scrollBoundsIntoView) then leaves the
    // view alone; our drags have no Gesture, so the view would jump on every pick and drop: keep it still while we run
    var had = Object.prototype.hasOwnProperty.call(ws, 'scrollBoundsIntoView'), prev = ws.scrollBoundsIntoView;
    ws.scrollBoundsIntoView = function () {};
    this.cleanups.push(function () { if (had) ws.scrollBoundsIntoView = prev; else delete ws.scrollBoundsIntoView; });
    // the student's own pointer / keys must not reach the blocks area while the AI is editing (the lock of the page
    // does this too; this guard keeps the drag safe even without it). Untrusted (our own) events are not touched.
    var inj = ws.getInjectionDiv();
    var stop = function (e) { if (e.isTrusted) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); } };
    ['pointerdown', 'mousedown', 'touchstart', 'wheel', 'contextmenu', 'dblclick'].forEach(function (ev) {
      inj.addEventListener(ev, stop, { capture: true, passive: false });
      self.cleanups.push(function () { inj.removeEventListener(ev, stop, { capture: true }); });
    });
    var keys = function (e) {
      if (!e.isTrusted) return;
      var t = e.target;
      if (t && t.closest && (inj.contains(t) || t.closest('.blocklyWidgetDiv') || t.closest('.blocklyDropDownDiv'))) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); }
    };
    ['keydown', 'keypress', 'beforeinput'].forEach(function (ev) {
      document.addEventListener(ev, keys, true);
      self.cleanups.push(function () { document.removeEventListener(ev, keys, true); });
    });
    var vis = function () { if (document.hidden) self.goInstant('hidden'); };
    document.addEventListener('visibilitychange', vis);
    this.cleanups.push(function () { document.removeEventListener('visibilitychange', vis); });
    var rs = function () { self.placeSkip(); };
    global.addEventListener('resize', rs);
    this.cleanups.push(function () { global.removeEventListener('resize', rs); });
  };
  /** Next to the page's 「AI 正在改積木…」 message when there is one (lab-frame.html), else the bottom-left corner of the
      code area (the zoom buttons are bottom-right). */
  Run.prototype.placeSkip = function () {
    if (!this.skipEl || !this.ws) return;
    var v = this.viewRect(), b = this.skipEl, w = b.offsetWidth || 120, h = b.offsetHeight || 44;
    var m = document.getElementById('wl-lockmsg'), r = m && !m.hidden && m.getBoundingClientRect();
    var x, y;
    if (r && r.width) {
      x = r.right + 8; y = r.top + (r.height - h) / 2;
      if (x + w > global.innerWidth - 8) { x = Math.max(8, r.left + (r.width - w) / 2); y = r.bottom + 8; }
    } else { x = v.left + 14; y = Math.max(v.top + 8, v.bottom - h - 22); }
    b.style.left = Math.round(x) + 'px'; b.style.top = Math.round(y) + 'px';
  };
  Run.prototype.teardown = function () {
    var SB = this.SB;
    this.cleanups.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } });
    this.cleanups = [];
    [this.ptrEl, this.ringEl, this.skipEl].forEach(function (el) { if (el && el.parentNode) el.parentNode.removeChild(el); });
    this.ptrEl = this.ringEl = this.skipEl = null;
    document.documentElement.removeAttribute('data-wl-anim');
    if (SB) {
      try { SB.WidgetDiv.hide(); } catch (e) { /* ignore */ }
      try { SB.DropDownDiv.hideWithoutAnimation(); } catch (e) { /* ignore */ }
    }
    if (this.ws) try { this.ws.setResizesEnabled(true); } catch (e) { /* ignore */ }
    if (this.ptr) LAST_PTR = { x: this.ptr.x, y: this.ptr.y };
  };
  Run.prototype.drawPtr = function () {
    if (!this.ptrEl) return;
    this.ptrEl.style.transform = 'translate(' + (this.ptr.x - 5).toFixed(1) + 'px,' + (this.ptr.y - 5).toFixed(1) + 'px)';
  };
  Run.prototype.stepped = function (what) {
    this.stepsDone += 1;
    if (this.stepsDone >= this.stepsTotal) this.stepsTotal = this.stepsDone + 1;
    progress(this.opts.onProgress, this.stepsDone, this.stepsTotal, { phase: 'step', what: what });
    this.placeSkip();                               // the page's message may have changed width
  };
  Run.prototype.mark = function (what) { if (this.log) this.log.push([Math.round(now() - this.t0), what]); };
  Run.prototype.moveTo = async function (x, y, o) {
    o = o || {};
    var self = this, p0 = { x: this.ptr.x, y: this.ptr.y }, dx = x - p0.x, dy = y - p0.y, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.5 && !o.drag) return;
    var ms = o.ms || clamp(70 + dist * 0.32, 100, 260);
    var bend = Math.min(36, dist * 0.1) * (o.drag ? 0.4 : 1), nx = dist ? -dy / dist : 0, ny = dist ? dx / dist : 0;
    await this.tween(ms, function (t) {
      var arc = 4 * t * (1 - t) * bend;
      self.ptr.x = p0.x + dx * t + nx * arc; self.ptr.y = p0.y + dy * t + ny * arc;
      if (t >= 1) { self.ptr.x = x; self.ptr.y = y; }
      self.drawPtr();
      if (o.drag) o.drag(self.ptr.x, self.ptr.y);
    });
  };
  Run.prototype.pulse = function () {
    var r = this.ringEl; if (!r) return;
    r.style.left = this.ptr.x + 'px'; r.style.top = this.ptr.y + 'px';
    r.classList.remove('on'); void r.offsetWidth; r.classList.add('on');
  };
  Run.prototype.click = async function () { this.pulse(); await this.wait(60); };
  Run.prototype.press = async function () { this.pulse(); await this.wait(40); };

  /* ------------------------------------------------------------------ geometry */
  Run.prototype.toClient = function (ws, x, y) {
    var inj = ws.getInjectionDiv().getBoundingClientRect(), o = ws.getOriginOffsetInPixels();
    return { x: inj.left + o.x + x * ws.scale, y: inj.top + o.y + y * ws.scale };
  };
  Run.prototype.toWs = function (cx, cy) {
    var ws = this.ws, inj = ws.getInjectionDiv().getBoundingClientRect(), o = ws.getOriginOffsetInPixels();
    return { x: (cx - inj.left - o.x) / ws.scale, y: (cy - inj.top - o.y) / ws.scale };
  };
  Run.prototype.viewRect = function () {           // the visible code area, client coordinates
    var ws = this.ws, v = ws.getMetricsManager().getViewMetrics(true);
    var a = this.toClient(ws, v.left, v.top), b = this.toClient(ws, v.left + v.width, v.top + v.height);
    return { left: a.x, top: a.y, right: b.x, bottom: b.y, width: b.x - a.x, height: b.y - a.y };
  };
  Run.prototype.flyoutRect = function () {
    var r = this.ws.getFlyout().getWorkspace().getParentSvg().getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  Run.prototype.grabPoint = function (b) {
    var ws = b.workspace, p = b.getRelativeToSurfaceXY();      // main workspace or palette
    var w = b.width || 60, h = b.height || 40;
    var gx = Math.min(22, w * 0.3), gy = (!b.previousConnection && !b.outputConnection) ? Math.max(16, h - 22) : Math.min(20, h / 2);
    return this.toClient(ws, p.x + gx, p.y + gy);
  };
  /** Scroll the code area so that a rectangle (workspace units) is inside the view; animated. */
  Run.prototype.reveal = async function (r) {
    var ws = this.ws, v = ws.getMetricsManager().getViewMetrics(true), pad = 24 / ws.scale, dx = 0, dy = 0;
    var L = v.left + 6 / ws.scale, R = v.left + v.width - pad, T = v.top + pad, Bm = v.top + v.height - pad;
    if (r.left < L) dx = L - r.left; else if (r.right > R) dx = Math.max(R - r.right, L - r.left);
    if (r.top < T) dy = T - r.top; else if (r.bottom > Bm) dy = Math.max(Bm - r.bottom, T - r.top);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    var sx = ws.scrollX, sy = ws.scrollY, tx = sx + dx * ws.scale, ty = sy + dy * ws.scale;
    try { await this.tween(200, function (t) { ws.scroll(sx + (tx - sx) * t, sy + (ty - sy) * t); }); }
    catch (e) { ws.scroll(tx, ty); throw e; }
  };
  function bounds(b) { var r = b.getBoundingRectangle(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }

  /* ------------------------------------------------------------------ the animation */
  Run.prototype.animateAll = async function () {
    this.ui();
    var est = this.est = this.estimate(), budget = this.opts.budgetMs || BUDGET;
    this.stepsTotal = Math.max(this.tasks.length, Math.round(this.steps));
    this.k = clamp((budget - 1300) / Math.max(est, 1), MIN_K, 1);
    this.budgetAt = this.t0 + budget - 1000;          // leave time for the check and the instant rest
    this.ptrEl.classList.add('on');
    await this.wait(80);
    for (var i = 0; i < this.tasks.length; i++) {
      this.idx = i;
      var task = this.tasks[i];
      progress(this.opts.onProgress, Math.min(this.stepsDone, this.stepsTotal - 1), this.stepsTotal, { phase: 'task', kind: task.kind, sprite: task.name, id: task.sidOut });
      this.mark('task ' + i + ' ' + task.kind + ' ' + task.name + '/' + task.sidOut);
      await this.switchTo(task.target);
      await this.runTask(task);
      this.check();
    }
    this.idx = this.tasks.length;
    await this.wait(120);
  };
  Run.prototype.estimate = function () {
    var self = this, d = 0, e = 0, sw = 0, cur = this.vm.editingTarget;
    this.tasks.forEach(function (k) {
      if (k.target !== cur) { sw += 1; cur = k.target; }
      if (k.kind === 'delete') { d += 1; return; }
      var old = [];
      if (!k.side) { var top = self.start[k.name].topOf[k.sid]; self.start[k.name].scripts.forEach(function (s) { if (s.top === top) old = s.blocks; }); }
      var c = costStack(old, k.canon, true); d += c.d; e += c.e;
    });
    this.steps = d + e;
    return 400 + d * 850 + e * 480 + sw * 700;
  };
  Run.prototype.switchTo = async function (t) {
    var vm = this.vm, self = this;
    if (vm.editingTarget === t) return;
    await this.events();                          // events of the sprite on screen reach the VM before the reload
    var el = this.spriteTile(t);
    if (el) { var r = el.getBoundingClientRect(); if (r.width) { await this.moveTo(r.left + r.width / 2, r.top + r.height / 2); await this.click(); } }
    this.check();
    vm.setEditingTarget(t.id);
    await this.until(function () { return vm.editingTarget === t && !self.gui.toolboxUpdateTimeout && self.shows(t); }, 1500);
    this.lastCat = null;
    await this.wait(80);
  };
  Run.prototype.spriteTile = function (t) {
    if (t.isStage) return document.querySelector('[class*="stage-selector_stage-selector"]');
    var name = t.getName(), els = document.querySelectorAll('[class*="sprite-selector-item_sprite-name"]');
    for (var i = 0; i < els.length; i++) if (els[i].textContent === name) return els[i].parentElement || els[i];
    return null;
  };
  Run.prototype.shows = function (t) {
    var ws = this.ws;
    return t.blocks.getScripts().every(function (id) { return !!ws.getBlockById(id) || !!(t.blocks._blocks[id] && t.blocks._blocks[id].shadow); });
  };
  Run.prototype.runTask = async function (task) {
    var name = task.name;
    if (task.kind === 'delete') {
      var b = this.ws.getBlockById(this.tops[name][task.sidOut]);
      if (b) await this.deleteBlock(b, false);
      this.tops[name][task.sidOut] = null;
      return;
    }
    var anchor = { task: task };
    var cur = !task.side && this.tops[name][task.sidOut] && this.ws.getBlockById(this.tops[name][task.sidOut]);
    if (cur) {
      var p = cur.getRelativeToSurfaceXY();
      anchor.pos = { x: p.x, y: p.y };
      await this.reveal(bounds(cur));
      await this.morphStack(chain(cur), task.canon, anchor);
    } else {
      this.tops[name][task.sidOut] = null;
      anchor.pos = this.placeNew(task.target, Math.max(1, countOps(task.list)));
      await this.morphStack([], task.canon, anchor);
    }
    // a replaced script keeps its position (as the instant apply does)
    var top = this.tops[name][task.sidOut] && this.ws.getBlockById(this.tops[name][task.sidOut]);
    if (top && anchor.pos) {
      var q = top.getRelativeToSurfaceXY();
      if (Math.abs(q.x - anchor.pos.x) > 1 || Math.abs(q.y - anchor.pos.y) > 1) top.moveTo(new this.SB.utils.Coordinate(anchor.pos.x, anchor.pos.y));
    }
  };
  /** A free spot in the visible code area for a new script (as studio.js place()); the host's own place() if given. */
  Run.prototype.placeNew = function (target, n) {
    if (typeof this.opts.place === 'function') {
      try { var p = this.opts.place(target, n); if (p && isFinite(p.x) && isFinite(p.y)) return { x: p.x, y: p.y }; } catch (e) { /* use ours */ }
    }
    var ws = this.ws, h = 70 + 52 * n, w = 320;
    if (ws && this.vm.editingTarget === target) {
      var v = ws.getMetricsManager().getViewMetrics(true);
      var rects = ws.getTopBlocks(false).map(function (b) { return b.getBoundingRectangle(); });
      var free = function (x, y) { return rects.every(function (r) { return x + w < r.left - 20 || x > r.right + 20 || y + h < r.top - 20 || y > r.bottom + 20; }); };
      for (var x = v.left + 40; x < v.left + Math.max(v.width - 100, 60); x += 120)
        for (var y = v.top + 40; y < v.top + Math.max(v.height - 80, 60); y += 40) if (free(x, y)) return { x: x, y: y };
      var maxB = rects.reduce(function (m, r) { return Math.max(m, r.bottom); }, v.top);
      return { x: v.left + 40, y: maxB + 60 };
    }
    var B = target.blocks._blocks, bottom = 0;
    target.blocks.getScripts().forEach(function (id) { var b = B[id]; if (b) bottom = Math.max(bottom, (b.y || 0) + 60 + 52 * countStack(B, id)); });
    return { x: 40, y: bottom + 40 };
  };
  /** A script deleted straight in the VM must leave the glow list too (as the VM's own delete handler does), or the
      editor is asked to un-glow a block it no longer has when a running script is replaced. */
  function quiet(vm, top) { try { vm.runtime.quietGlow(top); } catch (e) { /* older VM: nothing to do */ } }
  function countStack(B, id) { var n = 0; for (var g = 0; id && B[id] && g < 500; g++) { n++; id = B[id].next; } return n; }
  Run.prototype.forgetTop = function (b) {
    var tops = this.tops, ids = {};
    (b.getDescendants ? b.getDescendants(false) : [b]).forEach(function (x) { ids[x.id] = 1; });
    Object.keys(tops).forEach(function (n) { Object.keys(tops[n]).forEach(function (sid) { if (ids[tops[n][sid]]) tops[n][sid] = null; }); });
  };

  /** Make the old stack O (live blocks) into the new compact stack N. anchor = {conn} or {task, pos} for a script top. */
  Run.prototype.morphStack = async function (O, N, anchor) {
    var isTop = !!anchor.task, i, j;
    var al = align(O.map(function (b) { return { op: b.type, c: bOut(b) }; }), N, isTop);
    var kept = function (x) { return (x in al.pi) || !!al.wrapped[x]; };
    // 1. take away the old blocks that are not used again
    for (i = 0; i < O.length; i++) {
      if (kept(i)) continue;
      var rest = true;
      for (var k = i; k < O.length; k++) if (kept(k)) { rest = false; break; }
      if (rest) { await this.deleteBlock(O[i], false); break; }
      await this.deleteBlock(O[i], true);
    }
    // 2. build the new stack in order, reusing the old blocks that stay
    var cursor = isTop ? null : anchor.conn;
    for (j = 0; j < N.length; j++) {
      var w = N[j], b;
      if (j in al.pj) {
        b = O[al.pj[j]];
        if (cursor) await this.ensureAt(b, cursor);
        await this.morphBlock(b, w);
      } else {
        var wrap = al.wraps[j] ? al.wraps[j].map(function (x) { return O[x]; }) : null;
        var below = cursor ? cursor.targetBlock() : null;
        if (!cursor && isTop) for (i = 0; i < O.length && !below; i++) if (kept(i) && !O[i].isDeadOrDying()) below = O[i];
        b = await this.insertNew(w, cursor, isTop && j === 0 ? anchor : null, below, !!wrap);
        if (wrap) {
          var after = wrap[wrap.length - 1].getNextBlock();
          if (after) { if (b.nextConnection) await this.moveStack(after, b.nextConnection); else await this.deleteBlock(after, false); }
        } else if (below && isInside(below, b)) {
          if (b.nextConnection) await this.moveStack(below, b.nextConnection); else await this.deleteBlock(below, false);
        }
        await this.morphBlock(b, w);
      }
      cursor = b.nextConnection;
      if (!cursor && j < N.length - 1) throw new Error('nothing can follow ' + b.type);
    }
    if (cursor && cursor.targetBlock()) await this.deleteBlock(cursor.targetBlock(), false);
  };
  Run.prototype.ensureAt = async function (b, conn) {
    if (b.previousConnection && b.previousConnection.targetConnection === conn) return;
    await this.moveStack(b, conn);
  };
  Run.prototype.moveStack = async function (b, conn) {
    await this.reveal(bounds(b));
    await this.dragTo(b, { conn: conn, local: b.previousConnection });
  };
  Run.prototype.insertNew = async function (w, cursor, topAnchor, below, wrap) {
    // the place where it goes must be on screen before the block is picked up (scrolling moves held blocks)
    if (cursor) await this.reveal({ left: cursor.x - 8, top: cursor.y - 8, right: cursor.x + 150, bottom: cursor.y + 60 });
    else if (below) { var bb = bounds(below); await this.reveal({ left: bb.left - 8, top: bb.top - 80, right: bb.left + 150, bottom: bb.top + 40 }); }
    else if (topAnchor) await this.reveal({ left: topAnchor.pos.x - 8, top: topAnchor.pos.y - 8, right: topAnchor.pos.x + 150, bottom: topAnchor.pos.y + 90 });
    var nb = await this.pick(w, topAnchor ? topIdFor(topAnchor.task.sidOut) : null);
    if (topAnchor) this.tops[topAnchor.task.name][topAnchor.task.sidOut] = nb.id;
    if (cursor) await this.dragTo(nb, { conn: cursor, local: nb.previousConnection });
    else if (topAnchor && below && below.previousConnection) {
      var local = wrap ? (nb.getInput('SUBSTACK') && nb.getInput('SUBSTACK').connection) : nb.nextConnection;
      if (local) await this.dragTo(nb, { conn: below.previousConnection, local: local });
      else await this.dragTo(nb, { xy: topAnchor.pos });
    } else if (topAnchor) await this.dragTo(nb, { xy: topAnchor.pos });
    else throw new Error('no place for ' + w.op);
    return nb;
  };
  Run.prototype.morphBlock = async function (b, w) {
    var def = defOf(b.type) || {}, fields = def.fields || {}, inputs = def.inputs || {}, name;
    for (name in fields) await this.setBlockField(b, name, fields[name], w[name]);
    for (name in inputs) if (inputs[name] !== 'stack') await this.setInput(b, name, inputs[name], w[name]);
    for (name in inputs) {
      if (inputs[name] !== 'stack') continue;
      var inp = b.getInput(name), conn = inp && inp.connection;
      if (!conn) continue;
      await this.morphStack(chain(conn.targetBlock()), w[name] || [], { conn: conn });
    }
  };
  Run.prototype.setBlockField = async function (b, name, ft, want) {
    var f = b.getField(name);
    if (!f || want === undefined || want === null) return;
    if (ft === 'var' || ft === 'list' || ft === 'broadcast') {
      if (f.getText() === String(want)) return;
      var v = this.ensureVar(String(want), ft === 'var' ? '' : (ft === 'list' ? 'list' : 'broadcast_msg'));
      await this.pickOption(f, v.getId());
      return;
    }
    if (String(f.getValue()) === String(want)) return;
    await this.pickOption(f, String(want));
  };
  Run.prototype.setInput = async function (b, name, type, want) {
    var inp = b.getInput(name), conn = inp && inp.connection;
    if (!conn) return;
    var cur = conn.targetBlock();
    if (type === 'bool') {
      if (!want || typeof want !== 'object' || !want.op) { if (cur) await this.deleteBlock(cur, false); return; }
      if (cur && cur.type === want.op) { await this.morphBlock(cur, want); return; }
      if (cur) await this.deleteBlock(cur, false);
      var nb = await this.insertValue(want, conn);
      await this.morphBlock(nb, want);
      return;
    }
    var cover = cur && !cur.isShadow() ? cur : null;
    if (want && typeof want === 'object') {
      var wop = want.op || (want['var'] != null ? 'data_variable' : (want.list != null ? 'data_listcontents' : null));
      if (!wop) return;
      if (cover && cover.type === wop) {
        if (want.op) { await this.morphBlock(cover, want); return; }
        var fn = wop === 'data_variable' ? 'VARIABLE' : 'LIST', nm = String(want['var'] != null ? want['var'] : want.list);
        if (cover.getField(fn) && cover.getField(fn).getText() === nm) return;
      }
      if (cover) await this.deleteBlock(cover, false);
      var desc = want.op ? want : (wop === 'data_variable' ? { op: wop, VARIABLE: String(want['var']) } : { op: wop, LIST: String(want.list) });
      var rb = await this.insertValue(desc, conn);
      if (want.op) await this.morphBlock(rb, want);
      return;
    }
    if (cover) await this.deleteBlock(cover, false);
    var sh = conn.targetBlock();
    if (!sh) return;                                           // no slot to type into: the check afterwards decides
    var field = null;
    if (type.indexOf('menu:') === 0) field = sh.getField(type.split(':')[2]);
    else if (type === 'broadcast') field = sh.getField('BROADCAST_OPTION');
    else field = sh.getField(SHADOW_FIELD[type] || 'TEXT');
    if (!field && sh.inputList[0]) field = sh.inputList[0].fieldRow[0];
    if (!field || want === undefined || want === null) return;
    if (type === 'broadcast') {
      var bv = this.ensureVar(String(want), 'broadcast_msg');
      if (field.getText() !== bv.getName()) await this.pickOption(field, bv.getId());
      return;
    }
    if (type.indexOf('menu:') === 0) { if (String(field.getValue()) !== String(want)) await this.pickOption(field, String(want)); return; }
    var curV = field.getValue();
    if (type === 'color') { if (String(curV).toLowerCase() !== String(want).toLowerCase()) await this.setDirect(field, String(want)); return; }
    if (String(curV) === String(want)) return;
    if (NUMERIC[type] && String(curV) !== '' && String(want) !== '' && isFinite(+curV) && +curV === +want) return;
    if (type === 'angle') { await this.setDirect(field, String(want)); return; }
    await this.typeInto(field, String(want));
  };
  Run.prototype.insertValue = async function (desc, conn) {
    await this.reveal({ left: conn.x - 8, top: conn.y - 30, right: conn.x + 120, bottom: conn.y + 40 });
    var nb = await this.pick(desc, null);
    await this.dragTo(nb, { conn: conn, local: nb.outputConnection });
    return nb;
  };
  Run.prototype.deleteBlock = async function (b, heal) {
    if (heal && !b.previousConnection && !b.outputConnection && b.getNextBlock()) {
      // a hat lifts its whole script; move the rest a little away first so that it stays
      var nx = b.getNextBlock(), p = nx.getRelativeToSurfaceXY();
      await this.reveal(bounds(b));
      await this.dragTo(nx, { xy: { x: p.x + 12, y: p.y + 30 } });
    }
    await this.reveal(bounds(b));
    this.forgetTop(b);
    await this.dragTo(b, { palette: true }, heal);
  };

  /** Pick a block in the palette: category, palette scroll, pointer on the block; returns the new workspace block. */
  Run.prototype.pick = async function (w, id) {
    var SB = this.SB, ws = this.ws, fl = ws.getFlyout(), op = w.op, self = this;
    if (op === 'data_variable' && w.VARIABLE != null) this.ensureVar(String(w.VARIABLE), '');
    if (op === 'data_listcontents' && w.LIST != null) this.ensureVar(String(w.LIST), 'list');
    if (/^data_/.test(op)) {
      if (w.VARIABLE != null && op !== 'data_variable') this.ensureVar(String(w.VARIABLE), '');
      if (w.LIST != null && op !== 'data_listcontents') this.ensureVar(String(w.LIST), 'list');
      await this.until(function () { return !!self.flyoutBlock(w) && !self.gui.toolboxUpdateTimeout; }, 900);
    }
    var fb = this.flyoutBlock(w);
    if (fb) await this.showInPalette(fb, op);
    var json = fb ? fl.serializeBlock(fb) : this.jsonFor(op);
    if (id) json.id = id;
    var at = fb ? (function () { var p = fb.getRelativeToSurfaceXY(), c = self.toClient(fl.getWorkspace(), p.x, p.y); return self.toWs(c.x, c.y); })()
      : this.toWs(this.ptr.x - 12, this.ptr.y - 12);
    json.x = at.x; json.y = at.y;
    ws.setResizesEnabled(false);
    var nb = SB.serialization.blocks.append(json, ws, { recordUndo: true });
    this.holding = nb;
    this.mark('picked ' + op);
    if (!fb) { await this.rendered(); var g = this.grabPoint(nb); await this.moveTo(g.x, g.y); await this.press(); }
    return nb;
  };
  Run.prototype.flyoutBlock = function (w) {
    var fws = this.ws.getFlyout().getWorkspace(), op = w.op;
    var list = fws.getTopBlocks(false).filter(function (b) { return b.type === op; });
    var by = function (fname, val) { return list.filter(function (b) { var f = b.getField(fname); return f && f.getText() === String(val); }); };
    if (op === 'data_variable' && w.VARIABLE != null) list = by('VARIABLE', w.VARIABLE);
    if (op === 'data_listcontents' && w.LIST != null) list = by('LIST', w.LIST);
    return list[0] || null;
  };
  Run.prototype.showInPalette = async function (fb, op) {
    var self = this, ws = this.ws, tb = ws.getToolbox(), fl = ws.getFlyout(), fws = fl.getWorkspace(), cat = CAT[op.split('_')[0]];
    var fr = this.flyoutRect();
    var inView = function () { var r = fb.getSvgRoot().getBoundingClientRect(); return r.top >= fr.top + 4 && r.top + Math.min(r.height, 60) <= fr.bottom - 4; };
    var from = -fws.scrollY, to = from;
    if (cat !== this.lastCat || !inView()) {
      var item = cat && tb.getToolboxItemById && tb.getToolboxItemById(cat), div = item && item.getDiv && item.getDiv();
      if (div) {
        var ir = div.getBoundingClientRect();
        await this.moveTo(ir.left + ir.width / 2, ir.top + Math.min(ir.height / 2, 22));
        this.pulse();
        tb.setSelectedItem(item);
        fl.scrollTarget = undefined;              // the palette's own scroll animation is replaced by ours (below)
        fws.scrollbar.setY(from);
      }
      var m = fws.getMetrics(), max = Math.max(0, m.scrollHeight - m.viewHeight);
      var catPos = item && fl.getCategoryScrollPosition ? fl.getCategoryScrollPosition(item.getName()) : null;
      to = catPos != null ? clamp(catPos * fws.scale, 0, max) : from;
      var g0 = this.grabPoint(fb), y0 = g0.y + (from - to);          // where the block will be once the palette has scrolled
      if (y0 < fr.top + 30 || y0 > fr.bottom - 70) to = clamp(fb.getRelativeToSurfaceXY().y * fws.scale - 36, 0, max);
    }
    if (Math.abs(to - from) >= 1) {
      // the palette scrolls while the pointer travels to where the block arrives
      var p0 = { x: this.ptr.x, y: this.ptr.y }, g = this.grabPoint(fb), dest = { x: g.x, y: g.y + (from - to) };
      await this.tween(clamp(120 + Math.abs(to - from) * 0.04, 160, 240), function (t) {
        fws.scrollbar.setY(from + (to - from) * t);
        self.ptr.x = p0.x + (dest.x - p0.x) * t; self.ptr.y = p0.y + (dest.y - p0.y) * t; self.drawPtr();
      });
    }
    this.lastCat = cat;
    var gp = this.grabPoint(fb);
    await this.moveTo(gp.x, gp.y);
    await this.press();
  };
  /** The workspace-JSON of a block with its slots, built from the whitelist (used when the palette does not show it). */
  Run.prototype.jsonFor = function (op) {
    var def = defOf(op) || {}, self = this, j = { type: op }, inputs = {}, fields = {};
    var SH = { num: 'math_number', pos: 'math_positive_number', whole: 'math_whole_number', int: 'math_integer', angle: 'math_angle', color: 'colour_picker', text: 'text' };
    var DF = { num: '0', pos: '0', whole: '0', int: '0', angle: '90', color: '#000000', text: '' };
    Object.keys(def.inputs || {}).forEach(function (name) {
      var t = def.inputs[name], sf = {};
      if (t === 'stack' || t === 'bool') return;
      if (t === 'broadcast') {
        var v = self.ensureVar('message1', 'broadcast_msg');
        sf.BROADCAST_OPTION = { id: v.getId() };
        inputs[name] = { shadow: { type: 'event_broadcast_menu', fields: sf } };
        return;
      }
      if (t.indexOf('menu:') === 0) { var p = t.split(':'); sf[p[2]] = ''; inputs[name] = { shadow: { type: p[1], fields: sf } }; return; }
      sf[SHADOW_FIELD[t] || 'TEXT'] = DF[t] || '';
      inputs[name] = { shadow: { type: SH[t] || 'text', fields: sf } };
    });
    Object.keys(def.fields || {}).forEach(function (name) {
      var ft = def.fields[name];
      if (Array.isArray(ft)) fields[name] = ft[0];
      else if (ft === 'key') fields[name] = 'space';
      else if (ft === 'var' || ft === 'list' || ft === 'broadcast') {
        var v2 = self.ensureVar(ft === 'broadcast' ? 'message1' : (ft === 'list' ? '我的清單' : '我的變數'), ft === 'var' ? '' : (ft === 'list' ? 'list' : 'broadcast_msg'));
        fields[name] = { id: v2.getId() };
      }
    });
    if (Object.keys(inputs).length) j.inputs = inputs;
    if (Object.keys(fields).length) j.fields = fields;
    return j;
  };
  /** A variable / list / broadcast message by name, created like the student's 建立一個變數 would (global). */
  Run.prototype.ensureVar = function (name, type) {
    var SB = this.SB, map = this.ws.getVariableMap(), v = map.getVariable(name, type);
    if (v) return v;
    var Model = null;
    try { Model = SB.registry.getClass(SB.registry.Type.VARIABLE_MODEL, SB.registry.DEFAULT, false); } catch (e) { Model = null; }
    Model = Model || SB.VariableModel;
    v = new Model(this.ws, name, type, undefined, false, false);
    map.addVariable(v);
    SB.Events.fire(new (SB.Events.get(SB.Events.VAR_CREATE))(v));
    return v;
  };

  /** Drag a block with Blockly's own dragger. dest: {conn, local} | {xy} | {palette}. heal = lift just this block. */
  Run.prototype.dragTo = async function (b, dest, heal) {
    var SB = this.SB, ws = this.ws, g;
    if (this.holding === b) g = { x: this.ptr.x, y: this.ptr.y };
    else {
      this.holding = null;
      g = this.grabPoint(b);
      await this.moveTo(g.x, g.y);
      await this.press();
    }
    var D = SB.registry.getClassFromOptions(SB.registry.Type.BLOCK_DRAGGER, ws.options, true);
    // a new block's bottom / inner connections are only placed once it has been drawn (top and left ones sit at 0,0)
    if (dest.conn && dest.local !== b.previousConnection && dest.local !== b.outputConnection) await this.rendered();
    var start = b.getRelativeToSurfaceXY(), target;
    if (dest.palette) {
      var fr = this.flyoutRect();
      target = { x: fr.left + fr.width * 0.42, y: clamp(g.y, fr.top + 50, fr.bottom - 50) };
    } else {
      var origin;
      if (dest.conn) {
        var lo = dest.local.getOffsetInBlock ? dest.local.getOffsetInBlock() : { x: dest.local.x - start.x, y: dest.local.y - start.y };
        origin = { x: dest.conn.x - lo.x, y: dest.conn.y - lo.y };
      } else origin = dest.xy;
      target = { x: g.x + (origin.x - start.x) * ws.scale, y: g.y + (origin.y - start.y) * ws.scale };
    }
    var d = new D(b, ws), cur = { x: g.x, y: g.y };
    d.onDragStart(pe(g.x, g.y, heal));
    var delta = function (p) { return new SB.utils.Coordinate(p.x - g.x, p.y - g.y); };
    try {
      var dist = Math.sqrt(Math.pow(target.x - g.x, 2) + Math.pow(target.y - g.y, 2));
      await this.moveTo(target.x, target.y, { ms: clamp(140 + dist * 0.3, 200, 400),
        drag: function (x, y) { cur = { x: x, y: y }; d.onDrag(pe(x, y, heal), delta(cur)); } });
    } catch (e) {
      try { if (b.dragStrategy) b.dragStrategy.connectionCandidate = null; d.onDragEnd(pe(cur.x, cur.y, heal), delta(cur)); } catch (x) { /* ignore */ }
      this.holding = null;
      throw e;
    }
    if (b.dragStrategy) b.dragStrategy.connectionCandidate = dest.conn ? { local: dest.local, neighbour: dest.conn, distance: 0 } : null;
    d.onDragEnd(pe(target.x, target.y, heal), delta(target));
    this.holding = null;
    try { ws.setResizesEnabled(true); } catch (e) { /* ignore */ }
    this.mark('dropped ' + b.type + (dest.palette ? ' on the palette' : ''));
    this.stepped('drag');
    if (dest.conn && dest.local.targetConnection !== dest.conn) throw new Error('drop did not connect (' + b.type + ')');
    await this.rendered();
  };
  Run.prototype.fieldCenter = function (f) {
    var el = (f.getClickTarget_ && f.getClickTarget_()) || f.getSvgRoot && f.getSvgRoot();
    var r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: this.ptr.x, y: this.ptr.y };
  };
  Run.prototype.revealField = async function (f) {
    var b = f.getSourceBlock && f.getSourceBlock();
    if (b) { var r = bounds(b); await this.reveal({ left: r.left, top: r.top, right: Math.min(r.right, r.left + 260), bottom: Math.min(r.bottom, r.top + 60) }); }
  };
  Run.prototype.typeInto = async function (field, text) {
    var SB = this.SB;
    await this.revealField(field);
    var c = this.fieldCenter(field);
    await this.moveTo(c.x, c.y);
    await this.click();
    try {
      // Blockly's own inline editor, opened "quiet" (no focus): no on-screen keyboard on a tablet, no focus taken from
      // the page; scratch-blocks' number field would otherwise focus it (its showEditor_ has no quiet option)
      var base = SB.FieldTextInput && SB.FieldTextInput.prototype.showEditor_;
      if (base) base.call(field, undefined, true); else field.showEditor_();
      var inp = field.htmlInput_;
      if (!inp) throw new Error('no editor');
      await this.moveTo(c.x + 14, c.y + 22, { ms: 90 });  // the pointer steps aside so that the typing can be seen
      var chars = Array.from(text), per = chars.length > 8 ? 24 : 45;
      inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true }));
      await this.wait(60);
      for (var i = 1; i <= chars.length; i++) {
        inp.value = chars.slice(0, i).join(''); inp.dispatchEvent(new Event('input', { bubbles: true }));
        if (i < 12 || i === chars.length) await this.wait(per);
      }
      await this.wait(90);
      SB.WidgetDiv.hide();
    } catch (e) {
      try { SB.WidgetDiv.hide(); } catch (x) { /* ignore */ }
      if (e === STOP) throw e;
      this.mark('typing without the editor: ' + (e && e.message));
    }
    if (String(field.getValue()) !== text) field.setValue(text);
    this.mark('typed ' + text);
    this.stepped('type');
  };
  Run.prototype.pickOption = async function (field, value) {
    var SB = this.SB;
    await this.revealField(field);
    var c = this.fieldCenter(field);
    await this.moveTo(c.x, c.y);
    await this.click();
    try {
      field.showEditor_();
      var menu = field.menu_, items = menu ? (menu.getMenuItems ? menu.getMenuItems() : (menu.menuItems || [])) : [];
      var item = items.filter(function (it) { return it && it.getValue && it.getValue() === value; })[0];
      await this.wait(130);
      if (item && menu) {
        var el = item.getElement && item.getElement();
        if (el) {
          var box = el.parentElement;
          while (box && box !== document.body && !(box.scrollHeight > box.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
          if (box && box !== document.body) box.scrollTop = Math.max(0, el.offsetTop - box.clientHeight / 2);
          await this.frame();
          var r = el.getBoundingClientRect();
          await this.moveTo(r.left + Math.min(36, r.width / 2), r.top + r.height / 2);
        }
        menu.setHighlighted(item);
        await this.wait(100);
        this.pulse();
        if (field.handleMenuActionEvent) field.handleMenuActionEvent(item);
        else { SB.DropDownDiv.hideIfOwner(field, true); field.onItemSelected_(menu, item); }
        await this.wait(40);
      } else {
        SB.DropDownDiv.hideIfOwner(field, true);
        field.setValue(value);
      }
    } catch (e) {
      try { SB.DropDownDiv.hideWithoutAnimation(); } catch (x) { /* ignore */ }
      if (e === STOP) throw e;
      field.setValue(value);
    }
    if (String(field.getValue()) !== String(value)) field.setValue(value);
    this.mark('picked option ' + value);
    this.stepped('pick');
  };
  Run.prototype.setDirect = async function (field, value) {
    await this.revealField(field);
    var c = this.fieldCenter(field);
    await this.moveTo(c.x, c.y);
    await this.click();
    field.setValue(value);
    this.stepped('set');
    await this.wait(90);
  };

  /* ------------------------------------------------------------------ instant apply, restore, check */
  /** Exactly what StudioOps.apply does, for tasks[from..] (the rest of an interrupted turn, or all of them). */
  Run.prototype.exactApply = function (from) {
    var self = this, vm = this.vm, rest = this.tasks.slice(from), touchedT = {};
    if (!rest.length) return;
    // scripts touched by the unfinished tasks, and anything left half-built, go first
    var later = {};
    rest.forEach(function (k) { (later[k.name] || (later[k.name] = {}))[k.sidOut] = 1; touchedT[k.target.id] = k.target; });
    Object.keys(touchedT).forEach(function (tid) {
      var t = touchedT[tid], name = OPS.nameOf(t), st = self.start[name], allowed = {};
      st.scripts.forEach(function (s) { var sid = st.sidOf[s.top]; if (!sid || !self.touched[name][sid]) allowed[s.top] = 1; });
      Object.keys(self.tops[name]).forEach(function (sid) { var top = self.tops[name][sid]; if (top && !later[name][sid] && self.touched[name][sid]) allowed[top] = 1; });
      t.blocks.getScripts().slice().forEach(function (top) {
        var b = t.blocks._blocks[top];
        if (b && !b.shadow && !allowed[top]) { self.forgetTopId(name, top); quiet(vm, top); t.blocks.deleteBlock(top); }
      });
    });
    rest.forEach(function (k) {
      var t = k.target, name = k.name;
      if (k.kind === 'delete') { self.tops[name][k.sidOut] = null; return; }
      var old = self.tops[name][k.sidOut];
      if (old && t.blocks._blocks[old]) { quiet(vm, old); t.blocks.deleteBlock(old); }
      var pos = k.pos || self.placeNew(t, Math.max(1, countOps(k.list)));
      var built = OPS.build(vm, t, k.list, pos.x, pos.y, k.sidOut);
      built.blocks.forEach(function (b) { t.blocks.createBlock(b); });
      self.tops[name][k.sidOut] = built.top || null;
      touchedT[t.id] = t;
    });
    Object.keys(touchedT).forEach(function (tid) { touchedT[tid].blocks.updateTargetSpecificBlocks(touchedT[tid].isStage); });
    if (vm.editingTarget && touchedT[vm.editingTarget.id]) vm.emitWorkspaceUpdate();
  };
  Run.prototype.forgetTopId = function (name, top) {
    var m = this.tops[name]; if (!m) return;
    Object.keys(m).forEach(function (sid) { if (m[sid] === top) m[sid] = null; });
  };
  /** Put the touched sprites' blocks back exactly as they were before the turn. */
  Run.prototype.restore = function () {
    var self = this;
    Object.keys(this.saved).forEach(function (tid) {
      var s = self.saved[tid], blocks = s.target.blocks, B = blocks._blocks;
      blocks.getScripts().forEach(function (top) { quiet(self.vm, top); });
      Object.keys(B).forEach(function (id) { delete B[id]; });
      blocks._scripts.length = 0;
      var copy = JSON.parse(js(s.blocks));
      s.scripts.forEach(function (id) { if (copy[id]) blocks.createBlock(copy[id]); });
      Object.keys(copy).forEach(function (id) { if (!B[id]) blocks.createBlock(copy[id]); });
      if (blocks.resetCache) blocks.resetCache();
      blocks.updateTargetSpecificBlocks(s.target.isStage);
    });
    Object.keys(this.start).forEach(function (name) { self.tops[name] = Object.assign({}, self.start[name].topOf); });
    if (this.vm.editingTarget && this.saved[this.vm.editingTarget.id]) this.vm.emitWorkspaceUpdate();
  };
  /** Live program == the instant apply's result: untouched scripts unchanged, touched ones == build+decompile, ids kept. */
  Run.prototype.verify = function () {
    var self = this, diffs = [];
    Object.keys(this.start).forEach(function (name) {
      var st = self.start[name], t = st.target, touched = self.touched[name], expect = {}, seen = {}, claim = {};
      st.scripts.forEach(function (s) { var sid = st.sidOf[s.top]; if (!sid || !touched[sid]) expect['@' + s.top] = s.blocks; });
      Object.keys(touched).forEach(function (sid) {
        var fin = self.final[name][sid];
        if (fin && fin.length) { expect[sid] = fin; var top = self.tops[name][sid]; if (top) claim[top] = sid; }
      });
      liveScripts(t).forEach(function (s) {
        if (('@' + s.top) in expect) {
          if (js(s.blocks) !== js(expect['@' + s.top])) diffs.push({ sprite: name, top: s.top, why: 'untouched script changed' });
          seen['@' + s.top] = 1; return;
        }
        var sid = claim[s.top];
        if (sid) {
          if (js(s.blocks) !== js(expect[sid])) diffs.push({ sprite: name, id: sid, why: 'content', got: s.blocks, want: expect[sid] });
          var keptTop = st.topOf[sid] === s.top, named = s.top.indexOf('wl_' + sid + '_') === 0, plain = /^[A-Za-z0-9-]{1,12}$/.test(sid);
          if (!keptTop && !named && plain) diffs.push({ sprite: name, id: sid, why: 'script id would change', top: s.top });
          seen[sid] = 1; return;
        }
        diffs.push({ sprite: name, top: s.top, why: 'extra script', got: s.blocks });
      });
      Object.keys(expect).forEach(function (key) { if (!seen[key]) diffs.push({ sprite: name, key: key, why: 'missing script' }); });
    });
    return { ok: !diffs.length, diffs: diffs };
  };
  /** The editor shows the VM's blocks of the editing target (re-load it if a drop was interrupted). */
  Run.prototype.syncWorkspace = function () {
    var g = guiBlocks(), vm = this.vm, t = vm.editingTarget;
    if (!g || !g.workspace || !t) return;
    var ws = g.workspace, B = t.blocks._blocks;
    var vmIds = Object.keys(B).filter(function (id) { return !B[id].shadow; });
    var wsIds = ws.getAllBlocks(false).filter(function (b) { return !b.isShadow() && !b.isInsertionMarker(); }).map(function (b) { return b.id; });
    var ok = vmIds.length === wsIds.length && wsIds.every(function (id) { return !!B[id]; });
    if (!ok) vm.emitWorkspaceUpdate();
  };

  /* The 跳過動畫 button must work even when the page's own lock swallows trusted clicks over the editor (it listens on
     window in the capture phase): this listener is registered when this file loads, i.e. before the page's lock code,
     so it sees the press first. Escape skips too. */
  function skipHit(e) {
    if (!ACTIVE || !e.isTrusted) return;
    var t = e.target;
    if (e.type === 'keydown') { if (e.key === 'Escape' && ACTIVE.ptrEl) ACTIVE.skip(); return; }
    if (t && t.closest && t.closest('.wl-anim-skip')) { if (e.cancelable) e.preventDefault(); ACTIVE.skip(); }
  }
  ['pointerdown', 'click', 'keydown'].forEach(function (ev) { global.addEventListener(ev, skipHit, true); });

  /* ------------------------------------------------------------------ API */
  function play(opts) {
    opts = opts || {};
    var prev = ACTIVE;
    if (prev) prev.skip();
    return (prev ? prev.promise.then(noop, noop) : Promise.resolve()).then(function () {
      var vm = opts.vm || (global.WLStudio && global.WLStudio.vm);
      if (!vm || !vm.runtime) throw new Error('WLAnim: no vm');
      if (!global.StudioOps) throw new Error('WLAnim: studio-ops.js is not loaded');
      return loadSpec(opts).then(function () {
        var run = new Run(vm, opts);
        ACTIVE = run;
        run.promise = run.go().then(function (r) { if (ACTIVE === run) ACTIVE = null; return r; },
          function (e) { if (ACTIVE === run) ACTIVE = null; throw e; });
        return run.promise;
      });
    });
  }
  global.WLAnim = {
    version: '2026-10-07',
    play: play,
    enabled: enabled,
    setEnabled: setEnabled,
    skip: function () { if (ACTIVE) ACTIVE.skip(); },
    busy: function () { return !!ACTIVE; },
    /** For tests and the page: the instant apply's result for one script (build + decompile). */
    canon: function (vm, sprite, list) {
      var t = OPS && OPS.targetByName(vm, sprite);
      return t ? canon(vm, t, list) : null;
    },
    _align: function (O, N, isTop) { return align(O, N, isTop); },
    _Run: Run
  };
})(window);
