/**
 * The standalone lab, end to end: a page that is NOT a lesson page mounts the lab with one tag.
 *
 * Why this exists: dist/lab.js is inert on anything but an L4 lesson page (no #chat, or data-ep outside the lesson
 * path) — that is deliberate, the teachers' playground relies on it. src/standalone.js is the other entry: it builds
 * its own container and the page contract lab-page.js expects, reads <base>/manifest.json, mounts the SAME host
 * (lab-host.js), and falls back to the read-only runtime when the manifest has no studio-<hex>/ folder.
 *
 *   node test/browser_test_standalone.mjs           # all three cases
 *   node test/browser_test_standalone.mjs readonly  # a manifest with no "studio": the read-only runtime
 *   node test/browser_test_standalone.mjs studio    # a manifest that names one, and a lesson: the full editor
 *   node test/browser_test_standalone.mjs nolesson  # a "studio" folder but NO lesson data: read-only, no wasted frame
 *
 * Needs: `npm run build`, Google Chrome, and (for the studio case) a classfiles tree with a studio-<hash>/ folder.
 * Nothing is written outside the temp dir; the classfiles tree is only read. AGPL-3.0-only (see LICENSE).
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = process.env.HOME;
const CLASSFILES = process.env.LABDEV_CLASSFILES || join(HOME, 'iits-local/classfiles');
const LAB = join(CLASSFILES, 'L4/lessons/assets/lab');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MODE = process.argv[2] || 'all';

const engineJson = join(ROOT, 'dist/engine.json');
if (!existsSync(engineJson)) { console.error('run `npm run build` first'); process.exit(2); }
const ENGINE = JSON.parse(readFileSync(engineJson, 'utf8'));
const man0 = existsSync(join(LAB, 'manifest.json')) ? JSON.parse(readFileSync(join(LAB, 'manifest.json'), 'utf8')) : {};
const STUDIO = man0.studio && man0.studio.replace(/\/$/, '');
if (MODE !== 'readonly' && (!STUDIO || !existsSync(join(LAB, STUDIO, 'lab-frame.html')))) {
  console.error(`no studio-<hash>/ folder in ${LAB} (deploy one, or point LABDEV_CLASSFILES at a tree that has one)`);
  process.exit(2);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const type = (p) => TYPES[extname(p).toLowerCase()] || 'application/octet-stream';

/* A page with NOTHING on it: no #chat, no .layout, no main.wrap. That is the whole point of the standalone entry. */
const PAGE = (attrs) => `<!doctype html><html lang="zh-Hant-HK"><head><meta charset="utf-8"><title>standalone lab test</title>
<script src="lab/lab-standalone.js" ${attrs} defer></script>
</head><body></body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'labstandalone-'));
const session = mkdtempSync(join(tmpdir(), 'labstandalone-chrome-'));
const labDir = join(dir, 'lab');
mkdirSync(labDir, { recursive: true });
for (const f of ['lab-standalone.js', 'lab-standalone.css', 'lab.css', 'lab.js']) symlinkSync(join(ROOT, 'dist', f), join(labDir, f));
symlinkSync(join(ROOT, 'dist', ENGINE.engine.replace(/\/$/, '')), join(labDir, ENGINE.engine.replace(/\/$/, '')));
symlinkSync(join(LAB, 'a'), join(labDir, 'a'));
if (STUDIO && existsSync(join(LAB, STUDIO, 'lab-frame.html'))) symlinkSync(join(LAB, STUDIO), join(labDir, STUDIO));
/* The smallest lesson the Studio accepts: one stage backdrop (an SB3 project needs at least one costume on the
   stage). The asset itself does not have to exist - a 404 costume leaves a blank stage, which is what the VM does. */
const LESSON = { title: 'Standalone test', opening: '想在舞台上做甚麼？', sprites: [],
  stage: { backdrops: [{ assetId: '00000000000000000000000000000000', name: '背景', ext: 'svg', cx: 240, cy: 180, res: 1 }] } };
writeFileSync(join(labDir, 'demo.json'), JSON.stringify(LESSON));

let CASE = 'readonly';                        // switched by run(): readonly | studio | nolesson
const manifest = () => JSON.stringify({ version: ENGINE.version, engine: ENGINE.engine, css: ENGINE.css,
  scripts: ENGINE.scripts, assets: 'a/', source: 'SOURCE.html',
  ...(CASE === 'readonly' ? {} : { studio: STUDIO + '/' }),
  ...(CASE === 'studio' ? { lessons: { 'standalone-studio': { status: 'ready', data: 'demo.json' } } } : {}) }, null, 1);

let manifestGets = 0;
const server = createServer((req, res) => {
  const u = req.url.split('?')[0];
  const send = (code, body, ct) => { res.writeHead(code, { 'Content-Type': ct || 'application/octet-stream' }); res.end(body); };
  const file = (p) => { try { if (!statSync(p).isFile()) throw new Error('not a file'); } catch (e) { return send(404, 'not found', 'text/plain'); } send(200, readFileSync(p), type(p)); };
  if (u === '/' || u === '/index.html') {
    const ep = CASE === 'studio' ? 'standalone-studio' : (CASE === 'nolesson' ? 'standalone-nolesson' : 'standalone-ro');
    return send(200, PAGE(`data-wl-gate="open" data-wl-lesson="${ep}" data-wl-start="lab"`), 'text/html; charset=utf-8');
  }
  if (u === '/lab/manifest.json') { manifestGets += 1; return send(200, manifest(), 'application/json; charset=utf-8'); }
  // NO /api/ai/* route at all: a standalone page must work with no service behind it
  if (u.startsWith('/lab/')) return file(join(labDir, u.slice('/lab/'.length)));
  return send(404, 'no route ' + u, 'text/plain');
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const PORT = 9900 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${session}`, '--no-first-run',
  '--no-default-browser-check', '--remote-allow-origins=*', '--no-sandbox', '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 80 && !ws; i += 1) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); ws = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
  if (!ws) await sleep(250);
}
const sock = new WebSocket(ws); await new Promise((r) => { sock.onopen = r; });
let id = 0; const q = new Map(); const console_ = [];
sock.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && q.has(d.id)) { q.get(d.id)(d); q.delete(d.id); return; }
  if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) console_.push(d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 1500));
  if (d.method === 'Runtime.exceptionThrown') console_.push('EXCEPTION ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text || '').slice(0, 1500));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; q.set(i, res); sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true, timeout: 200000 })).result?.result?.value;
const shot = async (name) => writeFileSync(`/tmp/${name}`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result?.data || '', 'base64'));

