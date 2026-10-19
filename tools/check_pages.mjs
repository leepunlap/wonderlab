/*!
 * Wonder Lab Studio — run the two browser self-tests and print what they said.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS IS
 * `_drive-check.html` and `_mode-check.html` load the real page in a frame, press the real buttons
 * and print one line: RESULT PASS or RESULT FAIL. This is the runner, so the checks are one command
 * and not a paragraph of Chrome flags nobody will remember.
 *
 * It does NOT start the studio server: the server needs WL_LIBRARY (the sprite library is not in
 * this checkout) and a port that is already free, and guessing either would turn a missing library
 * into a mysterious "the editor never booted". Start it yourself first:
 *
 *     WL_LIBRARY=/path/to/local-lab/lab-library python3 server/studio_server.py --port 8920
 *     npm run check:pages
 *
 * ES module, node 18+: it is a developer tool, not something the browser loads.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);

const PORT = process.env.WL_PORT || '8920';
const PAGES = [
  { file: '_drive-check.html', out: 'wl-drive-out', what: '由零開始 的匯入示範' },
  { file: '_mode-check.html', out: 'wl-mode-out', what: '新手 / 熟手 的步數' }
];

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].find(existsSync);

function die(msg) {
  console.error(msg);
  process.exit(1);
}

if (!CHROME) die('找不到 Chrome：把路徑加進 tools/check_pages.mjs 的 CHROME。');

async function dump(file) {
  const url = `http://127.0.0.1:${PORT}/${file}`;
  const { stdout } = await run(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--noproxy-server',
    '--virtual-time-budget=900000', '--dump-dom', url
  ], { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

(async function main() {
  let failed = 0;
  for (const p of PAGES) {
    let html;
    try {
      html = await dump(p.file);
    } catch (e) {
      console.error(`✗ ${p.what} — 開不到 ${p.file}（伺服器在 ${PORT} 嗎？）: ${e.message}`);
      failed++;
      continue;
    }
    const m = new RegExp(`<pre id="${p.out}"[^>]*>([\\s\\S]*?)</pre>`).exec(html);
    const text = m ? m[1].replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').trim() : '';
    const pass = /RESULT PASS/.test(text);
    console.log(`${pass ? '✓' : '✗'} ${p.what}  (${p.file})`);
    console.log(text.split('\n').map((l) => '    ' + l).join('\n'));
    if (!pass) failed++;
  }
  process.exit(failed ? 1 : 0);
}());
