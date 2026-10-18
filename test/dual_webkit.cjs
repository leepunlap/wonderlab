#!/usr/bin/env node
// Dual mode in Playwright WebKit (Safari's engine) with an iPad landscape profile: the full editor inside an L4 lesson page.
// Not a real iPad (touch drags are not simulated: Playwright drives the drag with pointer events).
//   node test/dual_webkit.cjs [base=http://127.0.0.1:8922] [user=wlin04] [WxH ...]      e.g. ... http://127.0.0.1:8961 wlin04 1024x768 1080x810
// With the stub (--site) the turns are canned; against staging they are real DeepSeek turns (2 per size).
// Copyright (C) 2026 IITS. AGPL-3.0-only.
'use strict';
const path = require('path'), fs = require('fs');
const { webkit, devices } = require('playwright');
const ROOT = path.dirname(__dirname);
const BASE = process.argv[2] || 'http://127.0.0.1:8922', USER = process.argv[3] || 'wlin04';
const SIZES = (process.argv.slice(4).length ? process.argv.slice(4) : ['1024x768', '1080x810']).map(s => s.split('x').map(Number));
const SLUG = '501-bp01', SHOTS = path.join(ROOT, 'shots', 'dual');
const R = [];
function check(name, ok, info) { R.push({ check: name, ok: !!ok, info: info === undefined ? '' : (typeof info === 'string' ? info : JSON.stringify(info).slice(0, 500)) });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined && info !== '' ? '  (' + R[R.length - 1].info + ')' : '')); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(pg, fn, secs, arg) { const t0 = Date.now(); while (Date.now() - t0 < secs * 1000) { try { if (await pg.evaluate(fn, arg)) return (Date.now() - t0) / 1000; } catch (e) {} await sleep(200); } return null; }
function frameOf(pg) { return pg.frames().find(f => /lab-frame\.html/.test(f.url())); }
async function off(pg) { return pg.evaluate(() => { const r = document.getElementById('wlsframe').getBoundingClientRect(); return [r.left + 1, r.top + 1]; }); }
async function category(fr, name) { await fr.locator('.blocklyToolboxCategory', { hasText: name }).first().click(); await sleep(900); }
async function flyoutBox(fr, op) {
  const hist = [];
  for (let i = 0; i < 40; i++) {
    const c = await fr.evaluate(op => { const fw = WLStudio.workspace().getFlyout().getWorkspace(); const b = fw.getTopBlocks(false).find(x => x.type === op); if (!b) return null;
      const r = b.getSvgRoot().querySelector('.blocklyPath').getBoundingClientRect(); const xy = WLStudio.blocks().utils.svgMath.wsToScreenCoordinates(fw, b.getRelativeToSurfaceXY());
      return { x: r.left, y: r.top, w: r.width, h: r.height, ox: xy.x, oy: xy.y }; }, op);
    hist.push(c);
    if (hist.length >= 3 && hist.slice(-3).every(h => h && Math.abs(h.y - c.y) < 0.5)) return c;
    await sleep(150);
  }
  return hist[hist.length - 1];
}
async function freePoint(fr, dx, dy) { return fr.evaluate(([dx, dy]) => { const r = document.querySelector('.blocklyMainBackground').getBoundingClientRect();
  const f = document.querySelector('.blocklyFlyout').getBoundingClientRect(); return { x: Math.max(r.left, f.right) + dx, y: r.top + dy }; }, [dx, dy]); }
async function connPoint(fr, op) { return fr.evaluate(op => { const ws = WLStudio.workspace(), SB = WLStudio.blocks();
  let b = ws.getAllBlocks(false).find(x => x.type === op && !x.isShadow()); if (!b) return null; while (b.getNextBlock()) b = b.getNextBlock();
  const c = b.nextConnection; const p = SB.utils.svgMath.wsToScreenCoordinates(ws, new SB.utils.Coordinate(c.x, c.y)); return { x: p.x, y: p.y }; }, op); }
