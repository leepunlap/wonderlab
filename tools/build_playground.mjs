#!/usr/bin/env node
// Wonder Lab — the standalone playground, packaged for the teachers' portal. Copyright (C) 2026 IITS. AGPL-3.0-only.
//
//   npm run build:playground   ->  dist-playground/playground-<hash>/ + dist-playground/playground.json
//
// WHY THIS EXISTS
// There are two surfaces of the same editor and they are NOT the same products:
//   · tools/build.mjs  packages lab-frame.html — the lesson-page shell. No guide, no chat pane.
//   · this script      packages src/index.html — the standalone playground: the AI pane, the 指南 tab,
//                      the demonstrations (studio-guide*.js), the voice, the model pill.
// The teachers' portal used to mount the lesson shell and call it a playground, which is why the
// tutorial was never there. It now mounts this package in an iframe instead.
//
// WHAT IT SHIPS
// the page, its own scripts and sheets, src/assets (including the baked guide voice), the upstream
// @scratch/scratch-gui 15.2.0 bundle with the same publicPath rewrite build.mjs makes, its run-time
// chunks / static files / default project, and the licences.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src'), GUI = path.join(ROOT, 'node_modules', '@scratch', 'scratch-gui');
const DIST = path.join(ROOT, 'dist-playground'), BUILD = path.join(ROOT, 'build-playground');
const log = (...a) => console.log('[playground-build]', ...a);

/* The gate. A guide whose sentence disagrees with its own demonstration — "the pointer drags two
   blocks out" over a stack of five — builds perfectly and ships, and the person who finds it is a
   teacher looking at the screen. So is a guide whose ring is on the stage while the voice is naming
   the blocks and the green flag, which is the same mistake one layer out: the words and the picture
   are one thing, and both are checked before anything is copied. SKIP_CHECKS=1 is there for the day
   one of them is wrong. */
if (!process.env.SKIP_CHECKS) {
  for (const tool of ['check_guide.mjs', 'check_claims.mjs', 'check_marks.mjs', 'check_pace.mjs']) {
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'tools', tool)], { stdio: 'pipe' });
      log('check ok  ' + tool);
    } catch (e) {
      process.stderr.write(String(e.stdout || '') + String(e.stderr || ''));
      throw new Error(`refusing to build: ${tool} failed (SKIP_CHECKS=1 overrides)`);
    }
  }
}

const rm = p => fs.rmSync(p, { recursive: true, force: true });
const mkdir = p => fs.mkdirSync(p, { recursive: true });
function copy(src, dst) { mkdir(path.dirname(dst)); fs.copyFileSync(src, dst); }
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); }
const noMap = code => code.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n');

const guiPkg = JSON.parse(fs.readFileSync(path.join(GUI, 'package.json'), 'utf8'));
if (guiPkg.version !== '15.2.0') throw new Error('expected @scratch/scratch-gui 15.2.0, found ' + guiPkg.version + ' (npm ci)');
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8')).packages['node_modules/@scratch/scratch-gui'] || {};
const DISTGUI = path.join(GUI, 'dist');

rm(BUILD); const PG = path.join(BUILD, 'pg'); mkdir(PG);

// 1. the page and everything it names, plus the folder next to it that the page reads at run time
const PAGE = 'index.html';
const own = fs.readdirSync(SRC).filter(f => {
  const st = fs.statSync(path.join(SRC, f));
  if (st.isDirectory()) return false;
  if (/\.bak-/.test(f)) return false;                      // hand-kept history, never shipped
  return /^(studio[\w.-]*\.(js|css)|ucmake-blocks\.js|opcodes\.json|index\.html|NOTICE\.html)$/.test(f);
});
for (const f of own) copy(path.join(SRC, f), path.join(PG, f));
for (const d of ['assets', 'ucmake']) {
  const p = path.join(SRC, d);
  if (fs.existsSync(p)) for (const f of walk(p)) copy(f, path.join(PG, d, path.relative(p, f)));
}
if (!fs.existsSync(path.join(PG, 'assets', 'voice', 'manifest.json'))) throw new Error('assets/voice/manifest.json is missing — run `npm run build:voice`');

// the page must not carry a compiled-in endpoint: the portal passes ?api=/api/ai/lab/playground
const page = fs.readFileSync(path.join(PG, PAGE), 'utf8');
if (page.indexOf("Q.get('api')") < 0) throw new Error(PAGE + ' does not read ?api= — refusing to ship a fixed endpoint');

// 2. the editor bundle, publicPath "/" -> the folder of the loading script (same rewrite as build.mjs)
const MAIN = 'scratch-gui-standalone.js';
let code = fs.readFileSync(path.join(DISTGUI, MAIN), 'utf8');
const re = /(__webpack_require__|__nested_webpack_require_\d+__)\.p="\/"/g, hits = code.match(re) || [];
if (hits.length !== 2) throw new Error(`${MAIN}: expected 2 webpack publicPath "/" assignments, found ${hits.length}`);
const BASE = 'var __wlStudioBase=(function(){try{var s=document.currentScript&&document.currentScript.src;return s?s.slice(0,s.lastIndexOf("/")+1):"/"}catch(e){return"/"}})();\n';
code = "/*! Modified by IITS 2026-10-07: webpack publicPath set to the loading script's folder (wonderlab-studio tools/build_playground.mjs). AGPL-3.0-only. */\n" +
  BASE + noMap(code.replace(re, (m, v) => v + '.p=__wlStudioBase'));
