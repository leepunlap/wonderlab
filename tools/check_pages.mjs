/*!
 * Wonder Lab Studio — run the two browser self-tests and print what they said.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS IS
 * `_drive-check.html`, `_mode-check.html`, `_library-check.html`, `_import-check.html`,
 * `_sync-check.html`, `_grow-check.html`, `_region-check.html`,
 * `_pace-check.html` and `_voice-sheet.html` load the
 * real page in a frame, press the real buttons and print one line: RESULT PASS or RESULT FAIL. This
 * is the runner, so the checks are one command and not a paragraph of Chrome flags nobody will
 * remember.
 *
 * The one check that is not here is `_walk-check.html`: it runs a program on the stage, which on a
 * virtual clock costs tens of minutes to read. `npm run check:walk` runs it in real time instead.
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
  { file: '_mode-check.html', out: 'wl-mode-out', what: '新手 / 熟手 的步數' },
  { file: '_library-check.html', out: 'wl-lib-out', what: '角色庫 的縮圖' },
  { file: '_import-check.html', out: 'wl-import-out', what: '指着加號、走進角色庫' },
  { file: '_sync-check.html', out: 'wl-sync-out', what: '畫面跟着旁白的句子走' },
  { file: '_grow-check.html', out: 'wl-grow-out', what: '程式跟住句子一齊長' },
  /* `_walk-check.html` is deliberately not here. It runs a program on the stage, and a running VM is
     the most expensive thing a software renderer can draw: on this runner's virtual clock the page
     takes tens of minutes to be read, whatever it found. `npm run check:walk` runs the same page in
     real time and is a matter of seconds. */
  { file: '_region-check.html', out: 'wl-region-out', what: '指着嘅嘢真係喺畫面度' },
  /* 800x600, the size it was written for: this is the one page that measures milliseconds, and a
     headless browser measures them on a virtual clock that the software renderer inflates with every
     frame it draws — at 1440x900 the same step reads 42s slower, which is SwiftShader, not pacing.
     The arithmetic that decides whether a step fits its narration is tools/check_pace.mjs, in
     npm run check; this page answers "is the shape right". */
  { file: '_pace-check.html', out: 'wl-pace-out', what: '示範趕得上旁白的時間', size: '800,600' },
  { file: '_voice-sheet.html', out: 'wl-voice-out', what: '每句旁白 都有錄音' }
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

async function dump(file, size) {
  const url = `http://127.0.0.1:${PORT}/${file}`;
  /* No --disable-gpu: the editor refuses to draw without WebGL and puts a dialog over the gui, which
     then swallows the clicks these checks are made of. SwiftShader is the software renderer. */
  /* --no-proxy-server: a shell that exports HTTP_PROXY makes Chrome send 127.0.0.1 to the proxy, and
     the page then never loads — which reads exactly like "the editor never booted". The studio is
     local; nothing here needs to leave the machine.
     --window-size: headless defaults to 800x600, narrower than the editor's own minimum layout, and
     at that width the add-sprite button is off the right edge — a step about pressing it then has
     nothing to point at, which is a window too small, not a guide that is wrong. */
  const { stdout } = await run(CHROME, [
    '--headless=new', '--no-sandbox', '--no-proxy-server', '--window-size=' + (size || '1440,900'),
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--virtual-time-budget=900000', '--dump-dom', url
  ], { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

(async function main() {
  let failed = 0;
  for (const p of PAGES) {
    let html;
    try {
      html = await dump(p.file, p.size);
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
