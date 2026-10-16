#!/usr/bin/env node
/**
 * Static checks on dist/lab.js, dist/lab-standalone.js and their sources: the things a browser test cannot see.
 *
 *   node test/check_bundle.mjs          # needs `npm run build` first
 *
 * What it catches (each one is a bug this repo has actually had):
 *
 *   · TWO transports. src/lab.js used to carry its own copy of the lab POST next to lab-host.js's; the copy was
 *     unreachable (lab-host.js always ran first in the bundle and set window.WonderLabHost), so nothing observable
 *     ever went wrong — which is exactly why it survived. A duplicate that cannot fail is still a duplicate: this
 *     counts the POST shapes in the built bundles and fails on a second one.
 *   · manifest.json fetched twice per page. The lab reads it for the toggle and the engine list; the host reads it
 *     again unless the caller hands its copy over (opts.manifest). Measured 2 requests per studio lesson page before
 *     the fix, 1 after; this checks the hand-over is still there.
 *   · no module graph. Every lab module must register through the registry (WLR.define) and must not reach for a
 *     global; the bundles must be the wrapper plus the modules in the order tools/build.mjs declares; the lesson
 *     bundle must still be ONE classic script (that is the promise to every deployed lesson page).
 *   · a new window.* global. The lab publishes exactly five, all of them part of its contract with the runtime, the
 *     host and the tests; a sixth is a coupling bug, not a feature.
 *   · a single-file lab again. The old src/lab.js was 1056 lines owning ten responsibilities; this fails if one
 *     module grows back past a quarter of that.
 *
 * AGPL-3.0-only (see LICENSE).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const count = (s, sub) => s.split(sub).length - 1;

let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✔' : '✖'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) fails += 1; };

const build = read('tools/build.mjs');
const bundle = read('dist/lab.js');
const standalone = read('dist/lab-standalone.js');
const host = read('src/lab-host.js');

// the lab's published globals: the runtime's (WL, WLS, WL_BOOT_MS, WL_STUDIO), the host's (WonderLabHost)
const GLOBALS = ['WonderLabHost', 'WL', 'WLS', 'WL_BOOT_MS', 'WL_STUDIO'];
// the one transport, exactly as src/lab-api.js writes it (a plain substring: no escaping to get wrong)
const TRANSPORT = "if (!L.host || typeof L.host.send !== 'function') return Promise.reject(new Error('WonderLabHost.send is missing'));";
const GIVEN = "var given = (o.manifest && typeof o.manifest === 'object') ? o.manifest : null;";
const assigned = (s) => [...s.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map((m) => m[1]);

/* ---- 1. ONE transport: a lab POST is written once, in src/lab-host.js ---- */
for (const [name, text] of [['dist/lab.js', bundle], ['dist/lab-standalone.js', standalone]]) {
  check(`one JSON POST transport in ${name} (lab-host.js send())`,
    count(text, "'Content-Type': 'application/json'") === 1, `${count(text, "'Content-Type': 'application/json'")} found`);
  check(`one fetch(url, init) in ${name} (the host request())`,
    count(text, 'fetch(url, init)') === 1, `${count(text, 'fetch(url, init)')} found`);
  check(`the lab transport in ${name} delegates to the host and nothing else`,
    text.includes(TRANSPORT) && text.includes('return L.host.send(url, body, opt);'));
}

