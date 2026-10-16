/**
 * The lab host, end to end: BOTH surfaces that mount the Studio must mount it through src/lab-host.js.
 *
 * Why this exists: the lesson lab and the teachers' playground each grew their own copy of "fetch the manifest,
 * build the iframe, wait, call WLStudio.boot()", and they drifted (the playground's copy froze at an older
 * behaviour more than once). src/lab-host.js is now the only copy; this renders both pages against a real built
 * lab and a real studio-<hex>/ folder and checks the one thing that matters - that the editor mounts, through the
 * shared host, in the shared box, in both.
 *
 *   node test/browser_test_labhost.mjs             # lesson lab + playground
 *   node test/browser_test_labhost.mjs lesson      # only the L4 lesson page (assets/lab/lab.js)
 *   node test/browser_test_labhost.mjs playground  # only portals/teachers/index.html
 *   LABDEV_RO=1 node test/browser_test_labhost.mjs lab-ro      # lab GET studio:false -> the read-only lab
 *   LABDEV_BADSTUDIO=1 node test/browser_test_labhost.mjs bad-studio   # manifest names a folder that is not there
 *   LABDEV_NOHOSTJS=1 node test/browser_test_labhost.mjs playground    # a deploy without lab-host.js: lab.js carries it
 *   LABDEV_W=1100 LABDEV_H=800 node test/browser_test_labhost.mjs lesson   # the <=1279 px edge-to-edge editor
 *
 * Needs: `npm run build` in this repo, Google Chrome, and a lab tree that has a studio folder - a local classfiles
 * copy (LABDEV_CLASSFILES) or a deployed one. Nothing is written outside the temp dir; the classfiles tree is only
 * read. Node 22 (global WebSocket). AGPL-3.0-only (see LICENSE).
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
const PORTAL = process.env.LABDEV_PORTAL || join(HOME, 'iits-local/src/iits-repo/portals/teachers/index.html');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LIB = join(CLASSFILES, '_library');
const LAB = join(CLASSFILES, 'L4/lessons/assets/lab');
const SLUG = '501-bp01';
const MODE = process.argv[2] || 'all';

const engineJson = join(ROOT, 'dist/engine.json');
if (!existsSync(engineJson)) { console.error('run `npm run build` first'); process.exit(2); }
const ENGINE = JSON.parse(readFileSync(engineJson, 'utf8'));
const man0 = existsSync(join(LAB, 'manifest.json')) ? JSON.parse(readFileSync(join(LAB, 'manifest.json'), 'utf8')) : {};
const BAD = process.env.LABDEV_BADSTUDIO === '1';
// a valid-shaped content hash whose folder is not deployed: what a release with a missing studio folder looks like
const STUDIO = BAD ? 'studio-0000000000' : (man0.studio && man0.studio.replace(/\/$/, ''));
if (!STUDIO || (!BAD && !existsSync(join(LAB, STUDIO, 'lab-frame.html')))) {
  console.error(`no studio-<hash>/ folder in ${LAB} (deploy one, or point LABDEV_CLASSFILES at a tree that has one)`);
  process.exit(2);
}
console.log(`lab: ${ROOT}/dist  studio: ${STUDIO}  classfiles: ${CLASSFILES}`);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const type = (p) => TYPES[extname(p).toLowerCase()] || 'application/octet-stream';

/* A lesson page with just what lab.js looks for: the AI pane it injects the toggle into, and a lesson body. */
const LESSON_HTML = `<!doctype html><html lang="zh-Hant-HK"><head><meta charset="utf-8"><title>lab host test</title>
<style>html,body{margin:0;height:100%}body{display:flex;flex-direction:column;font:14px system-ui}
.lessonbar{flex:none;height:40px;background:#eef1f8}
.layout{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 380px}
main.wrap{min-width:0;overflow:auto;padding:12px}
.chat{display:flex;flex-direction:column;border-left:1px solid #e5e8f0;min-height:0}
.chbody{flex:1;overflow:auto}.chform{flex:none;display:flex;gap:6px;padding:8px}#chin{flex:1}.chfab{display:none}</style></head>
<body>
<div class="lessonbar">Lesson bar</div>
<div class="layout">
  <main class="wrap"><h1>Lesson body</h1></main>
  <aside class="chat" id="chat" data-ep="/files/L4/lessons/${SLUG}">
    <div class="chhead"><b>AI 學伴</b><small>課堂教材</small><button type="button" class="chclose">×</button></div>
    <div class="chcaps" id="chcaps"><div class="cpclass">課堂中</div></div>
    <div class="chbody" id="chbody"></div>
    <form class="chform" id="chform"><textarea id="chin" placeholder="輸入你的問題…"></textarea><button id="chsend">問</button></form>
    <div class="chfab" id="chfab">問 AI 學伴</div>
  </aside>
</div>
<script src="assets/lab/lab.js?v=test" defer></script>
</body></html>`;

