#!/usr/bin/env node
// Wonder Lab front-end build. Copyright (C) 2026 IITS. AGPL-3.0-only (see LICENSE).
//
//   npm ci && npm run build        ->  dist/  (copy its contents to <lesson site>/L4/assets/lab/)
//
// 1. fetch the pinned @scratch/* 15.2.0 tarballs with `npm pack` (kept in vendor/, they are the exact upstream source)
// 2. take their prebuilt dist/web bundles and patch webpack's publicPath ("/") so chunks load next to the script; each
//    patched bundle starts with a notice of the change and keeps its <main>.LICENSE.txt next to it (and in LICENSES/)
// 3. bundle scratch-blocks 2.x (ESM, Blockly 12) into one IIFE with esbuild
// 4. write dist/engine-<hash>/ (immutable), dist/lab.js + lab.css, dist/engine.json, licences, .gz siblings
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const ENGINE = PKG.wonderlab.engine;
const VENDOR = path.join(ROOT, 'vendor'), BUILD = path.join(ROOT, 'build'), DIST = path.join(ROOT, 'dist');
const log = (...a) => console.log('[build]', ...a);

function rm(p) { fs.rmSync(p, { recursive: true, force: true }); }
function mkdir(p) { fs.mkdirSync(p, { recursive: true }); }
function copyDir(src, dst, filter = () => true) {
  mkdir(dst);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d, filter); else if (filter(s)) fs.copyFileSync(s, d);
  }
}

// 1. upstream tarballs
mkdir(VENDOR);
const tarballs = {};
for (const [name, ver] of Object.entries(ENGINE)) {
  const file = name.replace('@', '').replace('/', '-') + '-' + ver + '.tgz';
  const p = path.join(VENDOR, file);
  if (!fs.existsSync(p)) { log('npm pack', name + '@' + ver); execFileSync('npm', ['pack', name + '@' + ver, '--pack-destination', VENDOR, '--silent'], { stdio: 'inherit' }); }
  tarballs[name] = p;
}
for (const pk of ['scratch-blocks@' + PKG.dependencies['scratch-blocks']]) {   // Apache-2.0 inputs of the blocks bundle, mirrored for completeness
  const file = pk.replace('@', '-') + '.tgz';
  if (!fs.existsSync(path.join(VENDOR, file))) execFileSync('npm', ['pack', pk, '--pack-destination', VENDOR, '--silent'], { stdio: 'inherit' });
}
const sums = fs.readdirSync(VENDOR).filter(f => f.endsWith('.tgz')).sort()
  .map(f => createHash('sha512').update(fs.readFileSync(path.join(VENDOR, f))).digest('hex') + '  ' + f).join('\n') + '\n';
fs.writeFileSync(path.join(VENDOR, 'SHA512SUMS'), sums);

// 2. extract + patch
rm(BUILD); mkdir(BUILD);
const ENG = path.join(BUILD, 'engine'); mkdir(ENG);
const MODIFIED = "/*! Modified by IITS 2026-10-07: webpack publicPath set to the loading script's folder (tools/build.mjs). AGPL-3.0-only. */\n";
const LIC = path.join(ENG, 'LICENSES'); mkdir(LIC);
const PUBLIC_PATH = 'p=(function(){try{var s=document.currentScript&&document.currentScript.src;return s?s.slice(0,s.lastIndexOf("/")+1):"/"}catch(e){return"/"}})()';
function takeBundle(name, main, out) {
  const x = path.join(BUILD, 'x-' + out.replace('.js', '')); mkdir(x);
  execFileSync('tar', ['xzf', tarballs[name], '-C', x, '--strip-components=1']);
  const web = path.join(x, 'dist', 'web');
  let code = fs.readFileSync(path.join(web, main), 'utf8');
  const re = /([A-Za-z_$][\w$]*)\.p="\/"/g, hits = code.match(re) || [];
  if (hits.length !== 1) throw new Error(`${name}: expected exactly one webpack publicPath, found ${hits.length}`);
  code = MODIFIED + code.replace(re, (m, v) => v + '.' + PUBLIC_PATH);
  fs.writeFileSync(path.join(ENG, out), code);
  // the bundle's own header says "For license information please see <main>.LICENSE.txt": ship that file with it
  const lic = path.join(web, main + '.LICENSE.txt');
  if (!fs.existsSync(lic)) throw new Error(`${name}: ${main}.LICENSE.txt missing`);
  fs.copyFileSync(lic, path.join(ENG, main + '.LICENSE.txt'));
  fs.copyFileSync(lic, path.join(LIC, main + '.LICENSE.txt'));
  for (const sub of ['chunks', 'assets']) {
    if (fs.existsSync(path.join(web, sub))) copyDir(path.join(web, sub), path.join(ENG, sub), f => !f.endsWith('.map'));
  }
  fs.copyFileSync(path.join(x, 'LICENSE'), path.join(BUILD, 'LICENSE.' + out.replace('.js', '')));
  log('engine', name, ENGINE[name], '->', out, '(publicPath patched)');
}
takeBundle('@scratch/scratch-storage', 'scratch-storage.min.js', 'scratch-storage.js');
takeBundle('@scratch/scratch-render', 'scratch-render.min.js', 'scratch-render.js');
takeBundle('@scratch/scratch-vm', 'scratch-vm.js', 'scratch-vm.js');