/* ---- 2. manifest.json is read once per page: the caller hands its copy to the host ---- */
check('the manifest is handed to the host at the create() call site',
  /create\(\{[\s\S]{0,500}?manifest: L\.man,/.test(bundle),
  /create\(\{[\s\S]{0,500}?manifest: L\.man,/.test(bundle) ? '' : 'host.create() without opts.manifest -> the host fetches it again');
check('lab-host.js honours a manifest it is given', host.includes(GIVEN));
check('lab-host.js only fetches the manifest when it was not given one',
  count(host, "join(base, 'manifest.json')") === 1 && /given \? \{ status: 200, data: given \} : request\(join\(base, 'manifest\.json'\)/.test(host));

/* ---- 3. a real module graph: every module registers, nothing reaches for a new global ---- */
const ARRAY = /const LAB_MODULES = \[([\s\S]*?)\];/.exec(build);
const declared = ARRAY ? ARRAY[1].match(/'([^']+\.js)'/g).map((q) => q.slice(1, -1)) : [];
check('tools/build.mjs declares the lab modules it concatenates', declared.length >= 10, declared.join(' '));
for (const f of declared) {
  let src;
  try { src = read('src/' + f); } catch (e) { check(`src/${f} exists`, false); continue; }
  check(`src/${f} is ES5 (no import/export)`, !/^\s*(import|export)\s/m.test(src));
  const extras = [...new Set(assigned(src))].filter((n) => !GLOBALS.includes(n));
  check(`src/${f} assigns no new global`, extras.length === 0, extras.join(', '));
  // lab-host.js is the shared UMD host (the playground loads it as dist/lab-host.js and needs window.WonderLabHost):
  // it is deliberately NOT a registry module. Every other lab-*.js is.
  if (f === 'lab-host.js') { check('src/lab-host.js stays the shared UMD host', /root\.WonderLabHost = api/.test(src)); continue; }
  check(`src/${f} registers through the registry`, /WLR\.define\('/.test(src));
}
const modules = declared.filter((f) => f !== 'lab-host.js');
const lines = (f) => read('src/' + f).split('\n').length;
check('no single module is a quarter of the old lab.js again',
  modules.every((f) => lines(f) < 400), modules.map((f) => `${f}:${lines(f)}`).join(' '));
check('the old single-file src/lab.js is gone', !fs.existsSync(path.join(ROOT, 'src', 'lab.js')));

/* ---- 3b. every cross-module call resolves. The split rewrote `labmode` as a field of the lab instance; the first
   version of it left `L.mode.labmode` behind in four files, which is `undefined` — the submit handler returned at
   once and the lab silently stopped sending turns. Nothing in a browser test caught THAT on its own (the RO test
   does now); this catches the whole class, at the source. ---- */
function exportsOf(file) {
  const text = read(file);
  const i = text.lastIndexOf('\n  return {');
  const body = i < 0 ? text : text.slice(i);
  const keys = new Set();
  for (const k of body.matchAll(/(?:^|[,{\s])(?:get\s+)?([A-Za-z_$][\w$]*)\s*[:(,}]/g)) keys.add(k[1]);
  return keys;
}
const STATE = new Set(['doc', 'host', 'opts', 'man', 'info', 'ready', 'st', 'sig', 'ranSinceTurn', 'labmode', 'busy',
  'capsReason', 'closedReason', 'pendingSend', 'wantLab', 'prefetched', 'last', 'KEY', 'studioOn', 'wl', 'booting',
  'ST', 'sbooting', 'setupDone', 'main', 'core', 'page', 'api', 'chat', 'ui', 'ro', 'studio', 'mode']);
const API = {};
for (const f of modules) API[f.replace('lab-', '').replace('.js', '')] = exportsOf('src/' + f);
for (const m of read('src/lab-page.js').matchAll(/\bP\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) API.page.add(m[1]);
const unresolved = [];
for (const f of modules.concat(['lab-main.js', 'lab-entry.js', 'standalone.js'])) {
  const text = read('src/' + f);
  for (const m of text.matchAll(/\bL\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/g)) {
    const [, mod, mem] = m;
    if (!(mod in API)) { if (!STATE.has(mod)) unresolved.push(`${f}: L.${mod}.${mem} (no such field on the lab)`); continue; }
    if (!API[mod].has(mem)) unresolved.push(`${f}: L.${mod}.${mem} is not exported by ${mod}`);
  }
  for (const m of text.matchAll(/(?:^|[^\w$.])P\.([A-Za-z_$][\w$]*)/g)) if (!API.page.has(m[1])) unresolved.push(`${f}: P.${m[1]} is not on the page contract`);
  for (const m of text.matchAll(/(?:^|[^\w$.])C\.([A-Za-z_$][\w$]*)/g)) if (!API.core.has(m[1])) unresolved.push(`${f}: C.${m[1]} is not exported by core`);
}
check('every cross-module call in src/ resolves (L.<module>.<member>, P.<field>, C.<helper>)',
  unresolved.length === 0, [...new Set(unresolved)].slice(0, 6).join(' | '));

/* ---- 4. the bundles are the wrapper + the host + the modules in the declared order ---- */
const order = declared.map((f) => bundle.indexOf(read('src/' + f).slice(0, 400)));
check('dist/lab.js carries every module, in the declared order',
  order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), JSON.stringify(order));
check('dist/lab.js is still ONE classic script (no import/export, no type=module needed)',
  !/^\s*(import|export)\s/m.test(bundle));
check('dist/lab.js is wrapped once, by the build', count(bundle, "'use strict';\n") >= 1 && /^\/\*!/.test(bundle));
const head = (f) => read('src/' + f).slice(0, 400);
check('dist/lab-standalone.js carries the same modules plus the composer and the standalone entry',
  declared.every((f) => standalone.includes(head(f))) && standalone.includes(head('lab-main.js')) && standalone.includes(head('standalone.js')));
check('dist/lab.js ends in the lesson entry, and does not carry the standalone one',
  bundle.includes(head('lab-main.js')) && bundle.includes(head('lab-entry.js')) && !bundle.includes(head('standalone.js')));
check('dist/lab-standalone.js does not carry the lesson entry',
  !standalone.includes(head('lab-entry.js')));
check('only the entry calls WLLab.boot()', count(bundle, 'WLLab.boot();') === 1 && count(standalone, 'WLLab.boot();') === 0);

/* ---- 5. no new window.* global in the built bundles ---- */
for (const [name, text] of [['dist/lab.js', bundle], ['dist/lab-standalone.js', standalone]]) {
  const newOnes = [...new Set(assigned(text))].filter((n) => !GLOBALS.includes(n));
  check(`${name} introduces no new window.* global`, newOnes.length === 0, newOnes.join(', ') || 'none beyond ' + GLOBALS.join('/'));
}

/* ---- 6. the lesson tag itself: dist/lab.js must not need a second file ---- */
check('dist/lab.js carries the host inline (the deployed single-tag promise)',
  bundle.includes(host.slice(0, 400)) && bundle.includes('root.WonderLabHost = api'));
check('dist/lab-host.js is the host verbatim (the playground loads this exact file)', read('dist/lab-host.js') === host);
check('dist/lab.css is unchanged by the split', read('dist/lab.css') === read('src/lab.css'));

/* ---- 7. the page contract has ONE owner: no other module may name the parent page's ids or classes ---- */
const CONTRACT = [/getElementById\(['"]chat['"]\)/, /['"]\.chhead['"]/, /getElementById\(['"]chbody['"]\)/, /getElementById\(['"]chform['"]\)/,
  /getElementById\(['"]chin['"]\)/, /getElementById\(['"]chsend['"]\)/, /getElementById\(['"]chcaps['"]\)/, /getElementById\(['"]chfab['"]\)/,
  /['"]\.chclose['"]/, /['"]\.lessonbar['"]/, /['"]main\.wrap['"]/, /data-ep/];
const owners = [];
for (const f of modules.concat(['lab-main.js', 'lab-entry.js', 'standalone.js'])) {
  if (f === 'lab-page.js') continue;
  const text = read('src/' + f).split('\n').filter((l) => !/^\s*[*/]/.test(l)).join('\n');   // prose may quote a selector
  for (const re of CONTRACT) if (re.test(text)) owners.push(`${f}: ${re}`);
}
check('only src/lab-page.js names the parent page\'s DOM', owners.length === 0, [...new Set(owners)].join(' | '));
check('src/lab-page.js does name all of it', CONTRACT.every((re) => re.test(read('src/lab-page.js'))),
  CONTRACT.filter((re) => !re.test(read('src/lab-page.js'))).map(String).join(' | '));

console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