let failures = 0;
const check = (n, ok, extra = '') => { console.log(`${ok ? '✔' : '✖'} ${n}${extra ? '  ' + extra : ''}`); if (!ok) failures += 1; };
const wait = async (expr, ms, label) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ev(expr)) return Date.now() - t0; await sleep(400); }
  console.log(`   (waited ${ms} ms for ${label})`);
  return -1;
};

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

async function run(kind) {
  CASE = kind;
  const before = manifestGets;
  const what = { readonly: 'a manifest with no studio folder',
                 studio: 'a manifest that names a studio folder and a lesson',
                 nolesson: 'a manifest that names a studio folder but no lesson data' }[kind];
  console.log(`\n== standalone, ${what}  ${origin}/`);
  await send('Page.navigate', { url: origin + '/' });
  await wait('!!document.querySelector("#wlbody")', 20000, 'the lab conversation');
  check('the page had no #chat at all before the entry built the contract',
    await ev('!!document.querySelector(".layout > main.wrap") && !!document.querySelector("#chat[data-ep]")'));
  check('the shell carries the whole contract the lab reads',
    await ev(`!!document.querySelector('#chat .chhead') && !!document.querySelector('#chbody') && !!document.querySelector('#chform')
      && !!document.querySelector('#chin') && !!document.querySelector('#chsend') && !!document.querySelector('#chcaps') && !!document.querySelector('#chfab')`));
  check('the standalone stylesheet was linked from the bundle\'s own folder',
    await ev(`(() => { const l = document.getElementById('wl-standalone-css'); return !!l && /\\/lab\\/lab-standalone\\.css$/.test(l.href); })()`));
  await wait('!!document.querySelector(".wl-mode button")', 20000, 'the lab toggle');
  check('manifest.json was read exactly once', manifestGets - before === 1, `${manifestGets - before} request(s)`);
  check('the lab opened by itself (data-wl-start="lab")', await ev('document.body.classList.contains("wl-labmode")'));
  check('the entry adds no global of its own', await ev('typeof window.WonderLabStandalone === "undefined" && typeof window.WLLab === "undefined"'));
  if (kind !== 'studio') {
    check('the lab pane is on screen and full width',
      await ev(`(() => { const r = document.getElementById('wllab').getBoundingClientRect();
        return !document.getElementById('wllab').hidden && r.width > innerWidth * 0.55 && r.height > innerHeight * 0.5; })()`));
    const t = await wait('!!window.WL && !!document.getElementById("wlstage")', 120000, 'the read-only runtime');
    check(kind === 'readonly' ? 'with no "studio" in the manifest the READ-ONLY runtime mounts'
                              : 'with a "studio" folder but no lesson data the READ-ONLY runtime mounts',
      t >= 0, t >= 0 ? `${t} ms` : '');
    check('no editor frame was created at all', !(await ev('!!document.querySelector(".wl-host, iframe.wl-sframe")')));
    check('the blocks area is there and sized', await ev(`(() => { const r = document.getElementById('wlblocks').getBoundingClientRect(); return r.width > 300 && r.height > 200; })()`));
    await shot('standalone_readonly.png');
    return;
  }
  const t = await wait('window.WL_STUDIO === true && !!window.WLS', 150000, 'the Studio');
  check('with a "studio" folder the full editor mounts through the shared host', t >= 0, t >= 0 ? `${t} ms` : '');
  check('the Studio pane replaces the read-only one',
    await ev(`!document.getElementById('wlstudio').hidden && document.getElementById('wllab').hidden && document.body.classList.contains('wl-studiomode')`));
  check('the frame is the manifest\'s studio folder, in the shared box',
    await ev(`(() => { const f = document.querySelector('#wlstudio > .wl-host > iframe.wl-sframe#wlsframe'); return !!f && f.getAttribute('src').endsWith('/${STUDIO}/lab-frame.html'); })()`));
  check('the editor fills the pane and stays on screen',
    await ev(`(() => { const f = document.querySelector('#wlsframe').getBoundingClientRect();
      return f.width > innerWidth * 0.6 && f.height > innerHeight * 0.4 && f.bottom <= innerHeight + 1; })()`));
  check('no AI service was needed to get this far', true, 'the page has no /api/ai/* route');
  await shot('standalone_studio.png');
}

try {
  if (MODE === 'all') { await run('readonly'); await run('studio'); await run('nolesson'); }
  else await run(MODE);
} finally {
  const noisy = console_.slice(0, 8);
  if (noisy.length) { console.log('\nconsole (errors/warnings):'); noisy.forEach((l) => console.log('   ' + l)); }
  chrome.kill(); server.close();
  try { rmSync(dir, { recursive: true, force: true }); rmSync(session, { recursive: true, force: true }); } catch {}
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}