async function drag(pg, fr, src, to) {
  const o = await off(pg), gx = src.x + 10, gy = src.y + Math.min(14, src.h / 2), ox = gx - src.ox, oy = gy - src.oy;
  await pg.mouse.move(o[0] + gx, o[1] + gy); await pg.mouse.down();
  await pg.mouse.move(o[0] + gx + 25, o[1] + gy + 8, { steps: 4 }); await pg.mouse.move(o[0] + to.x + ox, o[1] + to.y + oy, { steps: 18 });
  await sleep(150); await pg.mouse.up(); await sleep(450);
}
async function blockCount(fr) { return fr.evaluate(() => WLStudio.vm.runtime.targets.reduce((n, t) => n + Object.values(t.blocks._blocks).filter(b => !b.shadow).length, 0)); }
async function turn(pg, action, secs) {
  const [resp] = await Promise.all([pg.waitForResponse(r => /\/api\/ai\/lab\/files\/L4\/lessons\//.test(r.url()) && r.request().method() === 'POST', { timeout: (secs || 95) * 1000 }), action()]);
  let body = null, rep = {}; try { body = resp.request().postDataJSON(); } catch (e) {} try { rep = await resp.json(); } catch (e) {}
  return { body, rep, status: resp.status() };
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const br = await webkit.launch();
  for (const [w, h] of SIZES) {
    const tag = `webkit-${w}x${h}`, errors = [], ext = [];
    const dev = Object.assign({}, devices['iPad (gen 7) landscape'], { viewport: { width: w, height: h } });
    const ctx = await br.newContext(dev);
    await ctx.addCookies([{ name: 'wluser', value: USER, url: BASE }]);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errors.push(String(e).slice(0, 200)));
    pg.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 200)); });
    pg.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !/^(data|blob):/.test(u)) ext.push(u); });
    try {
      await pg.goto(`${BASE}/files/L4/lessons/${SLUG}/index.html`);
      await wait(pg, () => !!document.querySelector('.wl-mode') && !document.querySelector('.wl-mode button:nth-child(2)').disabled, 30);
      if (!(await pg.isVisible('.wl-mode button:nth-child(2)')) && await pg.isVisible('#chfab')) { await pg.tap('#chfab'); await sleep(400); }
      const t0 = Date.now();
      await pg.tap('.wl-mode button:nth-child(2)');
      const ok = await wait(pg, () => !!window.WL_BOOT_MS, 150);
      const studio = await pg.evaluate(() => !!window.WL_STUDIO);
      check(`[${tag}] Studio boots in WebKit (iPad landscape)`, ok !== null && studio, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
      if (!studio) throw new Error('no studio');
      const fr = frameOf(pg);
      const g = await pg.evaluate(() => ({ hscroll: document.scrollingElement.scrollWidth > innerWidth + 1, drawer: getComputedStyle(document.getElementById('chat')).position === 'fixed',
        fr: (() => { const r = document.getElementById('wlsframe').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })() }));
      check(`[${tag}] AI 學伴 is a drawer, the editor fills the width, no horizontal scroll`, g.drawer && !g.hscroll && g.fr[0] >= w - 20, g);
      await pg.screenshot({ path: path.join(SHOTS, `${tag}-01-start-drawer-open.png`) });
      if (await pg.evaluate(() => document.getElementById('chat').classList.contains('open'))) { await pg.tap('.chclose'); await sleep(500); }
      await pg.screenshot({ path: path.join(SHOTS, `${tag}-02-editor.png`) });
      // a drag from the palette (pointer events) + run
      await category(fr, '事件'); await drag(pg, fr, await flyoutBox(fr, 'event_whenflagclicked'), await freePoint(fr, 50, 50));
      await category(fr, '動作'); await drag(pg, fr, await flyoutBox(fr, 'motion_movesteps'), await connPoint(fr, 'event_whenflagclicked'));
      const prog = await fr.evaluate(() => WLStudio.program());
      const sprite = Object.keys(prog.sprites)[0], scr = Object.values(prog.sprites[sprite].scripts);
      check(`[${tag}] drag from the palette builds 當綠旗被點擊 + 移動`, scr.length === 1 && scr[0].map(b => b.op).join() === 'event_whenflagclicked,motion_movesteps', scr);
      const x0 = await fr.evaluate(n => WLStudio.vm.runtime.getSpriteTargetByName(n).x, sprite);
      await fr.locator('img[class*="green-flag"]').first().tap(); await sleep(900);
      const x1 = await fr.evaluate(n => WLStudio.vm.runtime.getSpriteTargetByName(n).x, sprite);
      check(`[${tag}] tapping the green flag runs it`, Math.round(x1 - x0) === 10, `${x0} -> ${x1}`);
      // AI turn: lock, then the reply's program
      await fr.tap('#wl-tool-chat'); await sleep(400);
      await pg.tap('.wl-smode button[data-m=ai]'); await sleep(200);
      const n0 = await blockCount(fr); let lockedSeen = false;
      const t = await turn(pg, async () => {
        await pg.fill('#chin', '我想佢一直行'); await pg.press('#chin', 'Enter');
        await sleep(300); lockedSeen = await fr.evaluate(() => document.body.classList.contains('wl-locked'));
      });
      await wait(pg, () => !document.querySelector('#wlbody .msg.wait'), 60);
      const un = await wait(fr, () => !document.body.classList.contains('wl-locked'), 40);
      const live = await fr.evaluate(() => WLStudio.program());
      check(`[${tag}] AI turn locks the editor, then unlocks`, lockedSeen && un !== null, { locked: lockedSeen, unlock_s: un });
      check(`[${tag}] end state = the reply's program`, t.rep.ok && JSON.stringify(live) === JSON.stringify(t.rep.program), (t.rep.say || t.rep.reason || '').slice(0, 80));
      check(`[${tag}] request carries mode ai + studio fields`, t.body && t.body.mode === 'ai' && t.body.studio && t.body.studio.text && t.body.studio.hand_edits, t.body && t.body.studio && t.body.studio.hand_edits);
      await pg.screenshot({ path: path.join(SHOTS, `${tag}-03-after-ai-turn.png`) });
      // 我自己砌 + 請助教看看
      await pg.tap('.wl-smode button[data-m=self]'); await sleep(300);
      const before = JSON.stringify(await fr.evaluate(() => WLStudio.program()));
      const r2 = await turn(pg, async () => { await pg.tap('.wl-tabtn'); });
      await wait(pg, () => !document.querySelector('#wlbody .msg.wait'), 60); await sleep(500);
      check(`[${tag}] 請助教看看: kind review, mode self, ops [] and the program unchanged`, r2.body && r2.body.kind === 'review' && r2.body.mode === 'self' && r2.rep.ok
        && Array.isArray(r2.rep.ops) && !r2.rep.ops.length && JSON.stringify(await fr.evaluate(() => WLStudio.program())) === before, (r2.rep.say || r2.rep.reason || '').slice(0, 100));
      await pg.screenshot({ path: path.join(SHOTS, `${tag}-04-review.png`) });
      check(`[${tag}] no page errors`, !errors.length, errors.slice(0, 3));
      check(`[${tag}] no request outside the site`, !ext.length, ext.slice(0, 3));
    } catch (e) {
      check(`[${tag}] flow ran to the end`, false, String(e && e.message || e).slice(0, 300));
      try { await pg.screenshot({ path: path.join(SHOTS, `${tag}-error.png`) }); } catch (x) {}
    }
    await ctx.close();
  }
  await br.close();
  const s = { checks: R.length, failed: R.filter(x => !x.ok).length };
  fs.mkdirSync(path.join(ROOT, 'test', 'out'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'test', 'out', 'dual_webkit_' + (/:8922|:892\d/.test(BASE) ? 'stub' : 'staging') + '.json'), JSON.stringify({ summary: s, base: BASE, results: R }, null, 1));
  console.log('SUMMARY', JSON.stringify(s));
  process.exit(s.failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
