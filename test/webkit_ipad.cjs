#!/usr/bin/env node
// Wonder Lab Studio in Playwright WebKit (Safari's engine) with an iPad profile at 1024x768. Not a real iPad.
//   node test/webkit_ipad.cjs [http://127.0.0.1:8920]      (uses the Node "playwright" package found up the tree)
'use strict';
const path = require('path'), fs = require('fs');
const { webkit, devices } = require('playwright');
const ROOT = path.dirname(__dirname), BASE = process.argv[2] || 'http://127.0.0.1:8920';
(async () => {
  const out = { errors: [] };
  const dev = Object.assign({}, devices['iPad (gen 7) landscape'], { viewport: { width: 1024, height: 768 } });
  const br = await webkit.launch();
  const ctx = await br.newContext(dev);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => out.errors.push(String(e).slice(0, 300)));
  pg.on('console', m => { if (m.type() === 'error') out.errors.push(m.text().slice(0, 300)); });
  const t0 = Date.now();
  await pg.goto(BASE + '/');
  await pg.waitForSelector('html[data-wl-ready="1"]', { timeout: 120000 });
  out.ready_s = +((Date.now() - t0) / 1000).toFixed(2);
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: path.join(ROOT, 'shots', '11-webkit-ipad-1024x768.png') });
  await pg.tap('#wl-fab'); await pg.waitForTimeout(400);
  await pg.fill('#wl-input', '角色一直走'); await pg.tap('#wl-send');
  await pg.waitForFunction(() => !WLStudio.busy && WLStudio.versions.length >= 2, null, { timeout: 30000 });
  await pg.waitForTimeout(800);
  await pg.tap('#wl-close'); await pg.waitForTimeout(500);
  out.blocks_in_workspace = await pg.evaluate(() => WLStudio.workspace().getAllBlocks(false).filter(b => !b.isShadow()).length);
  await pg.tap('[aria-label="開始執行"]'); await pg.waitForTimeout(1200);
  out.sprite_x_after_run = await pg.evaluate(() => Math.round(WLStudio.vm.runtime.targets[1].x));
  await pg.tap('[aria-label="停止執行"]'); await pg.waitForTimeout(300);
  out.run_report = await pg.evaluate(() => WLStudio.trace.report(WLStudio.snapshotNow().program));
  await pg.screenshot({ path: path.join(ROOT, 'shots', '12-webkit-ipad-after-ai-run-1024x768.png') });
  out.no_hscroll = await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  out.user_agent = await pg.evaluate(() => navigator.userAgent);
  await br.close();
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(ROOT, 'test', 'out', 'webkit_ipad.json'), JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