fs.writeFileSync(path.join(PG, MAIN), code);
copy(path.join(DISTGUI, MAIN + '.LICENSE.txt'), path.join(PG, MAIN + '.LICENSE.txt'));

// 3. run-time files the bundle names (same filter as build.mjs)
const chunkMap = /__webpack_require__\.u=e=>"chunks\/"\+\(\{([^}]*)\}\[e\]\|\|e\)\+"\."\+\{([^}]*)\}/.exec(code);
if (!chunkMap) throw new Error('chunk map not found');
const names = Object.fromEntries(chunkMap[1].split(',').map(x => x.split(':')).map(([k, v]) => [k, v.replace(/"/g, '')]));
const hashes = Object.fromEntries(chunkMap[2].split(',').map(x => x.split(':')).map(([k, v]) => [k, v.replace(/"/g, '')]));
const chunks = Object.keys(hashes).map(k => (names[k] || k) + '.' + hashes[k] + '.js').filter(f => !/-steps\./.test(f));
for (const m of code.matchAll(/"chunks\/(fetch-worker\.[0-9a-f]+\.js)"/g)) chunks.push(m[1]);
for (const f of [...new Set(chunks)]) {
  const src = path.join(DISTGUI, 'chunks', f);
  if (!fs.existsSync(src)) throw new Error('missing chunk ' + f);
  mkdir(path.join(PG, 'chunks'));
  fs.writeFileSync(path.join(PG, 'chunks', f), noMap(fs.readFileSync(src, 'utf8')));
}
const chunkCode = [...new Set(chunks)].map(f => fs.readFileSync(path.join(DISTGUI, 'chunks', f), 'utf8')).join('\n');
const statics = [...new Set([...(code + chunkCode).matchAll(/"static\/assets\/([^"?]+)(\?resource)?"/g)].map(m => m[1]))]
  .filter(f => /\.js$/.test(f) || /^icon--[a-z-]+\.[0-9a-f]+\.svg$/.test(f) || /^unsupported\.[0-9a-f]+\.png$/.test(f));
for (const f of statics) {
  const src = path.join(DISTGUI, 'static', 'assets', f);
  if (!fs.existsSync(src)) throw new Error(`${MAIN} asks for static/assets/${f} and the gui dist does not have it`);
  copy(src, path.join(PG, 'static', 'assets', f));
  if (fs.existsSync(path.join(DISTGUI, 'static', 'assets', f + '.LICENSE.txt'))) copy(path.join(DISTGUI, 'static', 'assets', f + '.LICENSE.txt'), path.join(PG, 'static', 'assets', f + '.LICENSE.txt'));
}
for (const f of walk(path.join(DISTGUI, 'static', 'blocks-media'))) copy(f, path.join(PG, 'static', 'blocks-media', path.relative(path.join(DISTGUI, 'static', 'blocks-media'), f)));

const DEFAULTSRC = path.join(GUI, 'src', 'lib', 'default-project');
mkdir(path.join(PG, 'defaults'));
for (const f of fs.readdirSync(DEFAULTSRC).filter(f => /\.(svg|wav|png)$/i.test(f))) copy(path.join(DEFAULTSRC, f), path.join(PG, 'defaults', f));

// licences
const LIC = path.join(PG, 'LICENSES'); mkdir(LIC);
fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(LIC, 'AGPL-3.0.txt'));
fs.copyFileSync(path.join(GUI, 'LICENSE'), path.join(LIC, 'upstream-scratch-gui.txt'));
fs.copyFileSync(path.join(ROOT, 'NOTICE.md'), path.join(LIC, 'NOTICE.md'));

// 4. hash, place, compress
const h = createHash('sha1');
for (const f of walk(PG).sort()) { h.update(path.relative(PG, f)); h.update(fs.readFileSync(f)); }
const ver = h.digest('hex').slice(0, 10), dir = 'playground-' + ver;
rm(DIST); mkdir(DIST);
fs.renameSync(PG, path.join(DIST, dir));
let raw = 0, gz = 0, n = 0;
for (const f of walk(path.join(DIST, dir))) {
  n += 1;
  if (!/\.(js|css|json|svg|txt|md|html)$/.test(f)) { raw += fs.statSync(f).size; continue; }
  const b = fs.readFileSync(f), z = zlib.gzipSync(b, { level: 9 });
  raw += b.length; gz += z.length;
  if (b.length > 1024) fs.writeFileSync(f + '.gz', z);
}
const info = { version: ver, dir: dir + '/', page: PAGE, files: n,
  upstream: { '@scratch/scratch-gui': { version: guiPkg.version, resolved: lock.resolved || null, integrity: lock.integrity || null } },
  bytes: { raw, gzip_text: gz } };
fs.writeFileSync(path.join(DIST, 'playground.json'), JSON.stringify(info, null, 1));
rm(BUILD);
log(`dist-playground/${dir}  ${n} files, raw ${(raw / 1e6).toFixed(2)} MB, text gzip ${(gz / 1e6).toFixed(2)} MB`);