/* ---- the tree that is served: this repo's dist/, the classfiles studio + assets, the portal page ---- */
const dir = mkdtempSync(join(tmpdir(), 'labhost-'));
const session = mkdtempSync(join(tmpdir(), 'labhost-chrome-'));
writeFileSync(join(dir, 'lesson.html'), LESSON_HTML);
const labDir = join(dir, 'assets/lab');
mkdirSync(labDir, { recursive: true });
for (const f of ['lab.js', 'lab-host.js', 'lab.css']) symlinkSync(join(ROOT, 'dist', f), join(labDir, f));
symlinkSync(join(ROOT, 'dist', ENGINE.engine.replace(/\/$/, '')), join(labDir, ENGINE.engine.replace(/\/$/, '')));
if (!BAD) symlinkSync(join(LAB, STUDIO), join(labDir, STUDIO));
symlinkSync(join(LAB, 'a'), join(labDir, 'a'));
symlinkSync(join(LAB, `${SLUG}.json`), join(labDir, `${SLUG}.json`));
// like a deploy: the engine's own version, and the studio folder the manifest names
const manifest = (studio) => JSON.stringify({ version: ENGINE.version, engine: ENGINE.engine, css: ENGINE.css, scripts: ENGINE.scripts,
  assets: 'a/', source: 'SOURCE.html', lessons: { [SLUG]: { status: 'ready', data: `${SLUG}.json?v=x` } },
  ...(studio ? { studio: STUDIO + '/' } : {}) }, null, 1);

let labGets = 0, playgroundTurns = [];
const server = createServer((req, res) => {
  const u = req.url.split('?')[0];
  const send = (code, body, ct) => { res.writeHead(code, { 'Content-Type': ct || 'application/octet-stream' }); res.end(body); };
  // a 404 the way nginx serves one: a short HTML page with no scripts in it (that is what a missing studio folder
  // looks like to the host, and what makes it give up at once instead of waiting the timeout out)
  const notFound = () => send(404, '<html><head><title>404 Not Found</title></head><body><center><h1>404 Not Found</h1></center></body></html>', 'text/html; charset=utf-8');
  const file = (p) => { try { if (!statSync(p).isFile()) return notFound(); } catch (e) { return notFound(); } send(200, readFileSync(p), type(p)); };
  // the two APIs (stubbed: no AI, no caps) and the login the portal insists on
  if (u.startsWith('/api/ai/lab/playground')) {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
      playgroundTurns.push(b);
      send(200, JSON.stringify({ ok: true, model: 'stub', ms: 12, say: '好，我幫你砌。', question: '', ops: [] }), 'application/json');
    });
    return;
  }
  if (u.startsWith('/api/ai/lab/')) { labGets += 1; return send(200, JSON.stringify({ ok: true, studio: process.env.LABDEV_RO !== '1', modes: ['ai', 'self'], program: null, consol: { state: 'off' } }), 'application/json'); }
  if (u.startsWith('/api/ai/status/')) return send(200, JSON.stringify({ ok: true, in_class: true, reason: '' }), 'application/json');
  if (u.startsWith('/api/me')) return send(200, JSON.stringify({ ok: true, name: 'Lab host test', admin: true, levels: ['L4'] }), 'application/json');
  if (u.startsWith('/api/reg/')) return send(200, JSON.stringify({ ok: true, levels: { L4: '四級' }, classes: [], teachers: [] }), 'application/json');
  if (u.startsWith('/api/ai/')) return send(200, JSON.stringify({ ok: true, say: '', ops: [] }), 'application/json');
  if (u === '/' || u === '/index.html') return send(200, readFileSync(PORTAL, 'utf8'), 'text/html; charset=utf-8');
  if (u === '/lesson.html') return file(join(dir, 'lesson.html'));
  // the playground's <meta name="wl-lab-base"> uses the deployed /files/ path; the lesson page loads assets/lab/
  if (u === '/assets/lab/manifest.json' || u === '/files/L4/lessons/assets/lab/manifest.json') return send(200, manifest(process.env.LABDEV_RO !== '1'), 'application/json; charset=utf-8');
  if (u.endsWith('/lab-host.js') && process.env.LABDEV_NOHOSTJS === '1') return notFound();   // a deploy that predates it
  for (const pre of ['/assets/lab/', '/files/L4/lessons/assets/lab/']) if (u.startsWith(pre)) return file(join(labDir, u.slice(pre.length)));
  if (u.startsWith('/lab-library/')) return file(join(LIB, u.slice('/lab-library/'.length)));
  return send(404, 'no route ' + u);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;

