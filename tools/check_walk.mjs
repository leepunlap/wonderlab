/*!
 * Wonder Lab Studio — run `_walk-check.html` in real time and print what it said.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHY THIS IS NOT IN check_pages.mjs
 * That runner reads the page with `--virtual-time-budget --dump-dom`, and virtual time charges a
 * rendered frame for every virtual second until the budget runs out — a step that runs a program on
 * the stage costs about a second of real time per virtual second, so a page that reaches its result
 * in twenty seconds takes twenty minutes to be read. This runner launches Chrome without a virtual
 * clock, lets the page run at its own pace, and has the page post its result home.
 *
 * So this is the one browser check that is not part of `npm run check:pages`; run it whenever a step
 * is supposed to make something move:
 *
 *     WL_LIBRARY=/path/to/local-lab/lab-library python3 server/studio_server.py --port 8920
 *     npm run check:walk
 *     npm run check:walk -- basics/b1     # another step through the same harness
 *
 * ES module, node 18+.
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = process.env.WL_PORT || '8920';
const STEP = process.argv[2] || 'basics/b2';
/* Generous, because the page waits for things to happen rather than for the clock, and because a
   software renderer draws every frame of a two-second glide. Failing here should mean the step is
   broken, not that the machine is busy. */
const CAP = Number(process.env.WL_WALK_CAP || 180000);

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].find(existsSync);

if (!CHROME) {
  console.error('找不到 Chrome：把路徑加進 tools/check_walk.mjs 的 CHROME。');
  process.exit(1);
}

let deliver;
const received = new Promise((resolve) => { deliver = resolve; });

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
    res.end('ok');
    deliver(body);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const post = server.address().port;

const url = `http://127.0.0.1:${PORT}/_walk-check.html?step=${STEP}&post=${post}`;
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--no-proxy-server', '--window-size=1440,900',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'wl-walk-')),
  '--no-first-run', '--no-default-browser-check', url
], { stdio: 'ignore' });

function stop() {
  try { chrome.kill('SIGTERM'); } catch (e) { /* already gone */ }
}

let text = null;
try {
  text = await Promise.race([
    received,
    new Promise((_, reject) => setTimeout(
      () => reject(new Error('the page never reported: no RESULT in ' + CAP + 'ms')), CAP))
  ]);
} catch (e) {
  stop();
  server.close();
  console.error(`✗ 講到郁，畫面就真係郁  (${STEP})`);
  console.error('    ' + e.message);
  console.error('    伺服器在 ' + PORT + ' 嗎？WL_LIBRARY 設了嗎？');
  process.exit(1);
}
stop();
server.close();

const body = text.trim();
const pass = /RESULT PASS/.test(body);
console.log(`${pass ? '✓' : '✗'} 講到郁，畫面就真係郁  (${STEP})`);
console.log(body.split('\n').map((l) => '    ' + l).join('\n'));
process.exit(pass ? 0 : 1);
