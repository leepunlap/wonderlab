#!/usr/bin/env python3
"""WLAnim (animated AI edits) — end-state, timing, skip and reduced-motion checks in headless Chrome (Playwright).

    python3 server/studio_server.py --port 8925 &            # ports 8925-8929 belong to this package
    python3 test/anim_cases.py [--base http://127.0.0.1:8925] [--only name,name] [--video]

Every case: set up a program in the live editor, take the program the browser would send (`before`), make the reply's
program (`after`) and ops, compute the REFERENCE = what today's instant path (StudioOps.apply, unchanged) produces from
the same state (run on a saved copy in the same page, then put back), then run WLAnim.play and compare the live program
(WLStudio.snapshotNow) with the reference. Also: no fallback, total time, pointer shown, blocks appearing one by one,
no page errors. Results -> test/out/anim_cases.json; --video records one animation to shots/anim/.
Copyright (C) 2026 IITS. AGPL-3.0-only.
"""
import argparse, copy, json, os, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "test", "out")
SHOTS = os.path.join(ROOT, "shots", "anim")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"]
STAGE = "舞台"
LIMIT_MS = 8600            # spec: at most ~8 s per turn (animation budget 8 s incl. the final check)

HELPERS = r"""
window.__T = {
  async init() {
    this.spec = await (await fetch('opcodes.json')).json();
    this.ops = new StudioOps(this.spec);
    return true;
  },
  targets() { return WLStudio.vm.runtime.targets.filter(t => t.isOriginal); },
  ensureSprites(n) {
    const vm = WLStudio.vm;
    const sprites = () => this.targets().filter(t => !t.isStage);
    const make = () => vm.duplicateSprite(sprites()[0].id);
    let p = Promise.resolve();
    for (let i = sprites().length; i < n; i++) p = p.then(make);
    return p.then(() => { vm.setEditingTarget(sprites()[0].id); return sprites().map(t => t.getName()); });
  },
  clear() {
    const vm = WLStudio.vm;
    vm.stopAll();
    this.targets().forEach(t => { t.blocks.getScripts().slice().forEach(id => { vm.runtime.quietGlow(id); t.blocks.deleteBlock(id); }); });
    vm.emitWorkspaceUpdate();
  },
  // init: {sprite: {sid: [blocks]}}; hand: [[sprite, blocks]] (scripts without an AI id); foreign: [[sprite, blocks]]
  // (an extra block outside the whitelist is appended); editing: sprite to show
  setup(init, hand, foreign, editing, y0) {
    const vm = WLStudio.vm; this.clear();
    const ys = {};
    if (y0) this.targets().forEach(t => { ys[t.isStage ? '舞台' : t.getName()] = y0; });
    const place = (t, blocks, sid) => {
      const name = t.isStage ? '舞台' : t.getName(); const y = ys[name] || 40;
      const b = this.ops.build(vm, t, blocks, 40, y, sid);
      b.blocks.forEach(x => t.blocks.createBlock(x));
      ys[name] = y + 90 + 48 * StudioOps.countOps(blocks);
      return b;
    };
    Object.keys(init || {}).forEach(name => {
      const t = this.ops.targetByName(vm, name);
      Object.keys(init[name]).forEach(sid => place(t, init[name][sid], sid));
    });
    (hand || []).forEach(([name, blocks]) => {
      const t = this.ops.targetByName(vm, name), b = place(t, blocks, 'tmp');
      const B = t.blocks._blocks, old = b.top, nu = 'hand' + Math.random().toString(36).slice(2, 10);
      const top = B[old]; delete B[old]; top.id = nu; B[nu] = top;
      Object.values(B).forEach(x => { if (x.parent === old) x.parent = nu; });
      const i = t.blocks._scripts.indexOf(old); if (i >= 0) t.blocks._scripts[i] = nu;
      t.blocks.resetCache();
    });
    (foreign || []).forEach(([name, blocks]) => {
      const t = this.ops.targetByName(vm, name), b = place(t, blocks, 'fx');
      const B = t.blocks._blocks; let last = b.top; while (B[last].next) last = B[last].next;
      const id = 'foreign' + Math.random().toString(36).slice(2, 8);
      t.blocks.createBlock({id, opcode: 'sound_stopallsounds', inputs: {}, fields: {}, next: null, parent: last, shadow: false, topLevel: false});
      B[last].next = id;
    });
    this.targets().forEach(t => t.blocks.updateTargetSpecificBlocks(t.isStage));
    const ed = editing ? this.ops.targetByName(vm, editing) : this.targets().find(t => !t.isStage);
    vm.setEditingTarget(ed.id);
    vm.emitWorkspaceUpdate();
    return WLStudio.snapshotNow().program;
  },
  positions() {
    const out = {}; const snap = WLStudio.snapshotNow();
    return snap;
  },
  topXY(sprite, sid) {
    const vm = WLStudio.vm; const t = this.ops.targetByName(vm, sprite); if (!t) return null;
    const snapOps = this.lastSeed || null;
    const B = t.blocks._blocks;
    // find the top block whose decompile equals the expected script id via the studio snapshot ids
    const want = WLStudio.snapshotNow().program; const list = (sprite === '舞台' ? want.stage : (want.sprites[sprite] || {})).scripts || {};
    const js = JSON.stringify(list[sid]);
    const tops = t.blocks.getScripts().filter(id => B[id] && !B[id].shadow);
    for (const top of tops) { if (JSON.stringify(this.ops.stackOut(B, top, {bad: []})) === js) return [Math.round(B[top].x), Math.round(B[top].y)]; }
    return null;
  },
  place(target, n) {      // studio.js place(): a free spot in the visible part of the workspace
    const ws = WLStudio.workspace(), vm = WLStudio.vm, h = 70 + 52 * n, w = 320;
    if (ws && vm.editingTarget === target && ws.getMetricsManager) {
      const v = ws.getMetricsManager().getViewMetrics(true);
      const rects = ws.getTopBlocks(false).map(b => b.getBoundingRectangle());
      const free = (x, y) => rects.every(r => x + w < r.left - 20 || x > r.right + 20 || y + h < r.top - 20 || y > r.bottom + 20);
      for (let x = v.left + 40; x < v.left + Math.max(v.width - 100, 60); x += 120)
        for (let y = v.top + 40; y < v.top + Math.max(v.height - 80, 60); y += 40) if (free(x, y)) return {x, y};
      const maxB = rects.reduce((m, r) => Math.max(m, r.bottom), v.top);
      return {x: v.left + 40, y: maxB + 60};
    }
    const B = target.blocks._blocks; let bottom = 0;
    target.blocks.getScripts().forEach(id => { const b = B[id]; if (b) { let n = 0, x = id; while (x && B[x]) { n++; x = B[x].next; } bottom = Math.max(bottom, (b.y || 0) + 60 + 52 * n); } });
    return {x: 40, y: bottom + 40};
  },
  // today's instant path (StudioOps.apply, unchanged) on the current state; the state is put back afterwards
  async reference(before, after, ops) {
    const vm = WLStudio.vm, so = new StudioOps(this.spec), saved = {};
    this.targets().forEach(t => {
      const name = t.isStage ? '舞台' : t.getName(), B = t.blocks._blocks;
      saved[t.id] = {t, blocks: JSON.parse(JSON.stringify(B)), scripts: t.blocks._scripts.slice()};
      const want = (name === '舞台' ? before.stage : (before.sprites[name] || {})).scripts || {};
      const map = so.sids[name] = {}, used = {};
      const tops = t.blocks.getScripts().filter(id => B[id] && !B[id].shadow);
      tops.forEach(top => {
        const js = JSON.stringify(so.stackOut(B, top, {bad: []}));
        const pre = Object.keys(want).find(sid => !used[sid] && top.indexOf('wl_' + sid + '_') === 0 && JSON.stringify(want[sid]) === js);
        const any = pre || Object.keys(want).find(sid => !used[sid] && JSON.stringify(want[sid]) === js);
        if (any) { map[top] = any; used[any] = 1; }
      });
    });
    // (the VM's own delete handler does this; StudioOps.apply deletes straight in the VM, so a running script that is
    // replaced would otherwise make the editor un-glow a block it no longer has)
    this.targets().forEach(t => t.blocks.getScripts().forEach(id => vm.runtime.quietGlow(id)));
    const res = await so.apply(vm, {ops, program: after}, (t, n) => this.place(t, n));
    const prog = so.snapshot(vm).program;
    const xy = {};
    res.done.forEach(d => { if (d.top) { const b = d.target.blocks._blocks[d.top]; xy[(d.target.isStage ? '舞台' : d.target.getName()) + '/' + so.sids[d.target.isStage ? '舞台' : d.target.getName()][d.top]] = [Math.round(b.x), Math.round(b.y)]; } });
    Object.values(saved).forEach(s => {
      const b = s.t.blocks, B = b._blocks;
      b.getScripts().forEach(id => vm.runtime.quietGlow(id));
      Object.keys(B).forEach(id => delete B[id]); b._scripts.length = 0;
      s.scripts.forEach(id => { if (s.blocks[id]) b.createBlock(JSON.parse(JSON.stringify(s.blocks[id]))); });
      Object.keys(s.blocks).forEach(id => { if (!B[id]) b.createBlock(JSON.parse(JSON.stringify(s.blocks[id]))); });
      b.resetCache(); b.updateTargetSpecificBlocks(s.t.isStage);
    });
    vm.emitWorkspaceUpdate();
    return {prog, skipped: res.skipped.length, sideBySide: res.sideBySide.length, xy};
  },
  start(before, after, ops, opts) {
    window.__res = null; window.__err = null; window.__samples = [];
    const ws = WLStudio.workspace();
    const t0 = performance.now();
    const iv = setInterval(() => {
      const n = ws.getAllBlocks(false).filter(b => !b.isShadow() && !b.isInsertionMarker()).length;
      window.__samples.push([Math.round(performance.now() - t0), n, !!document.querySelector('.wl-anim-ptr.on'), !!document.querySelector('.wl-anim-skip')]);
    }, 80);
    WLAnim.play(Object.assign({vm: WLStudio.vm, before, after, ops, root: document.getElementById('wl-editor'),
      onProgress: p => { (window.__prog = window.__prog || []).push(p.phase); }}, opts || {}))
      .then(r => { clearInterval(iv); window.__res = Object.assign({}, r, {done: r.done.map(d => ({sprite: d.sprite, id: d.id, top: d.top}))}); },
            e => { clearInterval(iv); window.__err = String(e && e.stack || e); });
    return true;
  },
};
"""

