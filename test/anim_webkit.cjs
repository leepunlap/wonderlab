#!/usr/bin/env node
// WLAnim in Playwright WebKit (Safari's engine) with an iPad profile at 1024x768 (also 1080x810). Not a real iPad.
//   node test/anim_webkit.cjs [http://127.0.0.1:8925]       (server: python3 server/studio_server.py --port 8925)
// Same checks as test/anim_cases.py on a subset: end state == today's instant apply (run on a saved copy in the same
// page), no fallback, pointer shown, time, a tap on 跳過動畫, no page errors. -> test/out/anim_webkit.json
// Copyright (C) 2026 IITS. AGPL-3.0-only.
'use strict';
const path = require('path'), fs = require('fs');
const { webkit, devices } = require('playwright');
const ROOT = path.dirname(__dirname), BASE = (process.argv[2] || 'http://127.0.0.1:8925').replace(/\/$/, '');
// the in-page helpers are shared with anim_cases.py (one copy of the reference logic)
const PY = fs.readFileSync(path.join(__dirname, 'anim_cases.py'), 'utf8');
const HELPERS = PY.slice(PY.indexOf('HELPERS = r"""') + 14, PY.indexOf('"""', PY.indexOf('HELPERS = r"""') + 14));
const FLAG = { op: 'event_whenflagclicked' };
const mv = n => ({ op: 'motion_movesteps', STEPS: n }), tr = n => ({ op: 'motion_turnright', DEGREES: n });
const say = (t, s) => ({ op: 'looks_sayforsecs', MESSAGE: t, SECS: s }), key = k => ({ op: 'event_whenkeypressed', KEY_OPTION: k });
const CASES = [
  { name: 'new_script', init: {}, set: { '角色1': { s1: [FLAG, mv(10), tr(15)] } } },
  { name: 'insert_middle', init: { '角色1': { s1: [FLAG, mv(10), say('你好', 2)] } }, set: { '角色1': { s1: [FLAG, mv(10), tr(15), say('你好', 2)] } } },
  { name: 'change_dropdown_field', init: { '角色1': { s1: [key('space'), mv(10)] } }, set: { '角色1': { s1: [key('up arrow'), mv(10)] } } },
  { name: 'nested_forever_if', init: {}, set: { '角色1': { s1: [FLAG, { op: 'control_forever', SUBSTACK: [mv(10), { op: 'control_if',
    CONDITION: { op: 'sensing_touchingobject', TOUCHINGOBJECTMENU: '_edge_' }, SUBSTACK: [tr(180)] }] }] } } },
  { name: 'other_sprite', sprites: 2, editing: '角色1', init: { '角色1': { s1: [FLAG, mv(10)] } },
    set: { '角色2': { s5: [{ op: 'event_whenthisspriteclicked' }, { op: 'looks_nextcostume' }, say('我係第二個角色', 1)] } } },
  { name: 'delete_script', init: { '角色1': { s1: [FLAG, mv(10)], s2: [key('space'), tr(15)] } }, del: [['角色1', 's2']] },
];
function reply(c, before) {
  const after = JSON.parse(JSON.stringify(before)), ops = [];
  Object.entries(c.set || {}).forEach(([sp, d]) => Object.entries(d).forEach(([sid, bl]) => {
    const t = sp === '舞台' ? after.stage : (after.sprites[sp] = after.sprites[sp] || { scripts: {} });
    t.scripts[sid] = bl; ops.push({ do: 'set_script', sprite: sp, id: sid, n: bl.length });
  }));
  (c.del || []).forEach(([sp, sid]) => { const t = after.sprites[sp]; if (t) delete t.scripts[sid]; ops.push({ do: 'delete_script', sprite: sp, id: sid }); });
  return { after, ops };
}
async function runCase(pg, c, tapSkipAt) {
  await pg.evaluate(n => __T.ensureSprites(n), c.sprites || 1);
  await pg.evaluate(([i, e]) => __T.setup(i, [], [], e), [c.init || {}, c.editing || null]);
  await pg.waitForTimeout(500);
  const before = await pg.evaluate(() => WLStudio.snapshotNow().program);
  const { after, ops } = reply(c, before);
  const ref = await pg.evaluate(([b, a, o]) => __T.reference(b, a, o), [before, after, ops]);
  await pg.waitForTimeout(300);
  const t0 = Date.now();
  await pg.evaluate(([b, a, o]) => __T.start(b, a, o, {}), [before, after, ops]);
  let tapped = null;
  for (;;) {
    if (await pg.evaluate(() => !!(window.__res || window.__err))) break;
    if (tapSkipAt != null && tapped == null && Date.now() - t0 >= tapSkipAt * 1000) {
      const b = await pg.$('.wl-anim-skip');
      if (b) { await b.tap(); tapped = Date.now(); }
    }
    if (Date.now() - t0 > 40000) break;
    await pg.waitForTimeout(40);
  }
  const wall = (Date.now() - t0) / 1000;
  const res = await pg.evaluate(() => window.__res || { error: window.__err });
  const samples = await pg.evaluate(() => window.__samples);
  const live = await pg.evaluate(() => WLStudio.snapshotNow().program);
  const out = { name: c.name, ok: !!res.ok, equal_reference: JSON.stringify(live) === JSON.stringify(ref.prog) || deepEq(live, ref.prog),
    fallback: !!res.fallback, animated: !!res.animated, skipped: !!res.skipped, ms: res.ms, wall_s: +wall.toFixed(2),
    pointer_seen: samples.some(s => s[2]), skip_button_seen: samples.some(s => s[3]), error: res.error || null, diffs: res.diffs || [] };
  if (tapped) out.skip_to_done_s = +((t0 + wall * 1000 - tapped) / 1000).toFixed(2);
  const bad = [];
  if (!out.ok) bad.push('not ok');
  if (!out.equal_reference) bad.push('end state != instant apply');
  if (out.fallback) bad.push('fallback');
  if (out.error) bad.push('error');
  if (!out.animated || !out.pointer_seen) bad.push('not animated');
  if (tapSkipAt == null && !(out.ms <= 8600)) bad.push('too slow');
  if (tapSkipAt != null && (!out.skipped || !(out.skip_to_done_s <= 1.5))) bad.push('skip tap did not finish quickly');
  out.bad = bad;
  return out;
}
function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEq(a[k], b[k]));
}
(async () => {
  const report = { runs: [], errors: [] };
  const br = await webkit.launch();
  for (const vp of [{ width: 1024, height: 768 }, { width: 1080, height: 810 }]) {
    const dev = Object.assign({}, devices['iPad (gen 7) landscape'], { viewport: vp });
    const ctx = await br.newContext(dev);
    const pg = await ctx.newPage();
    const label = vp.width + 'x' + vp.height;
    pg.on('pageerror', e => report.errors.push({ vp: label, text: String(e).slice(0, 300) }));
    pg.on('console', m => { if (m.type() === 'error') report.errors.push({ vp: label, text: m.text().slice(0, 300) }); });
    pg.on('request', r => { const u = r.url(); if (/^https?:/.test(u) && !u.startsWith(BASE)) report.errors.push({ vp: label, text: 'external request ' + u }); });
    await pg.goto(BASE + '/');
    await pg.waitForSelector('html[data-wl-ready="1"]', { timeout: 120000 });
    await pg.addScriptTag({ url: '/studio-anim.js' });
    await pg.evaluate(HELPERS);
    await pg.evaluate(() => __T.init());
    await pg.waitForTimeout(400);
    const cases = vp.width === 1024 ? CASES : CASES.slice(0, 2);
    for (const c of cases) {
      const r = await runCase(pg, c, null);
      r.viewport = label; report.runs.push(r);
      console.log((r.bad.length ? 'FAIL ' : 'PASS ') + (label + ' ' + c.name).padEnd(40) + String(r.ms).padStart(6) + ' ms ' + r.bad.join(', '));
      if (r.name === 'new_script' && vp.width === 1024) await pg.screenshot({ path: path.join(ROOT, 'shots', 'anim', 'webkit-ipad-1024x768-after.png') });
    }
    if (vp.width === 1024) {
      const six = { name: 'six_scripts_tap_skip', init: {}, set: { '角色1': { s1: [FLAG, mv(10)], s2: [key('left arrow'), mv(-10)], s3: [key('right arrow'), mv(10)],
        s4: [key('up arrow'), tr(15)], s5: [key('down arrow'), tr(-15)], s6: [{ op: 'event_whenthisspriteclicked' }, say('你好', 1)] } } };
      const r = await runCase(pg, six, 1.2);
      r.viewport = label; report.runs.push(r);
      console.log((r.bad.length ? 'FAIL ' : 'PASS ') + (label + ' tap 跳過動畫 at 1.2 s').padEnd(40) + String(r.ms).padStart(6) + ' ms ' + r.bad.join(', '));
    }
    report.user_agent = await pg.evaluate(() => navigator.userAgent);
    await ctx.close();
  }
  await br.close();
  fs.mkdirSync(path.join(ROOT, 'test', 'out'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'test', 'out', 'anim_webkit.json'), JSON.stringify(report, null, 1));
  const failed = report.runs.filter(r => r.bad.length).map(r => r.viewport + ' ' + r.name);
  console.log('page errors:', report.errors.length, JSON.stringify(report.errors).slice(0, 600));
  console.log('SUMMARY: ' + (report.runs.length - failed.length) + '/' + report.runs.length + ' WebKit runs pass; failed: ' + (failed.join(', ') || 'none'));
  process.exit(failed.length || report.errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
