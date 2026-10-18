#!/usr/bin/env node
// Wonder Lab Studio build for the L4 lesson pages (dual mode). Copyright (C) 2026 IITS. AGPL-3.0-only (see LICENSE).
//
//   npm ci && npm run build        ->  dist/studio.json + dist/studio-<hash>/   (build_wonder_lab.py copies it with WONDERLAB_STUDIO=1)
//
// 1. our page + scripts from src/ (lab-frame.html, studio-lab.js/css, studio-ops.js, studio-trace.js, studio-anim.js when present)
// 2. the published @scratch/scratch-gui 15.2.0 standalone bundle, with ONE change: webpack's fixed publicPath "/" becomes the
//    folder of the loading script, so chunks, workers and static files load next to it (a notice of the change heads the file)
// 3. only the files the editor fetches at run time: the storage fetch worker, the paint editor chunks and resources, the
//    blocks media, the debug-modal icons. Not copied: tutorials, library images, extension art, MediaPipe, source maps.
// 4. the folder is named studio-<content hash> (immutable; production nginx caches /assets/lab/(engine|studio)-<hex>/ for a
//    year from the dual-mode deploy on), .gz siblings for gzip_static
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src'), GUI = path.join(ROOT, 'node_modules', '@scratch', 'scratch-gui');
const DIST = path.join(ROOT, 'dist'), BUILD = path.join(ROOT, 'build');
const log = (...a) => console.log('[studio-build]', ...a);
const rm = p => fs.rmSync(p, { recursive: true, force: true });
const mkdir = p => fs.mkdirSync(p, { recursive: true });
function copy(src, dst) { mkdir(path.dirname(dst)); fs.copyFileSync(src, dst); }
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]); }
const noMap = code => code.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n');

const guiPkg = JSON.parse(fs.readFileSync(path.join(GUI, 'package.json'), 'utf8'));
if (guiPkg.version !== '15.2.0') throw new Error('expected @scratch/scratch-gui 15.2.0, found ' + guiPkg.version + ' (npm ci)');
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8')).packages['node_modules/@scratch/scratch-gui'] || {};
const DISTGUI = path.join(GUI, 'dist');

rm(BUILD); const ENG = path.join(BUILD, 'engine'); mkdir(ENG);

// 1. our files
const anim = fs.existsSync(path.join(SRC, 'studio-anim.js'));
let page = fs.readFileSync(path.join(SRC, 'lab-frame.html'), 'utf8');
// studio-anim.js (package ANIM) loads before studio-lab.js (its 跳過動畫 capture listener before the lock's); without it, no tag
page = page.replace('<!--wl-anim-->', anim ? '<script src="studio-anim.js"></script>' : '');
if (!anim) page = page.replace(/\s*<script src="studio-anim\.js"><\/script>/, '');
// studio-anim.js must load before the shell: the file it used to be checked against (studio-lab.js) is
// gone, and indexOf on a missing name is -1, so the old guard threw for every anim build.
if (anim && page.indexOf('studio-anim.js') > page.indexOf('studio-app.js')) throw new Error('studio-anim.js must load before studio-app.js');
fs.writeFileSync(path.join(ENG, 'lab-frame.html'), page);
// The editor is studio-app.js (the shell) and everything below is a module it mounts. studio-lab.js
// is NOT here any more: lab-frame.html binds the lesson page through lesson-frame.js instead, and
// copying a file nothing loads only invites someone to edit it.
for (const f of ['studio-lab.css',
                    // the shell and its modules, in the order lab-frame.html loads them
                    'studio-core.js', 'studio-assist.js', 'studio-app.js',
                    // the lesson page's own: the pure model and its binder
                    'lesson-page.js', 'lesson-frame.js',
                    'studio-ops.js', 'studio-trace.js', 'ucmake-blocks.js', 'opcodes.json',
                    // the controller connection: our own modules, so the editor is self-contained
                    'ucmake-connect.js', 'ucmake/firmata.js', 'ucmake/ucmake_cli.js', 'ucmake/stk500.js'].concat(anim ? ['studio-anim.js'] : []))
  copy(path.join(SRC, f), path.join(ENG, f));
for (const f of ['logo.svg', 'blank.svg', 'icon-paint.svg', 'favicon.svg']) copy(path.join(SRC, 'assets', f), path.join(ENG, 'assets', f));

// 2. the editor bundle: publicPath "/" -> the folder of this script (computed once, when the script runs)
const MAIN = 'scratch-gui-standalone.js';
let code = fs.readFileSync(path.join(DISTGUI, MAIN), 'utf8');
const re = /(__webpack_require__|__nested_webpack_require_\d+__)\.p="\/"/g, hits = code.match(re) || [];
if (hits.length !== 2) throw new Error(`${MAIN}: expected 2 webpack publicPath "/" assignments, found ${hits.length}`);
const BASE = 'var __wlStudioBase=(function(){try{var s=document.currentScript&&document.currentScript.src;return s?s.slice(0,s.lastIndexOf("/")+1):"/"}catch(e){return"/"}})();\n';
code = "/*! Modified by IITS 2026-10-07: webpack publicPath set to the loading script's folder (wonderlab-studio tools/build.mjs). AGPL-3.0-only. */\n" +
  BASE + noMap(code.replace(re, (m, v) => v + '.p=__wlStudioBase'));
fs.writeFileSync(path.join(ENG, MAIN), code);
copy(path.join(DISTGUI, MAIN + '.LICENSE.txt'), path.join(ENG, MAIN + '.LICENSE.txt'));