/* ---- headless Chrome over CDP, the approach of lab-device/browser_test*.mjs ---- */
const PORT = 9500 + Math.floor(Math.random() * 400);
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
  if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) console_.push(d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  if (d.method === 'Runtime.exceptionThrown') console_.push('EXCEPTION ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text || '').slice(0, 200));
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
const VW = +(process.env.LABDEV_W || 1440), VH = +(process.env.LABDEV_H || 900);
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
// What does a page hand WLStudio.boot()? Wrap the host as soon as it defines itself, then wrap the studio's boot
// on the host's 'ready' event - which fires inside mount(), before the caller's boot() can run.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  let api;
  Object.defineProperty(window, 'WonderLabHost', { configurable: true, get() { return api; }, set(v) {
    api = v;
    window.__hostScript = (document.currentScript || {}).src || '';   // which file carried the host
    const create = v.create;
    v.create = function (o) {
      const h = create(o);
      h.on('ready', () => {
        window.__hostBox = !!document.querySelector('.wl-host > iframe.wl-sframe');
        try { const W = h.frame.contentWindow.WLStudio, ob = W.boot;
              W.boot = function (c) { window.__studioCfg = c; return ob.call(W, c); }; } catch (e) {}
      });
      return h;
    };
  } });
})();` });

/* ================================ the lesson page ================================ */
async function lesson() {
  const ro = process.env.LABDEV_RO === '1';
  console.log(`\n== L4 lesson lab (${ro ? 'lab GET studio:false -> read-only' : 'lab GET studio:true'}) ${origin}/lesson.html`);
  await send('Page.navigate', { url: origin + '/lesson.html' });
  await wait('!!document.querySelector(".wl-mode button")', 20000, 'the lab toggle');
  check('lab.js read the manifest and built the toggle', await ev('document.querySelectorAll(".wl-mode button").length === 2'));
  await wait('[...document.querySelectorAll(".wl-mode button")][1] && ![...document.querySelectorAll(".wl-mode button")][1].disabled', 20000, 'an enabled toggle');
  await ev(`[...document.querySelectorAll('.wl-mode button')][1].click()`);
  if (ro) {
    const t = await wait('!!window.WL && !!document.getElementById("wllab") && !document.getElementById("wllab").hidden', 120000, 'the read-only lab');
    check('the read-only lab still boots (no Studio involved)', t >= 0, t >= 0 ? `${t} ms` : '');
    check('no studio frame was created', !(await ev('!!document.querySelector(".wl-host, .wl-sframe")')));
    await shot('labhost_readonly.png');
    return;
  }
  const t = await wait('!!window.WLS && window.WL_STUDIO === true', 150000, 'the Studio');
  check('the lesson page mounts the Studio (window.WL_STUDIO / window.WLS)', t >= 0, t >= 0 ? `${t} ms` : '');
  check('the host built the shared box and frame in #wlstudio', await ev('!!document.querySelector("#wlstudio > .wl-host > iframe.wl-sframe#wlsframe")'));
  check('the frame is the manifest\'s studio folder', await ev(`document.querySelector('#wlsframe').getAttribute('src').endsWith('/${STUDIO}/lab-frame.html')`));
  check('WLStudio.boot() resolved and the editor answers', await ev('typeof window.WLS.program === "function" && !!window.WLS.program()'));
  check('the shared loading overlay is hidden once booted', await ev('document.querySelector("#wlstudio > .wl-host > .wl-sload").hidden'));
  const cfg = JSON.parse(await ev('JSON.stringify(window.__studioCfg || null)') || 'null') || {};
  check('the lesson itself reached WLStudio.boot()', await ev('!!window.__studioCfg && typeof window.__studioCfg.lesson === "object" && typeof window.__studioCfg.onEvent === "function"'),
    cfg.lesson ? cfg.lesson.slug : '');
  check('assetBase is derived from the manifest, not hardcoded', typeof cfg.assetBase === 'string' && cfg.assetBase.endsWith('/assets/lab/a/'), String(cfg.assetBase));
  const g = JSON.parse(await ev(`JSON.stringify((() => { const f=document.querySelector('#wlsframe').getBoundingClientRect();
    return { vh: innerHeight, w: Math.round(f.width), h: Math.round(f.height), b: Math.round(f.bottom) }; })())`));
  check('the editor fills the Studio pane and stays on screen', g.w > VW * 0.6 && g.h > VH * 0.4 && g.b <= g.vh + 1, `${g.w}x${g.h}, bottom ${g.b} of ${g.vh}`);
  check('the lesson body is still there behind the lab', await ev('!!document.querySelector("main.wrap h1")'));
  await shot('labhost_lesson.png');
}

/* ================================ the playground ================================ */
async function playground() {
  console.log(`\n== teachers' playground ${origin}/#playground`);
  await send('Page.navigate', { url: origin + '/index.html#playground' });
  await wait('!!document.querySelector(".pg-wrap")', 20000, '.pg-wrap');
  check('the playground view renders', await ev('!!document.querySelector(".pg-wrap")'));
  const t = await wait('typeof PG !== "undefined" && !!PG.host && !!PG.W', 150000, 'the Studio');
  check('the playground mounts the Studio through the shared host', t >= 0, t >= 0 ? `${t} ms` : '');
  check('the module global is the shared host (create / studioDef / send)',
    await ev('typeof window.WonderLabHost.create === "function" && typeof window.WonderLabHost.studioDef === "function" && typeof window.WonderLabHost.send === "function"'));
  const noHostJs = process.env.LABDEV_NOHOSTJS === '1';
  check(noHostJs ? 'the host came from the lab.js bundle (this deploy carries no lab-host.js)'
                 : 'the host came from lab-host.js in the lab folder',
    await ev(`${noHostJs} ? /lab\.js/.test(window.__hostScript) && !/lab-host\.js/.test(window.__hostScript) : /lab-host\.js/.test(window.__hostScript)`),
    String(await ev('window.__hostScript')));
  check('the base came from <meta name="wl-lab-base">', await ev(`PG.host.base.endsWith('/files/L4/lessons/assets/lab/')`), String(await ev('PG.host.base')));
  check('the manifest names the studio folder', await ev(`PG.host.manifest.studio === '${STUDIO}/'`));
  check('the frame is in the shared box inside #pgStage', await ev('!!document.querySelector("#pgStage > .wl-host > iframe.wl-sframe#pgFrame")'));
  check('the shared stylesheet was loaded from the lab folder', await ev('!!document.querySelector("link[data-wl-css]")'), String(await ev('(document.querySelector("link[data-wl-css]")||{}).href')));
  check('the shared stylesheet sizes the frame', await ev(`(() => { const r=document.querySelector('#pgFrame').getBoundingClientRect(); return r.width>600 && r.height>400; })()`));
  const cfg = JSON.parse(await ev('JSON.stringify(window.__studioCfg || null)') || 'null') || {};
  check('the playground\'s own lesson and library flag reached WLStudio.boot()',
    cfg.library === true && cfg.assetBase === '/lab-library/a/' && cfg.lesson && cfg.lesson.title === '遊樂場', JSON.stringify({ library: cfg.library, assetBase: cfg.assetBase }));
  const g = JSON.parse(await ev(`JSON.stringify((() => { const f=document.querySelector('#pgFrame').getBoundingClientRect();
    const w=document.querySelector('.pg-wrap').getBoundingClientRect();
    return { vh: innerHeight, wh: Math.round(w.height), wb: Math.round(w.bottom), fw: Math.round(f.width), fh: Math.round(f.height), b: Math.round(f.bottom), doc: document.documentElement.scrollHeight }; })())`));
  check('the playground still fills the screen', g.wh >= g.vh * 0.8 && g.wb <= g.vh, `wrap ${g.wh} of ${g.vh}`);
  check('the editor stays on screen and the page does not scroll', g.b <= g.vh && g.doc <= g.vh + 1, `frame bottom ${g.b}, document ${g.doc}, viewport ${g.vh}`);
  await shot('labhost_playground.png');
  // its own AI surface, over the host's transport
  const turns = playgroundTurns.length;
  await ev(`(() => { document.getElementById('pgIn').value = '加一個角色'; document.getElementById('pgSend').click(); })()`);
  await wait(`document.querySelector('#pgLog') && /好，我幫你砌/.test(document.querySelector('#pgLog').textContent)`, 30000, 'the AI reply');
  check('the AI chat still posts to /api/ai/lab/playground and renders the reply', playgroundTurns.length === turns + 1);
  const body = JSON.parse(playgroundTurns[playgroundTurns.length - 1] || '{}');
  check('the turn carried the live program, history and text', body.text === '加一個角色' && Array.isArray(body.history) && body.program && typeof body.program === 'object');
  await shot('labhost_playground_ai.png');
}