# ------------------------------------------------------------------ blocks used by the cases
FLAG = {"op": "event_whenflagclicked"}
def mv(n): return {"op": "motion_movesteps", "STEPS": n}
def tr(n): return {"op": "motion_turnright", "DEGREES": n}
def say(t, s=2): return {"op": "looks_sayforsecs", "MESSAGE": t, "SECS": s}
def key(k): return {"op": "event_whenkeypressed", "KEY_OPTION": k}
BOUNCE = {"op": "motion_ifonedgebounce"}
def forever(*b): return {"op": "control_forever", "SUBSTACK": list(b)}
def repeat(n, *b): return {"op": "control_repeat", "TIMES": n, "SUBSTACK": list(b)}
def iff(cond, *b): return {"op": "control_if", "CONDITION": cond, "SUBSTACK": list(b)}
def touching(what): return {"op": "sensing_touchingobject", "TOUCHINGOBJECTMENU": what}

# each case: init (setup), set {sprite: {sid: blocks}}, delete [(sprite, sid)], sprites (count), editing (sprite on screen)
CASES = [
    {"name": "new_script", "init": {}, "set": {"角色1": {"s1": [FLAG, mv(10), tr(15)]}}},
    {"name": "insert_middle", "init": {"角色1": {"s1": [FLAG, mv(10), say("你好", 2)]}},
     "set": {"角色1": {"s1": [FLAG, mv(10), tr(15), say("你好", 2)]}}},
    {"name": "change_number", "init": {"角色1": {"s1": [FLAG, mv(10), tr(15)]}}, "set": {"角色1": {"s1": [FLAG, mv(25), tr(15)]}}},
    {"name": "change_dropdown_field", "init": {"角色1": {"s1": [key("space"), mv(10)]}}, "set": {"角色1": {"s1": [key("up arrow"), mv(10)]}}},
    {"name": "change_menu_input", "init": {"角色1": {"s1": [FLAG, {"op": "motion_goto", "TO": "_random_"}]}},
     "set": {"角色1": {"s1": [FLAG, {"op": "motion_goto", "TO": "_mouse_"}]}}},
    {"name": "nested_forever_if", "init": {},
     "set": {"角色1": {"s1": [FLAG, forever(mv(10), iff(touching("_edge_"), tr(180)))]}}},
    {"name": "wrap_in_forever", "init": {"角色1": {"s1": [FLAG, mv(10), BOUNCE]}}, "set": {"角色1": {"s1": [FLAG, forever(mv(10), BOUNCE)]}}},
    {"name": "repeat_keeps_tail_outside", "init": {"角色1": {"s1": [FLAG, mv(10), say("完成", 1)]}},
     "set": {"角色1": {"s1": [FLAG, repeat(4, mv(10), tr(90)), say("完成", 1)]}}},
    {"name": "if_else_in_forever", "init": {},
     "set": {"角色1": {"s1": [FLAG, forever({"op": "control_if_else", "CONDITION": {"op": "sensing_keypressed", "KEY_OPTION": "space"},
                                                "SUBSTACK": [{"op": "looks_say", "MESSAGE": "跳"}], "SUBSTACK2": [{"op": "looks_say", "MESSAGE": "停"}]})]}}},
    {"name": "other_sprite", "sprites": 2, "editing": "角色1", "init": {"角色1": {"s1": [FLAG, mv(10)]}},
     "set": {"角色2": {"s5": [{"op": "event_whenthisspriteclicked"}, {"op": "looks_nextcostume"}, say("我係第二個角色", 1)]}}},
    {"name": "delete_script", "init": {"角色1": {"s1": [FLAG, mv(10)], "s2": [key("space"), tr(15)]}}, "delete": [("角色1", "s2")]},
    {"name": "replace_script_keeps_position", "init": {"角色1": {"s0": [key("a"), say("早晨", 1)], "s1": [FLAG, mv(10), BOUNCE]}},
     "set": {"角色1": {"s1": [{"op": "event_whenthisspriteclicked"}, {"op": "looks_say", "MESSAGE": "你㩒咗我"}, {"op": "control_wait", "DURATION": 1}]}},
     "xy": ("角色1", "s1")},
    {"name": "replace_hat_keep_body", "init": {"角色1": {"s1": [FLAG, mv(10), tr(15)]}},
     "set": {"角色1": {"s1": [key("space"), mv(10), tr(15)]}}, "xy": ("角色1", "s1")},
    {"name": "six_scripts", "init": {},
     "set": {"角色1": {"s1": [FLAG, mv(10)], "s2": [key("left arrow"), {"op": "motion_changexby", "DX": -10}],
                      "s3": [key("right arrow"), {"op": "motion_changexby", "DX": 10}], "s4": [key("up arrow"), {"op": "motion_changeyby", "DY": 10}],
                      "s5": [key("down arrow"), {"op": "motion_changeyby", "DY": -10}], "s6": [{"op": "event_whenthisspriteclicked"}, say("你好", 1)]}}},
    {"name": "remove_middle_block", "init": {"角色1": {"s1": [FLAG, mv(10), tr(15), say("再見", 1)]}},
     "set": {"角色1": {"s1": [FLAG, mv(10), say("再見", 1)]}}},
    {"name": "reporter_in_input", "init": {"角色1": {"s1": [FLAG, {"op": "motion_setx", "X": 0}]}},
     "set": {"角色1": {"s1": [FLAG, {"op": "motion_setx", "X": {"op": "operator_random", "FROM": -200, "TO": 200}}]}}},
    {"name": "change_text_cjk", "init": {"角色1": {"s1": [FLAG, {"op": "looks_say", "MESSAGE": "你好嗎"}]}},
     "set": {"角色1": {"s1": [FLAG, {"op": "looks_say", "MESSAGE": "我係機械人"}]}}},
    {"name": "stop_option_space_bar", "init": {"角色1": {"s1": [{"op": "event_whenthisspriteclicked"}, forever({"op": "motion_goto", "TO": "_mouse_"})],
                                                       "s2": [key("space"), {"op": "control_stop", "STOP_OPTION": "this script"}]}},
     "set": {"角色1": {"s2": [key("space"), {"op": "control_stop", "STOP_OPTION": "all"}]}}},
    {"name": "stage_script", "init": {"角色1": {"s1": [FLAG, mv(10)]}},
     "set": {STAGE: {"s1": [FLAG, {"op": "looks_switchbackdropto", "BACKDROP": "背景1"}, {"op": "control_wait", "DURATION": 1}]}}},
    {"name": "variable_blocks", "init": {},
     "set": {"角色1": {"s1": [FLAG, {"op": "data_setvariableto", "VARIABLE": "分數", "VALUE": "0"},
                              forever({"op": "data_changevariableby", "VARIABLE": "分數", "VALUE": 1}, {"op": "control_wait", "DURATION": 1})]}}},
    {"name": "broadcast_pair", "init": {},
     "set": {"角色1": {"s1": [FLAG, {"op": "event_broadcast", "BROADCAST_INPUT": "開始"}],
                      "s2": [{"op": "event_whenbroadcastreceived", "BROADCAST_OPTION": "開始"}, say("收到", 1)]}}},
    {"name": "missing_inputs_canonical", "init": {"角色1": {"s1": [FLAG, mv(10)]}},
     "set": {"角色1": {"s1": [FLAG, {"op": "motion_movesteps"}, {"op": "looks_say"}, {"op": "control_repeat", "SUBSTACK": [{"op": "motion_turnleft"}]}]}}},
    {"name": "hand_script_edited_by_ai", "init": {}, "hand": [("角色1", [FLAG, mv(10)])],
     "set": {"角色1": {"$hand": [FLAG, forever(mv(10), BOUNCE)]}}},
    {"name": "foreign_block_side_by_side", "init": {}, "foreign": [("角色1", [FLAG, mv(10)])],
     "set": {"角色1": {"$fx": [FLAG, mv(20)]}}},
    {"name": "pen_drawing", "init": {},
     "set": {"角色1": {"s1": [FLAG, {"op": "pen_clear"}, {"op": "pen_penDown"}, repeat(4, mv(60), tr(90)), {"op": "pen_penUp"}]}}},
    {"name": "two_sprites_delete_and_add", "sprites": 2, "editing": "角色1",
     "init": {"角色1": {"s1": [FLAG, mv(10)], "s2": [key("space"), tr(15)]}, "角色2": {"s1": [FLAG, say("hi", 1)]}},
     "set": {"角色2": {"s1": [FLAG, say("hi", 1), mv(5)]}}, "delete": [("角色1", "s2")]},
    {"name": "unwrap_forever", "init": {"角色1": {"s1": [FLAG, forever(mv(10), BOUNCE)]}}, "set": {"角色1": {"s1": [FLAG, mv(10), BOUNCE]}}},
    {"name": "zoomed_in_workspace", "zoom": 1.0, "init": {"角色1": {"s1": [FLAG, mv(10)]}},
     "set": {"角色1": {"s1": [FLAG, forever(mv(10), BOUNCE)], "s2": [key("space"), say("跳", 1)]}}},
    {"name": "script_far_below_view", "y0": 1500, "init": {"角色1": {"s1": [FLAG, mv(10), tr(15)]}},
     "set": {"角色1": {"s1": [FLAG, mv(30), tr(15), BOUNCE]}}},
    {"name": "project_running_meanwhile", "run": True, "init": {"角色1": {"s1": [FLAG, forever(tr(5))]}},
     "set": {"角色1": {"s1": [FLAG, forever(tr(5), mv(2), BOUNCE)]}}},
    {"name": "instant_path_while_running", "run": True, "opts": {"instant": True}, "expect_anim": False,
     "init": {"角色1": {"s1": [FLAG, forever(tr(5))]}}, "set": {"角色1": {"s1": [FLAG, forever(tr(15))]}}},
    {"name": "op_for_missing_sprite", "init": {"角色1": {"s1": [FLAG, mv(10)]}},
     "set": {"角色9": {"s1": [FLAG, mv(5)]}, "角色1": {"s1": [FLAG, mv(15)]}}},
    {"name": "set_empty_list", "init": {"角色1": {"s1": [FLAG, mv(10)], "s2": [key("space"), tr(15)]}}, "set": {"角色1": {"s2": []}}},
    {"name": "set_then_delete_same_turn", "expect_anim": False, "init": {"角色1": {"s1": [FLAG, mv(10)]}},
     "set": {"角色1": {"s3": [key("a"), tr(15)]}}, "delete": [("角色1", "s3")]},
    {"name": "big_script_partial", "init": {},
     "set": {"角色1": {"s1": [FLAG, {"op": "motion_gotoxy", "X": 0, "Y": 0}, {"op": "pen_clear"}, {"op": "pen_penDown"},
                              repeat(36, mv(10), tr(10), {"op": "pen_changePenColorParamBy", "COLOR_PARAM": "color", "VALUE": 5}),
                              {"op": "pen_penUp"}, say("畫好了", 2), {"op": "looks_nextcostume"}, {"op": "control_wait", "DURATION": 1},
                              {"op": "looks_nextcostume"}, {"op": "motion_pointindirection", "DIRECTION": 45}, {"op": "looks_changesizeby", "CHANGE": 10},
                              {"op": "looks_seteffectto", "EFFECT": "GHOST", "VALUE": 20}]}}},
]