// 3. scratch-blocks -> IIFE, and scratch-audio -> IIFE (window.ScratchAudio)
const esbuild = path.join(ROOT, 'node_modules', '.bin', 'esbuild');
execFileSync(esbuild, [path.join(ROOT, 'src', 'blocks-entry.mjs'), '--bundle', '--minify', '--format=iife', '--legal-comments=eof',
  '--outfile=' + path.join(ENG, 'scratch-blocks.js'), '--log-level=warning'], { stdio: 'inherit' });
// scratch-audio 2.0.268 is a dependency of @scratch/scratch-vm but is NOT inside its web bundle: the host must
// attach the engine (scratch-gui does `vm.attachAudioEngine(new AudioEngine())`). Without it every 播放音效 block
// is silent. Bundled from src/ because the packaged dist.js leaves minilog / startaudiocontext / audio-context as
// externals a browser cannot resolve.
execFileSync(esbuild, [path.join(ROOT, 'src', 'audio-entry.mjs'), '--bundle', '--minify', '--format=iife', '--legal-comments=eof',
  '--outfile=' + path.join(ENG, 'scratch-audio.js'), '--log-level=warning'], { stdio: 'inherit' });
fs.copyFileSync(path.join(ROOT, 'node_modules', 'scratch-audio', 'LICENSE'), path.join(LIC, 'AGPL-3.0.scratch-audio.txt'));
fs.copyFileSync(path.join(ROOT, 'node_modules', 'startaudiocontext', 'LICENSE.md'), path.join(LIC, 'MIT.startaudiocontext.txt'));
log('audio: scratch-audio', JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'scratch-audio', 'package.json'))).version);
copyDir(path.join(ROOT, 'node_modules', 'scratch-blocks', 'media'), path.join(ENG, 'media'));
log('blocks: scratch-blocks', PKG.dependencies['scratch-blocks'], '+ blockly', JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'blockly', 'package.json'))).version);

// our runtime + whitelist
fs.copyFileSync(path.join(ROOT, 'src', 'wonderlab.js'), path.join(ENG, 'wonderlab.js'));
fs.copyFileSync(path.join(ROOT, 'src', 'opcodes.json'), path.join(ENG, 'opcodes.json'));

// licences
fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(LIC, 'AGPL-3.0.txt'));
fs.copyFileSync(path.join(ROOT, 'node_modules', 'scratch-blocks', 'LICENSE'), path.join(LIC, 'Apache-2.0.scratch-blocks.txt'));
fs.copyFileSync(path.join(ROOT, 'NOTICE.md'), path.join(LIC, 'NOTICE.md'));
for (const f of fs.readdirSync(BUILD).filter(f => f.startsWith('LICENSE.'))) fs.copyFileSync(path.join(BUILD, f), path.join(LIC, f.replace('LICENSE.', 'upstream-') + '.txt'));

// 4. hash, place, compress
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); }
const h = createHash('sha1');
for (const f of walk(ENG).sort()) { h.update(path.relative(ENG, f)); h.update(fs.readFileSync(f)); }
const ver = h.digest('hex').slice(0, 10), engDir = 'engine-' + ver;
rm(DIST); mkdir(DIST);
fs.renameSync(ENG, path.join(DIST, engDir));
for (const f of ['lab.js', 'lab.css']) fs.copyFileSync(path.join(ROOT, 'src', f), path.join(DIST, f));
const labVer = createHash('sha1').update(fs.readFileSync(path.join(DIST, 'lab.js'))).update(fs.readFileSync(path.join(DIST, 'lab.css'))).digest('hex').slice(0, 10);
const engine = { version: ver, engine: engDir + '/', css: 'lab.css?v=' + labVer, lab: 'lab.js?v=' + labVer,
  scripts: ['scratch-blocks.js', 'scratch-storage.js', 'scratch-render.js', 'scratch-vm.js', 'scratch-audio.js', 'wonderlab.js'],
  upstream: Object.fromEntries(Object.entries(ENGINE).map(([k, v]) => [k, v])), blocks: { 'scratch-blocks': PKG.dependencies['scratch-blocks'] } };
fs.writeFileSync(path.join(DIST, 'engine.json'), JSON.stringify(engine, null, 1));
let raw = 0, gz = 0;
for (const f of walk(DIST)) {
  if (!/\.(js|css|json|svg|txt|md|html)$/.test(f)) continue;
  const b = fs.readFileSync(f), z = zlib.gzipSync(b, { level: 9 });
  raw += b.length; gz += z.length;
  if (b.length > 1024) fs.writeFileSync(f + '.gz', z);
}
log(`dist/${engDir}  raw ${(raw / 1e6).toFixed(2)} MB  gzip ${(gz / 1e6).toFixed(2)} MB  (lab.js/css v=${labVer})`);
rm(BUILD);
