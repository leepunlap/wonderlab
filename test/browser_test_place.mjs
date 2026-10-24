/*!
 * Wonder Lab Studio — does a refresh put the student back where they were?
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS IS
 * Three things a student chooses and a refresh used to throw away: the tab of the editor
 * (程式 / 造型 / 音效), the tab of the pane (對話 / 指南) and the chapter of the guide they had
 * worked their way into. They are three small strings, and they are kept — written when the student
 * moves, read when the page comes back.
 *
 * WHY A REAL BROWSER AND NOT A PAGE
 * The pages in src/ are read on a virtual clock (npm run check:pages), and a virtual clock cannot
 * test this: the editor's boot takes real time, and the clock runs ahead of it, so the page either
 * sees an editor that has not drawn yet or a document that has not been replaced yet. A refresh
 * that is not a refresh looks exactly like a refresh that works. So this test drives a real Chrome
 * over the devtools protocol, in real time, and asks the page what it is showing.
 *
 *   node test/browser_test_place.mjs
 *
 * Needs: the dev server (WL_LIBRARY=… python3 server/studio_server.py --port 8920), Google Chrome,
 * and node 18+ (global WebSocket). Nothing is written outside a temp profile. AGPL-3.0-only.
 */
import { spawn } from 'node:child_process';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.WL_CDP_PORT || 9333);
const PAGE = process.env.WL_PLACE_URL || 'http://127.0.0.1:8920/index.html';
const PROFILE = '/tmp/wl-place-profile';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--no-proxy-server', '--window-size=1440,900',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--user-data-dir=' + PROFILE, `--remote-debugging-port=${PORT}`, 'about:blank'
], { stdio: 'ignore' });

let ws = null;
let seq = 0;
const pending = new Map();

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || 'eval failed');
  return r.result && r.result.value;
}

async function waitFor(expression, ms, label) {
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try { v = await evaluate(expression); } catch (e) { v = false; }
    if (v) return true;
    if (Date.now() - t0 > (ms || 90000)) throw new Error('timeout: ' + (label || expression));
    await sleep(250);
  }
}

const READY = '!!(window.WLStudio && window.WLStudio.ready)';

async function main() {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(300);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch (e) { /* chrome is not up yet */ }
  }
  if (!target) throw new Error('no chrome target');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message));
      else p.resolve(m.result);
    }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable');
  await send('Runtime.enable');

  /* ---- a clean start ---- */
  await send('Page.navigate', { url: PAGE });
  await waitFor(READY, 90000, 'the editor is ready');
  await evaluate('localStorage.removeItem("wl.chat.tab");localStorage.removeItem("wl.guide.place");localStorage.removeItem("wl.editor.tab");');

  /* ---- move: the editor's second tab, the pane's guide tab, a chapter of the guide ---- */
  const moved = await evaluate(`(function () {
    var tabs = document.querySelectorAll('[class*="react-tabs__tab-list"] [role="tab"]');
    if (tabs.length < 3) return { error: 'no tab strip' };
    tabs[1].click();
    var pane = document.querySelectorAll('.wl-tab');
    if (pane.length < 2) return { error: 'no pane tabs' };
    pane[1].click();
    return { ok: true };
  })()`);
  if (moved && moved.error) throw new Error(moved.error);
  await waitFor(`(function () {
    var idx = document.querySelector('.wl-g-idx, .wl-g-index');
    if (idx) { var t = idx.querySelector('.wl-g-topic'); if (t) { t.click(); return !!document.querySelector('.wl-g-topic-page'); } }
    return !!document.querySelector('.wl-g-topic-page');
  })()`, 20000, 'a chapter opens');
  await sleep(600);
  const before = JSON.parse(await evaluate(`JSON.stringify({
    chat: localStorage.getItem('wl.chat.tab'),
    place: localStorage.getItem('wl.guide.place'),
    editor: localStorage.getItem('wl.editor.tab'),
    title: (document.querySelector('.wl-g-ctitle') || {}).textContent || ''
  })`));
  console.log('  after moving: ' + JSON.stringify(before));

  /* ---- and back: a real refresh ---- */
  await send('Page.reload', {});
  await waitFor(READY, 90000, 'the editor is ready again');
  await sleep(2500);   // the tab goes back a moment after the project lands
  const after = JSON.parse(await evaluate(`JSON.stringify({
    chat: (document.querySelector('.wl-tab.is-on') || {}).textContent || '',
    title: (document.querySelector('.wl-g-ctitle') || {}).textContent || '',
    onTopic: !!document.querySelector('.wl-g-topic-page'),
    editor: (function () {
      var l = document.querySelector('[class*="react-tabs__tab-list"]');
      var on = l && l.querySelector('[role="tab"][aria-selected="true"]');
      return on ? (on.textContent || '').trim() : '';
    })()
  })`));
  console.log('  after a refresh: ' + JSON.stringify(after));

  const problems = [];
  if (before.chat !== 'guide') problems.push('the pane tab was not remembered');
  if (!before.place) problems.push('the guide place was not remembered');
  if (before.editor !== '1') problems.push('the editor tab was not remembered');
  if (after.chat.indexOf('指南') < 0) problems.push('the pane came back on ' + after.chat);
  if (!after.onTopic) problems.push('the guide came back on the index');
  if (after.title !== before.title) problems.push('the guide came back on a different step');
  if (after.editor !== '造型') problems.push('the editor came back on ' + after.editor);
  if (problems.length) {
    problems.forEach((p) => console.log('  FAIL ' + p));
    console.log('RESULT FAIL');
    return 1;
  }
  console.log('RESULT PASS');
  return 0;
}

let code = 1;
try {
  code = await main();
} catch (e) {
  console.log('RESULT FAIL: ' + (e && e.message ? e.message : e));
} finally {
  try { ws && ws.close(); } catch (e) { /* closing is best effort */ }
  chrome.kill('SIGKILL');
}
process.exit(code);