// 3. run-time files the bundle names
const chunkMap = /__webpack_require__\.u=e=>"chunks\/"\+\(\{([^}]*)\}\[e\]\|\|e\)\+"\."\+\{([^}]*)\}/.exec(code);
if (!chunkMap) throw new Error('chunk map not found');
const names = Object.fromEntries(chunkMap[1].split(',').map(x => x.split(':')).map(([k, v]) => [k, v.replace(/"/g, '')]));
const hashes = Object.fromEntries(chunkMap[2].split(',').map(x => x.split(':')).map(([k, v]) => [k, v.replace(/"/g, '')]));
const chunks = Object.keys(hashes).map(k => (names[k] || k) + '.' + hashes[k] + '.js').filter(f => !/-steps\./.test(f));   // tutorial steps: hidden
for (const m of code.matchAll(/"chunks\/(fetch-worker\.[0-9a-f]+\.js)"/g)) chunks.push(m[1]);
for (const f of [...new Set(chunks)]) {
  const src = path.join(DISTGUI, 'chunks', f);
  if (!fs.existsSync(src)) throw new Error('missing chunk ' + f);
  mkdir(path.join(ENG, 'chunks'));
  fs.writeFileSync(path.join(ENG, 'chunks', f), noMap(fs.readFileSync(src, 'utf8')));
}
const chunkCode = [...new Set(chunks)].map(f => fs.readFileSync(path.join(DISTGUI, 'chunks', f), 'utf8')).join('\n');
const statics = [...new Set([...(code + chunkCode).matchAll(/"static\/assets\/([^"?]+)(\?resource)?"/g)].map(m => m[1]))]
  .filter(f => /\.js$/.test(f) || /^icon--[a-z-]+\.[0-9a-f]+\.svg$/.test(f) ||
               /^unsupported\.[0-9a-f]+\.png$/.test(f));       // paint-editor resources, debug-modal icons, browser-not-supported image
// The filter is deliberately narrow: the bundle also names the ~152 tutorial step images, the library art and the
// extension art, and none of those are shipped (see the header). The browser-not-supported image was the one
// run-time file this filter dropped by accident - the 「你的瀏覽器不支援 WebGL」 dialog then fetched a 404.
for (const f of statics) {
  const src = path.join(DISTGUI, 'static', 'assets', f);
  if (!fs.existsSync(src)) throw new Error(`${MAIN} asks for static/assets/${f} and the gui dist does not have it`);
  copy(src, path.join(ENG, 'static', 'assets', f));
  if (fs.existsSync(path.join(DISTGUI, 'static', 'assets', f + '.LICENSE.txt'))) copy(path.join(DISTGUI, 'static', 'assets', f + '.LICENSE.txt'), path.join(ENG, 'static', 'assets', f + '.LICENSE.txt'));
}
for (const f of walk(path.join(DISTGUI, 'static', 'blocks-media'))) copy(f, path.join(ENG, 'static', 'blocks-media', path.relative(path.join(DISTGUI, 'static', 'blocks-media'), f)));

// The gui's OWN default-project assets. Two of these are asked for by BARE md5ext at run time
// rather than by a static/assets/ path, so the filter above never sees them and they were never
// shipped. cd21514d0531fdffb22204e0ec5ed84a.svg is the blank costume the sprite pane's 繪畫 and
// 選個角色 actions build a new sprite from - without it vm.addSprite() rejects, the gui's
// .then() has no .catch, and the button does nothing at all, silently. Measured: the costume
// was absent from the deploy and the click produced no request, no editor and no error.
const DEFAULTSRC = path.join(GUI, 'src', 'lib', 'default-project');
const DEFAULTS = fs.readdirSync(DEFAULTSRC).filter(f => /\.(svg|wav|png)$/i.test(f));
mkdir(path.join(ENG, 'defaults'));
for (const f of DEFAULTS) copy(path.join(DEFAULTSRC, f), path.join(ENG, 'defaults', f));

// licences
const LIC = path.join(ENG, 'LICENSES'); mkdir(LIC);
fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(LIC, 'AGPL-3.0.txt'));
fs.copyFileSync(path.join(GUI, 'LICENSE'), path.join(LIC, 'upstream-scratch-gui.txt'));
fs.copyFileSync(path.join(ROOT, 'NOTICE.md'), path.join(LIC, 'NOTICE.md'));

// 4. hash, place, compress
const h = createHash('sha1');
for (const f of walk(ENG).sort()) { h.update(path.relative(ENG, f)); h.update(fs.readFileSync(f)); }
const ver = h.digest('hex').slice(0, 10), dir = 'studio-' + ver;
rm(DIST); mkdir(DIST);
fs.renameSync(ENG, path.join(DIST, dir));
let raw = 0, gz = 0, n = 0;
for (const f of walk(path.join(DIST, dir))) {
  n += 1;
  if (!/\.(js|css|json|svg|txt|md|html)$/.test(f)) { raw += fs.statSync(f).size; continue; }
  const b = fs.readFileSync(f), z = zlib.gzipSync(b, { level: 9 });
  raw += b.length; gz += z.length;
  if (b.length > 1024) fs.writeFileSync(f + '.gz', z);
}
const info = { version: ver, dir: dir + '/', page: 'lab-frame.html', anim, files: n,
  upstream: { '@scratch/scratch-gui': { version: guiPkg.version, resolved: lock.resolved || null, integrity: lock.integrity || null,
    gitHead: guiPkg.gitHead || (JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).wonderlab || {}).scratchGuiGitHead || null } },
  bytes: { raw, gzip_text: gz } };
fs.writeFileSync(path.join(DIST, 'studio.json'), JSON.stringify(info, null, 1));
rm(BUILD);
log(`dist/${dir}  ${n} files, raw ${(raw / 1e6).toFixed(2)} MB, text gzip ${(gz / 1e6).toFixed(2)} MB, studio-anim.js ${anim ? 'included' : 'not present'}`);