def resolve_sid(before, sprite, sid):
    scripts = (before["stage"] if sprite == STAGE else before["sprites"].get(sprite, {})).get("scripts", {})
    if sid == "$hand":
        return next(k for k in scripts if k.startswith("h"))
    if sid == "$fx":
        return "fx"
    return sid


def make_reply(case, before):
    after = copy.deepcopy(before)
    ops = []
    for sprite, d in (case.get("set") or {}).items():
        tgt = after["stage"] if sprite == STAGE else after["sprites"].setdefault(sprite, {"scripts": {}})
        for sid, blocks in d.items():
            rid = resolve_sid(before, sprite, sid)
            tgt["scripts"][rid] = blocks
            ops.append({"do": "set_script", "sprite": sprite, "id": rid, "n": len(blocks)})
    for sprite, sid in case.get("delete") or []:
        tgt = after["stage"] if sprite == STAGE else after["sprites"].setdefault(sprite, {"scripts": {}})
        tgt["scripts"].pop(sid, None)
        ops.append({"do": "delete_script", "sprite": sprite, "id": sid})
    return after, ops


def count_blocks(x):
    if isinstance(x, dict):
        return (1 if "op" in x else 0) + sum(count_blocks(v) for v in x.values())
    if isinstance(x, list):
        return sum(count_blocks(v) for v in x)
    return 0


