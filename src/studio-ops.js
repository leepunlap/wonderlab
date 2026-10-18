/*!
 * Wonder Lab Studio — program model <-> live editor blocks.
 * Copyright (C) 2026 IITS (工信學堂（香港）). GNU Affero General Public License v3.0 only (see LICENSE).
 * Ported from wonderlab-src/src/wonderlab.js (compile): the same compact program model and the same opcode whitelist
 * (opcodes.json), but instead of compiling a whole project.json it writes ONE script at a time into the live VM that
 * scratch-gui is editing, so the student's own scripts, costumes, sounds and positions stay as they are.
 *
 * Program model (what lab_core.py validates and the AI edits):
 *   {sprites: {<name>: {scripts: {<id>: [block, ...]}}}, stage: {scripts: {...}}}     stage name in ops: "舞台"
 * Ops (lab_core.apply_ops output): {do: "set_script", sprite, id, n} | {do: "delete_script", sprite, id};
 * the blocks of a set_script come from the reply's merged `program`.
 */
(function (global) {
  'use strict';
  var STAGE = '舞台';
  var SHADOW = { num: ['math_number', 'NUM'], pos: ['math_positive_number', 'NUM'], whole: ['math_whole_number', 'NUM'],
    int: ['math_integer', 'NUM'], angle: ['math_angle', 'NUM'], color: ['colour_picker', 'COLOUR'], text: ['text', 'TEXT'] };
  var NUMERIC = { num: 1, pos: 1, whole: 1, int: 1, angle: 1 };
  var MENU_DEFAULT = { obj_rm: '_random_', obj_m: '_mouse_', obj_me: '_edge_', clone: '_myself_', key: 'space', color_param: 'color' };
  var SOUP = '!#$%()*+,-./:;=?@[]^_`{|}~ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  function uid() { var s = ''; for (var i = 0; i < 20; i++) s += SOUP.charAt(Math.floor(Math.random() * SOUP.length)); return s; }

  function Ops(spec) {
    this.spec = spec;                   // opcodes.json
    this.sids = {};                     // target name -> {topBlockId: scriptId}
    this.hand = 0;
  }
  Ops.STAGE = STAGE;

  Ops.prototype.nameOf = function (t) { return t.isStage ? STAGE : t.getName(); };
  Ops.prototype.targets = function (vm) { return vm.runtime.targets.filter(function (t) { return t.isOriginal; }); };
  Ops.prototype.targetByName = function (vm, name) {
    var self = this;
    return this.targets(vm).filter(function (t) { return self.nameOf(t) === name; })[0] || null;
  };

  /* ---------- live VM -> compact program (what the student built or edited by hand) ---------- */
  Ops.prototype.snapshot = function (vm) {
    var self = this, prog = { sprites: {}, stage: { scripts: {} } }, unsupported = [], count = 0;
    this.targets(vm).forEach(function (t) {
      var name = self.nameOf(t), B = t.blocks._blocks, map = self.sids[name] || (self.sids[name] = {});
      var dst = t.isStage ? prog.stage : (prog.sprites[name] = { scripts: {} });
      var used = {};
      // keep a stable script id per top block: registered -> encoded in an AI block id -> new hand id
      Object.keys(map).forEach(function (top) { if (!B[top] || !B[top].topLevel) delete map[top]; else used[map[top]] = 1; });
      t.blocks.getScripts().forEach(function (top) {
        var b = B[top]; if (!b || b.shadow) return;
        var sid = map[top];
        if (!sid) {
          var m = /^wl_([A-Za-z0-9-]{1,12})_/.exec(top);
          sid = (m && !used[m[1]]) ? m[1] : null;
          while (!sid || used[sid]) { self.hand += 1; sid = 'h' + self.hand; }
          map[top] = sid; used[sid] = 1;
        }
        var ctx = { bad: [] };
        var blocks = self.stackOut(B, top, ctx);
        count += countOps(blocks);
        if (ctx.bad.length) unsupported.push({ sprite: name, id: sid, ops: uniq(ctx.bad).slice(0, 12) });
        if (blocks.length) dst.scripts[sid] = blocks;
      });
    });
    return { program: prog, unsupported: unsupported, blocks: count };
  };
  Ops.prototype.stackOut = function (B, id, ctx) {
    var out = [];
    for (var guard = 0; id && B[id] && guard < 500; guard++) {
      var c = this.blockOut(B, B[id], ctx);
      if (c) out.push(c);
      id = B[id].next;
    }
    return out;
  };
  Ops.prototype.blockOut = function (B, b, ctx) {
    var def = this.spec.opcodes[b.opcode], self = this;
    if (!def) { ctx.bad.push(b.opcode); return null; }       // outside the whitelist: reported in `unsupported`, never sent as a block
    var o = { op: b.opcode };
    Object.keys(def.inputs || {}).forEach(function (name) {
      var type = def.inputs[name], inp = b.inputs[name], child = inp && inp.block && B[inp.block];
      if (!child) return;
      if (type === 'stack') { var s = self.stackOut(B, child.id, ctx); if (s.length) o[name] = s; return; }
      if (type === 'bool') { var v = self.blockOut(B, child, ctx); if (v) o[name] = v; return; }
      var val = self.valueOut(B, child, type, ctx);
      if (val !== undefined) o[name] = val;
    });
    Object.keys(def.fields || {}).forEach(function (name) {
      var f = b.fields[name]; if (f) o[name] = f.value;
    });
    return o;
  };
  Ops.prototype.valueOut = function (B, c, type, ctx) {
    if (c.opcode === 'data_variable') return { 'var': c.fields.VARIABLE.value };
    if (c.opcode === 'data_listcontents') return { list: c.fields.LIST.value };
    if (c.shadow) {
      var keys = Object.keys(c.fields || {}); if (!keys.length) return undefined;
      var v = c.fields[keys[0]].value;
      if (NUMERIC[type] && v !== '' && isFinite(+v)) return +v;
      return v;
    }
    return this.blockOut(B, c, ctx) || undefined;
  };

  /* ---------- compact script -> VM internal blocks ---------- */
  Ops.prototype.variable = function (vm, target, name, type) {
    var stage = vm.runtime.getTargetForStage();
    function find(t) { if (!t) return null; for (var k in t.variables) { var v = t.variables[k]; if (v.name === name && v.type === type) return v; } return null; }
    var v = (target && !target.isStage && find(target)) || find(stage);
    if (v) return v.id;
    var id = uid();
    stage.createVariable(id, name, type);
    return id;
  };
  Ops.prototype.build = function (vm, target, list, x, y, sid) {
    var self = this, spec = this.spec.opcodes, out = [], exts = {};
    function add(b) { out.push(b); return b.id; }
    function shadow(parent, opcode, field, value, extra) {
      var f = {}; f[field] = Object.assign({ name: field, value: String(value) }, extra || {});
      return add({ id: uid(), opcode: opcode, inputs: {}, fields: f, next: null, parent: parent, shadow: true, topLevel: false });
    }
    function reporterVar(parent, kind, name) {
      var isList = kind === 'list', vid = self.variable(vm, target, name, isList ? 'list' : '');
      var f = {}, fn = isList ? 'LIST' : 'VARIABLE';
      f[fn] = { name: fn, value: name, id: vid, variableType: isList ? 'list' : '' };
      return add({ id: uid(), opcode: isList ? 'data_listcontents' : 'data_variable', inputs: {}, fields: f, next: null, parent: parent, shadow: false, topLevel: false });
    }
    function stack(arr, parent) {
      var first = null, prev = null;
      (arr || []).forEach(function (b) {
        var id = block(b, prev ? prev.id : parent);
        if (!id) return;
        var cur = out.filter(function (x) { return x.id === id; })[0];
        if (prev) prev.next = id; else first = id;
        prev = cur;
      });
      return first;
    }
    function block(b, parent, idOverride) {
      var def = spec[b && b.op]; if (!def) return null;
      if (def.ext) exts[def.ext] = 1;
      var id = idOverride || uid();
      var blk = { id: id, opcode: b.op, inputs: {}, fields: {}, next: null, parent: parent || null, shadow: false, topLevel: false };
      add(blk);
      Object.keys(def.inputs || {}).forEach(function (name) {
        var type = def.inputs[name], v = b[name];
        if (type === 'stack') { if (Array.isArray(v) && v.length) { var f = stack(v, id); if (f) blk.inputs[name] = { name: name, block: f, shadow: null }; } return; }
        if (type === 'bool') { if (v && v.op) { var bb = block(v, id); if (bb) blk.inputs[name] = { name: name, block: bb, shadow: null }; } return; }
        if (type === 'broadcast') {
          var nm = String(v == null ? 'message1' : v), mid = self.variable(vm, target, nm, 'broadcast_msg');
          var sh = shadow(id, 'event_broadcast_menu', 'BROADCAST_OPTION', nm, { id: mid, variableType: 'broadcast_msg' });
          blk.inputs[name] = { name: name, block: sh, shadow: sh }; return;
        }
        var shId;
        if (type.indexOf('menu:') === 0) {
          var p = type.split(':'), mv = (v == null || typeof v === 'object') ? (MENU_DEFAULT[p[3]] || '') : String(v);
          if (p[3] === 'costume' && (v == null || typeof v === 'object')) mv = target && target.getCostumes()[0] ? target.getCostumes()[0].name : '';
          if (p[3] === 'backdrop' && (v == null || typeof v === 'object')) { var st = vm.runtime.getTargetForStage(); mv = st.getCostumes()[0] ? st.getCostumes()[0].name : ''; }
          shId = shadow(id, p[1], p[2], mv);
        } else {
          var sd = SHADOW[type] || SHADOW.text, dflt = type === 'color' ? '#000000' : (type === 'text' ? '' : '0');
          shId = shadow(id, sd[0], sd[1], (v == null || typeof v === 'object') ? dflt : v);
        }
        var top = shId;
        if (v && typeof v === 'object') {
          if (v['var'] != null) top = reporterVar(id, 'var', String(v['var']));
          else if (v.list != null) top = reporterVar(id, 'list', String(v.list));
          else if (v.op) top = block(v, id) || shId;
        }
        blk.inputs[name] = { name: name, block: top, shadow: shId };
      });
      Object.keys(def.fields || {}).forEach(function (name) {
        var ft = def.fields[name], v = b[name];
        if (ft === 'var' || ft === 'list' || ft === 'broadcast') {
          var vt = ft === 'var' ? '' : (ft === 'list' ? 'list' : 'broadcast_msg'), nm = String(v == null ? (ft === 'broadcast' ? 'message1' : '我的變數') : v);
          blk.fields[name] = { name: name, value: nm, id: self.variable(vm, target, nm, vt), variableType: vt };
        } else {
          blk.fields[name] = { name: name, value: String(v == null ? (Array.isArray(ft) ? ft[0] : (ft === 'key' ? 'space' : '')) : v) };
        }
      });
      if (b.op === 'control_stop') blk.mutation = { tagName: 'mutation', children: [], hasnext: b.STOP_OPTION === 'other scripts in sprite' ? 'true' : 'false' };
      return id;
    }
    var first = null, prev = null;
    (list || []).forEach(function (b, i) {
      var id = block(b, prev ? prev.id : null, i === 0 ? 'wl_' + sid + '_' + uid().replace(/[^A-Za-z0-9]/g, '').slice(0, 6) : null);
      if (!id) return;
      var cur = out.filter(function (x) { return x.id === id; })[0];
      if (prev) prev.next = id; else first = cur;
      prev = cur;
    });
    if (first) { first.topLevel = true; first.x = Math.round(x); first.y = Math.round(y); }
    return { blocks: out, top: first ? first.id : null, exts: Object.keys(exts) };
  };

  /* ---------- apply one AI turn (lab_core reply) to the live editor ---------- */
  // place(target, nBlocks) -> {x, y}: where a NEW script goes (the host knows the visible workspace area)
  Ops.prototype.apply = function (vm, reply, place) {
    var self = this, prog = reply.program || {}, done = [], skipped = [], sideBySide = [];
    var all = reply.ops || [];
    // The library ops run first, so a script can target an actor that this same turn just imported.
    var libOps = all.filter(function (o) { return o && (o['do'] === 'add_sprite' || o['do'] === 'add_backdrop'); });
    var ops = all.filter(function (o) { return o && (o['do'] === 'set_script' || o['do'] === 'delete_script'); });
    var needExt = {};
    ops.forEach(function (o) {
      if (o['do'] !== 'set_script') return;
      var src = o.sprite === STAGE ? (prog.stage || {}) : ((prog.sprites || {})[o.sprite] || {});
      JSON.stringify((src.scripts || {})[o.id] || []).replace(/"op":"([a-z]+)_/g, function (m, p) { if (p === 'pen') needExt.pen = 1; });
    });
    var load = Object.keys(needExt).filter(function (e) { return !vm.extensionManager.isExtensionLoaded(e); })
      .map(function (e) { return vm.extensionManager.loadExtensionURL(e); });
    return Promise.all(load).then(function () {           // actor / stage imports from the library
      var S = (typeof window !== 'undefined' && window.WLStudio) || {};
      return libOps.reduce(function (p, o) {
        return p.then(function () {
          var isStage = o['do'] === 'add_backdrop';
          var fn = isStage ? S.addLibraryBackdrop : S.addLibrarySprite;
          if (typeof fn !== 'function') { skipped.push(o); return; }
          var call = isStage ? fn.call(S, o.name) : fn.call(S, o.name, o.sprite || o.name);
          return Promise.resolve(call).then(function () { done.push({ op: o, library: true }); },
                                          function (e) { warn('library op', o, e); skipped.push(o); });
        });
      }, Promise.resolve());
    }).then(function () {
      var touched = {};
      ops.forEach(function (o) {
        var target = self.targetByName(vm, o.sprite);
        if (!target) { skipped.push(o); return; }
        var name = self.nameOf(target), map = self.sids[name] || (self.sids[name] = {});
        var oldTop = Object.keys(map).filter(function (k) { return map[k] === o.id && target.blocks._blocks[k]; })[0];
        var hasForeign = false;
        if (oldTop) {        // a script with blocks outside the whitelist: the AI never saw them, so never overwrite it
          var probe = { bad: [] }; self.stackOut(target.blocks._blocks, oldTop, probe); hasForeign = probe.bad.length > 0;
        }
        if (o['do'] === 'delete_script') {
          // quietGlow first: deleting a running script's top block otherwise makes the editor throw 'Tried to glow block
          // that does not exist.' on every frame
          if (oldTop && !hasForeign) { vm.runtime.quietGlow(oldTop); target.blocks.deleteBlock(oldTop); delete map[oldTop]; done.push({ op: o, top: null, target: target }); touched[target.id] = target; }
          else skipped.push(o);
          return;
        }
        var src = o.sprite === STAGE ? (prog.stage || {}) : ((prog.sprites || {})[o.sprite] || {});
        var list = (src.scripts || {})[o.id];
        if (!Array.isArray(list)) { skipped.push(o); return; }
        var pos;
        if (oldTop && !hasForeign) {
          var ob = target.blocks._blocks[oldTop]; pos = { x: ob.x || 0, y: ob.y || 0 };
          vm.runtime.quietGlow(oldTop); target.blocks.deleteBlock(oldTop); delete map[oldTop];
        } else {
          pos = place(target, countOps(list));
          if (hasForeign) sideBySide.push(o);
        }
        var sid = hasForeign ? o.id + 'b' : o.id;
        var built = self.build(vm, target, list, pos.x, pos.y, sid);
        built.blocks.forEach(function (b) { target.blocks.createBlock(b); });
        if (built.top) { map[built.top] = sid; done.push({ op: o, top: built.top, target: target }); }
        touched[target.id] = target;
      });
      Object.keys(touched).forEach(function (id) { touched[id].blocks.updateTargetSpecificBlocks(touched[id].isStage); });
      return { done: done, skipped: skipped, sideBySide: sideBySide, library: libOps.length };
    });
  };

  /** Which scripts changed between two compact programs (for "the student edited these by hand"). */
  Ops.diff = function (a, b) {
    function flat(p) {
      var o = {};
      if (!p) return o;
      Object.keys(p.sprites || {}).forEach(function (n) { var s = (p.sprites[n] || {}).scripts || {}; Object.keys(s).forEach(function (k) { o[n + '\u0000' + k] = JSON.stringify(s[k]); }); });
      var st = (p.stage || {}).scripts || {}; Object.keys(st).forEach(function (k) { o[STAGE + '\u0000' + k] = JSON.stringify(st[k]); });
      return o;
    }
    var A = flat(a), Bm = flat(b), out = [];
    Object.keys(Bm).forEach(function (k) { var p = k.split('\u0000'); if (!(k in A)) out.push({ sprite: p[0], id: p[1], change: 'added' }); else if (A[k] !== Bm[k]) out.push({ sprite: p[0], id: p[1], change: 'changed' }); });
    Object.keys(A).forEach(function (k) { var p = k.split('\u0000'); if (!(k in Bm)) out.push({ sprite: p[0], id: p[1], change: 'removed' }); });
    return out;
  };

  /* ---------- dual mode (2026-10-07 evening): helpers for the lesson page (studio-lab.js) ---------- */

  /** {sprite: {scriptId: topBlockId}} for the live project (after a snapshot, so every script has an id). */
  Ops.prototype.tops = function (vm) {
    var self = this, out = {};
    this.targets(vm).forEach(function (t) {
      var name = self.nameOf(t), map = self.sids[name] || {}, o = out[name] = {};
      Object.keys(map).forEach(function (top) { if (t.blocks._blocks[top] && t.blocks._blocks[top].topLevel) o[map[top]] = top; });
    });
    return out;
  };
  /** The script id of a top block (null when the block is not a known top block). */
  Ops.prototype.scriptIdOf = function (targetName, topId) {
    var map = this.sids[targetName]; return (map && map[topId]) || null;
  };
  Ops.prototype.topOf = function (vm, sprite, sid) {
    var t = this.targetByName(vm, sprite); if (!t) return null;
    var map = this.sids[this.nameOf(t)] || {};
    var top = Object.keys(map).filter(function (k) { return map[k] === sid && t.blocks._blocks[k]; })[0];
    return top ? { target: t, top: top } : null;
  };
  /** The n-th block (1-based) of a script in the order of the script's text lines (texts()): the stack blocks depth-first
      (the hat = 1, then a C block's inner stacks in order, then the next block). Reporters / inputs are not counted. */
  Ops.prototype.blockAt = function (B, topId, n) {
    var k = 0, found = null;
    function walk(id) {
      for (var g = 0; id && B[id] && g < 500 && !found; g++) {
        var b = B[id];
        if (!b.shadow) { k += 1; if (k === n) { found = id; return; } }
        Object.keys(b.inputs || {}).filter(function (nm) { return /^SUBSTACK\d*$/.test(nm); }).sort().forEach(function (nm) {
          var inp = b.inputs[nm]; if (inp && inp.block && !found) walk(inp.block);
        });
        id = b.next;
      }
    }
    walk(topId);
    return found;
  };

  /** Re-attach script ids after the editor was changed by something else than apply() (the animation drives the editor
      like a user, so its new scripts have ordinary block ids): a live top block whose blocks equal the expected script
      of a set_script op gets that op's id. Returns the ops whose result is not in the editor. */
  Ops.prototype.settle = function (vm, reply) {
    var self = this, prog = reply.program || {}, bad = [];
    (reply.ops || []).forEach(function (o) {
      if (!o || (o['do'] !== 'set_script' && o['do'] !== 'delete_script')) return;
      var t = self.targetByName(vm, o.sprite); if (!t) { bad.push(o); return; }
      var name = self.nameOf(t), map = self.sids[name] || (self.sids[name] = {}), B = t.blocks._blocks;
      Object.keys(map).forEach(function (top) { if (!B[top] || !B[top].topLevel) delete map[top]; });
      var mine = Object.keys(map).filter(function (k) { return map[k] === o.id; });
      if (o['do'] === 'delete_script') { if (mine.length) bad.push(o); return; }
      var src = o.sprite === STAGE ? (prog.stage || {}) : ((prog.sprites || {})[o.sprite] || {});
      var want = JSON.stringify((src.scripts || {})[o.id] || []);
      function same(top) { var c = { bad: [] }; return JSON.stringify(self.stackOut(B, top, c)) === want && !c.bad.length; }
      if (mine.length === 1 && same(mine[0])) return;
      var free = t.blocks.getScripts().filter(function (top) { return B[top] && !B[top].shadow && (!map[top] || map[top] === o.id) && same(top); });
      if (free.length) { mine.forEach(function (k) { delete map[k]; }); map[free[0]] = o.id; return; }
      bad.push(o);
    });
    return bad;
  };

  /** Every script as the student sees it in the editor: one block per line, nested blocks indented two spaces,
      reporters in ( ), conditions in < >. Uses a headless workspace of the editor's own block definitions, so blocks
      outside the whitelist show as they do in the editor. Editing target first; at most `limit` characters in all.
      -> {sprite: {scriptId: text}} (call after snapshot(), which gives every script its id). */
  Ops.prototype.texts = function (vm, SB, limit) {
    var self = this, out = {}, total = 0, max = limit || 6000;
    FI = (SB && SB.FieldImage) || null;
    var list = this.targets(vm).slice().sort(function (a, b) { return (b === vm.editingTarget) - (a === vm.editingTarget); });
    list.forEach(function (t) {
      var name = self.nameOf(t), map = self.sids[name] || {}, B = t.blocks._blocks;
      var tops = t.blocks.getScripts().filter(function (id) { return B[id] && !B[id].shadow && map[id]; });
      if (!tops.length || total >= max) return;
      var ws = null, o = out[name] = {};
      try {
        if (SB && SB.Workspace && SB.Xml) {
          ws = new SB.Workspace();
          var toDom = (SB.utils && SB.utils.xml && SB.utils.xml.textToDom) || SB.Xml.textToDom;
          SB.Xml.domToWorkspace(toDom('<xml xmlns="http://www.w3.org/1999/xhtml">' + varsXml(vm, t) + t.blocks.toXML() + '</xml>'), ws);
        }
      } catch (e) { if (ws) try { ws.dispose(); } catch (x) {} ws = null; }
      tops.forEach(function (top) {
        if (total >= max) return;
        var txt = null;
        try { var blk = ws && ws.getBlockById(top); if (blk) txt = stackText(blk, '').join('\n'); } catch (e) { txt = null; }
        if (!txt) txt = self.plainText(B, top);
        // the first line names the script to the student (「當 空白 鍵被按下」嗰段): the hat as the editor shows it, <= 40 chars
        var nl = txt.indexOf('\n'), first = nl < 0 ? txt : txt.slice(0, nl);
        if (first.length > 40) txt = first.slice(0, 39) + '…' + (nl < 0 ? '' : txt.slice(nl));
        if (txt.length > 1200) txt = txt.slice(0, 1199) + '…';            // per script (the service's limit)
        if (total + txt.length > max) txt = txt.slice(0, Math.max(0, max - total - 1)) + '…';
        o[map[top]] = txt; total += txt.length;
      });
      if (ws) try { ws.dispose(); } catch (e) {}
    });
    return out;
  };
  /** Fallback when the editor's definitions cannot be used: opcode names, one per line. */
  Ops.prototype.plainText = function (B, top) {
    var lines = [];
    function walk(id, ind) {
      for (var g = 0; id && B[id] && g < 500; g++) {
        var b = B[id]; lines.push(ind + b.opcode);
        Object.keys(b.inputs || {}).forEach(function (nm) { var c = B[(b.inputs[nm] || {}).block]; if (c && !c.shadow && c.next !== undefined && /SUBSTACK/.test(nm)) walk(c.id, ind + '  '); });
        id = b.next;
      }
    }
    walk(top, '');
    return lines.join('\n');
  };
  var FI = null;                            // the editor's FieldImage class (set by texts())
  function isImage(f) {
    if (FI && f instanceof FI) return true;
    if (f.imageHeight !== undefined || f.imageHeight_ !== undefined) return true;
    var v = ''; try { v = String(f.getValue ? f.getValue() : ''); } catch (e) {}
    return /\.(svg|png|gif)(\?|$)|^data:image\//.test(v);
  }
  function fieldText(f) {
    if (!f) return '';
    var t = '';
    try { t = String(f.getText ? f.getText() : (f.getValue ? f.getValue() : '')); } catch (e) { t = ''; }
    if (isImage(f)) {                       // icons: the green flag is a word students use; the others say nothing
      var v = ''; try { v = String(f.getValue ? f.getValue() : ''); } catch (e) {}
      return (/flag/i.test(t) || /green-flag/.test(v)) ? '綠旗' : '';
    }
    return t.replace(/ /g, ' ').trim();
  }
  function inlineText(blk) {
    var parts = [];
    (blk.inputList || []).forEach(function (inp) {
      (inp.fieldRow || []).forEach(function (f) { var s = fieldText(f); if (s) parts.push(s); });
      var c = inp.connection && inp.connection.targetBlock && inp.connection.targetBlock();
      if (c && inp.type !== 3) {              // 3 = statement input (never inline)
        var s = inlineText(c);
        if (c.isShadow && c.isShadow()) parts.push(s);
        else parts.push(c.outputConnection && c.outputConnection.getCheck && /Boolean/.test(String(c.outputConnection.getCheck())) ? '<' + s + '>' : '(' + s + ')');
      } else if (!c && inp.type === 1) parts.push(inp.connection && inp.connection.getCheck && /Boolean/.test(String(inp.connection.getCheck())) ? '<>' : '()');
    });
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }
  function stackText(blk, ind) {
    var lines = [];
    for (var g = 0; blk && g < 500; g++) {
      var cur = [];
      (blk.inputList || []).forEach(function (inp) {
        (inp.fieldRow || []).forEach(function (f) { var s = fieldText(f); if (s) cur.push(s); });
        var c = inp.connection && inp.connection.targetBlock && inp.connection.targetBlock();
        if (inp.type === 3) {                 // statement input: flush the line, then the nested stack, indented
          var head = cur.join(' ').replace(/\s+/g, ' ').trim(); if (head) lines.push(ind + head); cur = [];
          if (c) lines = lines.concat(stackText(c, ind + '  '));
        } else if (c) {
          var s = inlineText(c);
          if (c.isShadow && c.isShadow()) cur.push(s);
          else cur.push(c.outputConnection && c.outputConnection.getCheck && /Boolean/.test(String(c.outputConnection.getCheck())) ? '<' + s + '>' : '(' + s + ')');
        } else if (inp.type === 1) cur.push(inp.connection && inp.connection.getCheck && /Boolean/.test(String(inp.connection.getCheck())) ? '<>' : '()');
      });
      var rest = cur.join(' ').replace(/\s+/g, ' ').trim();
      if (rest && !/^[*\s]*$/.test(rest)) lines.push(ind + rest);
      blk = blk.getNextBlock ? blk.getNextBlock() : null;
    }
    return lines;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function varsXml(vm, t) {
    var st = vm.runtime.getTargetForStage(), seen = {}, out = '';
    [st, t].forEach(function (x) {
      if (!x) return;
      Object.keys(x.variables || {}).forEach(function (id) {
        var v = x.variables[id]; if (seen[id]) return; seen[id] = 1;
        out += '<variable type="' + esc(v.type || '') + '" id="' + esc(id) + '" islocal="' + (x.isStage ? 'false' : 'true') + '" iscloud="false">' + esc(v.name) + '</variable>';
      });
    });
    return '<variables>' + out + '</variables>';
  }

  function countOps(x) { var n = 0; JSON.stringify(x || []).replace(/"op":/g, function () { n += 1; }); return n; }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  Ops.countOps = countOps;
  global.StudioOps = Ops;
})(window);