async function badStudio() {
  console.log('\n== a manifest that names a studio folder this deploy does not have');
  await send('Page.navigate', { url: origin + '/lesson.html' });
  await wait('!!document.querySelector(".wl-mode button")', 20000, 'the lab toggle');
  await wait('[...document.querySelectorAll(".wl-mode button")][1] && ![...document.querySelectorAll(".wl-mode button")][1].disabled', 20000, 'an enabled toggle');
  const t0 = Date.now();
  await ev(`[...document.querySelectorAll('.wl-mode button')][1].click()`);
  const t = await wait('!!window.WL && !document.getElementById("wllab").hidden', 120000, 'the read-only fallback');
  check('the lesson page falls back to the read-only lab instead of hanging', t >= 0, `${Date.now() - t0} ms`);
  check('the failed frame was taken out of the page', !(await ev('!!document.querySelector("#wlstudio iframe, #wlstudio .wl-host")')));
  await shot('labhost_badstudio_readonly.png');
  await send('Page.navigate', { url: origin + '/index.html#playground' });
  await wait('!!document.querySelector(".pg-wrap")', 20000, '.pg-wrap');
  await wait('typeof PG !== "undefined" && !!PG.host', 30000, 'the host');
  const e = await wait(`(() => { const o=document.querySelector('#pgStage .wl-sload'); return !!o && !o.hidden && /找不到|失敗|未能就緒/.test(o.textContent); })()`, 30000, 'the error line');
  check('the playground says so, in the shared overlay, instead of a blank pane', e >= 0,
    String(await ev('(document.querySelector("#pgStage .wl-sload")||{}).textContent')));
  check('and it does not pretend the editor is up', await ev('!PG.W'));
  await shot('labhost_badstudio_playground.png');
}

try {
  if (MODE === 'lesson' || MODE === 'all') await lesson();
  if (MODE === 'lab-ro') await lesson();
  if (MODE === 'playground' || MODE === 'all') await playground();
  if (MODE === 'bad-studio') await badStudio();
} finally {
  const noisy = console_.slice(0, 6);
  if (noisy.length) { console.log('\nconsole (errors/warnings):'); noisy.forEach((l) => console.log('   ' + l)); }
  chrome.kill(); server.close();
  try { rmSync(dir, { recursive: true, force: true }); rmSync(session, { recursive: true, force: true }); } catch {}
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}