def open_page(br, base, viewport, errors, label, reduced=False, video=None):
    kw = {"viewport": viewport}
    if reduced:
        kw["reduced_motion"] = "reduce"
    if video:
        kw["record_video_dir"] = video
        kw["record_video_size"] = viewport
    ctx = br.new_context(**kw)
    pg = ctx.new_page()
    T_OPEN[id(pg)] = time.time()             # the video of a page starts about here
    pg.on("pageerror", lambda e: errors.append({"page": label, "type": "pageerror", "text": str(e)[:400], "case": CURRENT[0]}))
    pg.on("console", lambda m: errors.append({"page": label, "type": m.type, "text": m.text[:400]}) if m.type == "error" else None)
    pg.on("request", lambda r: errors.append({"page": label, "type": "external", "text": r.url}) if r.url.startswith("http") and not r.url.startswith(base) else None)
    pg.goto(base + "/")
    pg.wait_for_selector('html[data-wl-ready="1"]', timeout=120000)
    pg.add_script_tag(url="/studio-anim.js")
    pg.evaluate(HELPERS)
    pg.evaluate("() => __T.init()")
    pg.wait_for_timeout(400)
    return ctx, pg


CURRENT = ["(load)"]
T_OPEN = {}


def run_case(pg, case, opts=None, skip_at=None, shots=None, skip_api_at=None):
    """-> dict with ok flags. opts: extra play() options. skip_at: seconds after start to click 跳過動畫."""
    CURRENT[0] = case["name"] + ":setup"
    names = pg.evaluate("(n) => __T.ensureSprites(n)", case.get("sprites", 1))
    before = pg.evaluate("([i, h, f, e, y]) => __T.setup(i, h, f, e, y)", [case.get("init") or {}, case.get("hand") or [], case.get("foreign") or [], case.get("editing"), case.get("y0")])
    pg.evaluate("(z) => { const ws = WLStudio.workspace(); ws.setScale(z || 0.675); ws.scroll(0, 0); }", case.get("zoom"))
    if case.get("run"):
        pg.evaluate("() => WLStudio.vm.greenFlag()")
    pg.wait_for_timeout(500)                       # let studio.js's own hand-version timer settle
    before = pg.evaluate("() => WLStudio.snapshotNow().program")
    after, ops = make_reply(case, before)
    ref = pg.evaluate("([b, a, o]) => __T.reference(b, a, o)", [before, after, ops])
    pg.wait_for_timeout(300)
    xy0 = None
    if case.get("xy"):
        sp, sid = case["xy"]
        xy0 = pg.evaluate("([s, i]) => __T.topXY(s, i)", [sp, sid])
    t0 = time.time()
    CURRENT[0] = case["name"] + ":play"
    pg.evaluate("([b, a, o, x]) => __T.start(b, a, o, x)", [before, after, ops, opts or {}])
    clicked = None
    shot_i = 0
    while True:
        if pg.evaluate("() => !!(window.__res || window.__err)"):
            break
        el = time.time() - t0
        if skip_at is not None and clicked is None and el >= skip_at:
            btn = pg.query_selector(".wl-anim-skip")
            if btn:
                btn.click()
                clicked = time.time()
        if skip_api_at is not None and clicked is None and el >= skip_api_at:
            pg.evaluate("() => WLAnim.skip()")
            clicked = time.time()
        if shots and shot_i < len(shots) and el >= shots[shot_i][0]:
            pg.screenshot(path=shots[shot_i][1])
            shot_i += 1
        if el > 40:
            break
        pg.wait_for_timeout(40)
    wall = time.time() - t0
    CURRENT[0] = case["name"] + ":after"
    res = pg.evaluate("() => window.__res || {error: window.__err}")
    samples = pg.evaluate("() => window.__samples")
    live = pg.evaluate("() => WLStudio.snapshotNow().program")
    if case.get("run"):
        pg.wait_for_timeout(600)                   # a few frames of the running project on the new blocks
        pg.evaluate("() => WLStudio.vm.stopAll()")
    xy1 = None
    if case.get("xy"):
        sp, sid = case["xy"]
        xy1 = pg.evaluate("([s, i]) => __T.topXY(s, i)", [sp, sid])
    counts = [s[1] for s in samples]
    distinct = sorted(set(counts))
    out = {
        "name": case["name"],
        "t_start": t0,
        "blocks": count_blocks([v for d in (case.get("set") or {}).values() for v in d.values()]),
        "ok": bool(res.get("ok")),
        "equal_reference": live == ref["prog"],
        "fallback": bool(res.get("fallback")),
        "animated": bool(res.get("animated")),
        "skipped": bool(res.get("skipped")),
        "ms": res.get("ms"),
        "wall_s": round(wall, 2),
        "pointer_seen": any(s[2] for s in samples),
        "skip_button_seen": any(s[3] for s in samples),
        "block_counts_seen": len(distinct),
        "not_applied": len(res.get("notApplied") or []),
        "ref_not_applied": ref["skipped"],
        "side_by_side": len(res.get("sideBySide") or []),
        "ref_side_by_side": ref["sideBySide"],
        "diffs": res.get("diffs"),
        "timeline": res.get("timeline"), "k": res.get("k"), "estimate": res.get("estimate"),
        "error": res.get("error"),
    }
    if clicked:
        out["skip_to_done_s"] = round(wall - (clicked - t0), 2)
    if xy0 is not None or xy1 is not None:
        out["xy_before"], out["xy_after"] = xy0, xy1
    if not out["equal_reference"]:
        out["live"], out["reference"] = live, ref["prog"]
    return out


def frame_strip(paths, times, out):
    """Tile the frames (code area only) into one image for the owner: 4 per row, time under each."""
    from PIL import Image, ImageDraw
    crop = (0, 88, 660, 900)                      # palette + code area at 1440x900
    tiles = []
    for pth, t in zip(paths, times):
        if not os.path.exists(pth):
            continue
        im = Image.open(pth).convert("RGB").crop(crop)
        im = im.resize((im.width * 330 // im.width, im.height * 330 // im.width))
        canvas = Image.new("RGB", (im.width, im.height + 22), "white")
        canvas.paste(im, (0, 0))
        ImageDraw.Draw(canvas).text((6, im.height + 4), ("%.1f s" % t) if t is not None else "end", fill=(15, 23, 42))
        tiles.append(canvas)
    cols = 4
    rows = (len(tiles) + cols - 1) // cols
    w, h = tiles[0].width, tiles[0].height
    sheet = Image.new("RGB", (cols * w + (cols + 1) * 6, rows * h + (rows + 1) * 6), (226, 232, 240))
    for i, tl in enumerate(tiles):
        sheet.paste(tl, (6 + (i % cols) * (w + 6), 6 + (i // cols) * (h + 6)))
    sheet.save(out)
    return out


def judge(r, limit=LIMIT_MS, need_anim=True):
    bad = []
    if not r["ok"]: bad.append("not ok")
    if not r["equal_reference"]: bad.append("end state != instant apply")
    if r["fallback"]: bad.append("fallback used")
    if r["error"]: bad.append("error")
    if r["ms"] is None or r["ms"] > limit: bad.append("too slow %s ms" % r["ms"])
    if need_anim and not r["animated"]: bad.append("not animated")
    if need_anim and not r["pointer_seen"]: bad.append("no pointer")
    if r["not_applied"] != r["ref_not_applied"]: bad.append("not-applied differs")
    if r["side_by_side"] != r["ref_side_by_side"]: bad.append("side-by-side differs")
    if r.get("xy_before") and r.get("xy_after") and (abs(r["xy_before"][0] - r["xy_after"][0]) > 2 or abs(r["xy_before"][1] - r["xy_after"][1]) > 2):
        bad.append("position moved")
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8925")
    ap.add_argument("--only", default="")
    ap.add_argument("--video", action="store_true")
    ap.add_argument("--debug", action="store_true", help="print the animation timeline of every case")
    a = ap.parse_args()
    base = a.base.rstrip("/")
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(SHOTS, exist_ok=True)
    only = set(x for x in a.only.split(",") if x)
    report = {"cases": [], "skip": None, "reduced_motion": None, "setting": None, "guard": None, "errors": []}
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=ARGS)
        ctx, pg = open_page(br, base, {"width": 1440, "height": 900}, report["errors"], "chrome-1440")
        for c in CASES:
            if only and c["name"] not in only:
                continue
            o = dict(c.get("opts") or {})
            if a.debug: o["debug"] = True
            r = run_case(pg, c, opts=o)
            r["bad"] = judge(r, need_anim=c.get("expect_anim", True))
            report["cases"].append(r)
            print(("PASS " if not r["bad"] else "FAIL ") + c["name"].ljust(32) + " %5s ms  blocks %2d  steps seen %2d  %s" % (r["ms"], r["blocks"], r["block_counts_seen"], ", ".join(r["bad"])), flush=True)
            if r["bad"] and r.get("live"):
                print("   live", json.dumps(r["live"], ensure_ascii=False)[:600])
                print("   ref ", json.dumps(r["reference"], ensure_ascii=False)[:600])
            if r.get("diffs"):
                print("   diffs", json.dumps(r["diffs"], ensure_ascii=False)[:600])
            if a.debug:
                print("   k", r.get("k"), "estimate", r.get("estimate"), "timeline", json.dumps(r.get("timeline"), ensure_ascii=False)[:1500])
        if not only or "skip" in only:
            # skip: click 跳過動畫 while six scripts are being built
            six = next(c for c in CASES if c["name"] == "six_scripts")
            r = run_case(pg, six, skip_at=1.2)
            r["bad"] = [b for b in judge(r) if not b.startswith("too slow")]
            if not r["skipped"]: r["bad"].append("not marked skipped")
            if r.get("skip_to_done_s", 99) > 1.5: r["bad"].append("skip took %s s" % r.get("skip_to_done_s"))
            report["skip"] = r
            print(("PASS " if not r["bad"] else "FAIL ") + "skip (button at 1.2 s)".ljust(32) + " %5s ms  done %s s after the click  %s" % (r["ms"], r.get("skip_to_done_s"), ", ".join(r["bad"])))
            # WLAnim.skip() from the page
            ins = next(c for c in CASES if c["name"] == "nested_forever_if")
            r2 = run_case(pg, ins, skip_api_at=0.9)
            r2["bad"] = [b for b in judge(r2) if not b.startswith("too slow")]
            if not r2["skipped"]: r2["bad"].append("not marked skipped")
            if r2.get("skip_to_done_s", 99) > 1.5: r2["bad"].append("skip took %s s" % r2.get("skip_to_done_s"))
            report["skip_api"] = r2
            print(("PASS " if not r2["bad"] else "FAIL ") + "skip() api at 0.9 s".ljust(32) + " %5s ms  %s" % (r2["ms"], ", ".join(r2["bad"])))
        if not only or "guard" in only:
            # a real mouse drag on the code area during the animation changes nothing (the editor is the AI's)
            c = next(c for c in CASES if c["name"] == "insert_middle")
            names = pg.evaluate("() => __T.ensureSprites(1)")
            before = pg.evaluate("([i]) => __T.setup(i, [], [], null)", [c["init"]])
            pg.wait_for_timeout(500)
            before = pg.evaluate("() => WLStudio.snapshotNow().program")
            after, ops = make_reply(c, before)
            ref = pg.evaluate("([b, a, o]) => __T.reference(b, a, o)", [before, after, ops])
            pg.wait_for_timeout(300)
            pg.evaluate("([b, a, o]) => __T.start(b, a, o, {})", [before, after, ops])
            pg.wait_for_timeout(700)
            box = pg.evaluate("() => { const b = WLStudio.workspace().getTopBlocks(false)[0]; const r = b.getSvgRoot().getBoundingClientRect(); return {x: r.left + 20, y: r.top + 20}; }")
            pg.mouse.move(box["x"], box["y"]); pg.mouse.down(); pg.mouse.move(box["x"] + 120, box["y"] + 160, steps=8); pg.mouse.up()
            pg.wait_for_function("() => !!(window.__res || window.__err)", timeout=30000)
            live = pg.evaluate("() => WLStudio.snapshotNow().program")
            res = pg.evaluate("() => window.__res || {error: window.__err}")
            report["guard"] = {"equal_reference": live == ref["prog"], "ok": res.get("ok"), "fallback": res.get("fallback")}
            gbad = [] if (live == ref["prog"] and res.get("ok") and not res.get("fallback")) else ["student drag interfered"]
            print(("PASS " if not gbad else "FAIL ") + "student drag during animation".ljust(32) + " " + json.dumps(report["guard"]))
        if not only or "setting" in only:
            # setEnabled(false) is remembered per browser; play() then applies instantly
            pg.evaluate("() => WLAnim.setEnabled(false)")
            pg.reload(); pg.wait_for_selector('html[data-wl-ready="1"]', timeout=120000)
            pg.add_script_tag(url="/studio-anim.js"); pg.evaluate(HELPERS); pg.evaluate("() => __T.init()")
            off = pg.evaluate("() => WLAnim.enabled()")
            r = run_case(pg, next(c for c in CASES if c["name"] == "nested_forever_if"))
            pg.evaluate("() => WLAnim.setEnabled(true)")
            on = pg.evaluate("() => WLAnim.enabled()")
            sbad = []
            if off is not False: sbad.append("setting not remembered")
            if on is not True: sbad.append("cannot turn back on")
            if r["animated"] or not r["equal_reference"] or not r["ok"]: sbad.append("instant path wrong")
            if r["ms"] is None or r["ms"] > 1500: sbad.append("instant path slow")
            report["setting"] = {"after_reload_enabled": off, "re_enabled": on, "case": r, "bad": sbad}
            print(("PASS " if not sbad else "FAIL ") + "setting off -> instant".ljust(32) + " %5s ms  enabled after reload: %s" % (r["ms"], off))
        ctx.close()
        if not only or "reduced" in only:
            ctx2, pg2 = open_page(br, base, {"width": 1440, "height": 900}, report["errors"], "reduced-motion", reduced=True)
            en = pg2.evaluate("() => WLAnim.enabled()")
            r = run_case(pg2, next(c for c in CASES if c["name"] == "six_scripts"))
            rbad = []
            if en is not False: rbad.append("enabled() true under reduced motion")
            if r["animated"] or r["pointer_seen"]: rbad.append("animated under reduced motion")
            if not r["equal_reference"] or not r["ok"]: rbad.append("end state wrong")
            report["reduced_motion"] = {"enabled": en, "case": r, "bad": rbad}
            print(("PASS " if not rbad else "FAIL ") + "prefers-reduced-motion".ljust(32) + " %5s ms  animated %s" % (r["ms"], r["animated"]))
            ctx2.close()
        if a.video:
            vdir = os.path.join(SHOTS, "video-tmp")
            os.makedirs(vdir, exist_ok=True)
            ctx3, pg3 = open_page(br, base, {"width": 1440, "height": 900}, report["errors"], "video", video=vdir)
            # the owner's space-bar story: the AI wraps the student's script in a loop, changes a number, and builds
            # 當空白鍵被按下 + 停止 這個程式 (picked from the dropdown)
            demo = {"name": "demo_for_owner", "init": {"角色1": {"s1": [FLAG, mv(10), BOUNCE]}},
                    "set": {"角色1": {"s1": [FLAG, forever(mv(15), BOUNCE)], "s2": [key("space"), {"op": "control_stop", "STOP_OPTION": "this script"}]}}}
            frames = [(0.25 + i * 0.6, os.path.join(SHOTS, "frame-%02d.png" % i)) for i in range(11)]
            pg3.wait_for_timeout(600)
            r = run_case(pg3, demo, shots=frames)
            pg3.wait_for_timeout(800)
            pg3.screenshot(path=os.path.join(SHOTS, "frame-99-end.png"))
            vpath = pg3.video.path()
            ctx3.close()
            final = os.path.join(SHOTS, "wlanim-demo-1440x900.webm")
            if os.path.exists(final): os.remove(final)
            os.replace(vpath, final)
            try: os.rmdir(vdir)
            except OSError: pass
            # an MP4 of just the animation (from 0.6 s before it starts), for phones and slides
            start = max(0.0, r["t_start"] - T_OPEN.get(id(pg3), r["t_start"]) - 0.6)
            mp4 = os.path.join(SHOTS, "wlanim-demo-1440x900.mp4")
            import subprocess
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "%.2f" % start, "-i", final, "-c:v", "libx264", "-pix_fmt", "yuv420p",
                            "-crf", "23", "-movflags", "+faststart", mp4], check=False)
            report["video"] = {"webm": final, "mp4": mp4 if os.path.exists(mp4) else None, "mp4_starts_at_s": round(start, 2)}
            report["video"]["case"] = r
            strip = os.path.join(SHOTS, "wlanim-frames.png")
            try:
                report["video"]["strip"] = frame_strip([f for _, f in frames] + [os.path.join(SHOTS, "frame-99-end.png")], [t for t, _ in frames] + [None], strip)
            except Exception as e:                     # PIL missing: the single frames are still there
                report["video"]["strip_error"] = str(e)
            print("video ->", final, "ok" if r["equal_reference"] else "END STATE DIFFERS", "| strip ->", strip)
        br.close()
    errs = [e for e in report["errors"] if e["type"] in ("pageerror", "error", "external")]
    report["page_errors"] = errs
    with open(os.path.join(OUT, "anim_cases.json"), "w") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    failed = [c["name"] for c in report["cases"] if c["bad"]]
    for k in ("skip", "skip_api"):
        if report.get(k) and report[k]["bad"]: failed.append(k)
    if report.get("setting") and report["setting"]["bad"]: failed.append("setting")
    if report.get("reduced_motion") and report["reduced_motion"]["bad"]: failed.append("reduced_motion")
    if report.get("guard") and not report["guard"]["equal_reference"]: failed.append("guard")
    print("page errors:", len(errs), json.dumps(errs, ensure_ascii=False)[:800])
    n = len(report["cases"])
    print("SUMMARY: %d/%d cases pass; failed: %s" % (n - len([c for c in report["cases"] if c["bad"]]), n, failed or "none"))
    sys.exit(1 if failed or errs else 0)


if __name__ == "__main__":
    main()
