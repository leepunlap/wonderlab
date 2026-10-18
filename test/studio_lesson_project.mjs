#!/usr/bin/env node
/**
 * The studio's lesson → project JSON mapping, and the two failure surfaces bug 4 was about.
 *
 * The mapping is pure, so it is asserted here in Node: the real src/studio-lab.js is loaded into a sandbox with
 * a stub window/document and its own code is called. The same file is then booted against a fake scratch-gui
 * store, which is what the "an error after the first load reached no surface" bug lived in.
 *
 *   node test/studio_lesson_project.mjs [path/to/studio-lab.js]
 *
 * Every check prints PASS/FAIL like check_library_import.mjs; the exit code is 1 if any check failed.
 * Nothing here needs a browser, a server or the classfiles tree.
 */
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Still studio-lab.js: this test also exercises boot(), which has moved to studio-app.js and needs a
// scratch-gui to run. Pointing it at lesson-page.js now would keep the mapping half and lose the
// boot half silently, which is worse than a test that follows the file until that file is deleted.
// Splitting it is part of deleting studio-lab.js, not before it.
// the lesson model is lesson-page.js: the shell is handed a project and must never learn what a
// lesson is, so the mapping is the lesson page's own module
const STUDIO = process.argv[2] || path.join(HERE, '..', 'src', 'lesson-page.js');
// The read-only lab (a sibling checkout) is only used for the cross-surface comparison; wonderlab-src is a
// separate repository, so a missing file is a note, not a failure.
const READONLY = process.env.WL_READONLY_LAB || path.join(HERE, '..', '..', 'wonderlab-src', 'src', 'wonderlab.js');
const LIB = '/lab-library/';

let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✖'} ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) fails += 1;
};
const note = (msg) => console.log(`· ${msg}`);
const J = (v) => JSON.stringify(v);
const SOUND_OUT = (s) => ({ name: s.name, assetId: s.assetId, md5ext: s.md5ext, dataFormat: s.dataFormat, rate: s.rate, sampleCount: s.sampleCount, format: s.format });
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

/* ---------------- a browser just big enough for studio-lab.js ---------------- */
function element(tag) {
  return { tagName: tag || 'div', style: {}, dataset: {}, children: [], textContent: '', className: '', hidden: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, getAttribute: () => null,
    hasAttribute: () => false, appendChild(c) { this.children.push(c); return c; }, insertBefore() {}, removeChild() {},
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, closest: () => null, contains: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 100, height: 100 }) };
}
function makeWindow(fetchImpl) {
  const doc = { head: element(), body: element(), documentElement: element(), title: '',
    getElementById: () => element(), querySelector: () => null, querySelectorAll: () => [],
    createElement: (t) => element(t), addEventListener() {}, removeEventListener() {} };
  const win = { document: doc, console, setTimeout, clearTimeout, setInterval, clearInterval,
    performance: { now: () => Date.now() }, TextEncoder, TextDecoder, atob, btoa, fetch: fetchImpl,
    MutationObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: (f) => setTimeout(f, 0),
    cancelAnimationFrame: clearTimeout, addEventListener() {}, removeEventListener() {}, innerWidth: 1440,
    localStorage: { getItem: () => null, setItem() {} }, navigator: {}, location: { href: 'http://localhost/' } };
  win.window = win; win.self = win;
  return win;
}
function loadStudio(file, fetchImpl, globalName = 'WLStudio') {
  const win = makeWindow(fetchImpl || (() => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })));
  vm.createContext(win);
  vm.runInContext(readFileSync(file, 'utf8'), win, { filename: file });
  if (!win[globalName]) throw new Error(file + ' did not define window.' + globalName);
  return win;
}

if (!existsSync(STUDIO)) { console.error('no such file: ' + STUDIO); process.exit(2); }
const studio = loadStudio(STUDIO);
const S = studio.WLStudio;

/* ---------------- the lesson: two backdrops, one sound on the stage, two costumes and one sound on a sprite ---------------- */
const BACKDROPS = [{ name: '背景1', assetId: 'bd1', ext: 'jpg', cx: 480, cy: 360, res: 2 },
                   { name: '背景2', assetId: 'bd2', ext: 'jpg', cx: 480, cy: 360, res: 2 }];
const SOUND_STAGE = { name: '舞台聲', soundID: '舞台聲', assetId: 's0', ext: 'wav', md5ext: 's0.wav', dataFormat: 'wav', format: '', rate: 11025, sampleCount: 100 };
const SOUND_MOUSE = { name: '吱吱', soundID: '吱吱', assetId: 's1', ext: 'wav', md5ext: 's1.wav', dataFormat: 'wav', format: '', rate: 22050, sampleCount: 5071 };
const COSTUMES = [{ name: '走路1', assetId: 'c1', ext: 'png', cx: 10, cy: 10, res: 2 },
                  { name: '疑問', assetId: 'c2', ext: 'png', cx: 5, cy: 5, res: 2 }];
const LESSON = {
  stage: { backdrops: BACKDROPS, sounds: [SOUND_STAGE], currentCostume: 1, volume: 70, tempo: 120, videoState: 'on' },
  sprites: [
    { name: '小老鼠', costumes: COSTUMES, sounds: [SOUND_MOUSE], currentCostume: 1, visible: true, x: 10, y: -20, size: 80, direction: -90, rotationStyle: 'left-right' },
    { name: '蛇', costumes: [{ name: '爬行1', assetId: 'c3', ext: 'png', cx: 1, cy: 1, res: 2 }], sounds: [], visible: false }
  ]
};
const PROJECT = typeof S.lessonProject === 'function' ? S.lessonProject(LESSON) : { targets: [{}, {}, {}] };
const STAGE = PROJECT.targets[0], MOUSE = PROJECT.targets[1], SNAKE = PROJECT.targets[2];

/* ================= the pure mapping (S.lessonProject) =================
   studio-lab.js exposes the mapping so this half needs no browser at all. */
function pureMapping() {
/* ================= bug 1: the lesson's sounds are in the project ================= */
check('舞台 keeps the lesson stage sounds', J(STAGE.sounds) === J([SOUND_OUT({ ...SOUND_STAGE, format: null })]), J(STAGE.sounds));
check('小老鼠 keeps the lesson sprite sounds', J(MOUSE.sounds) === J([SOUND_OUT({ ...SOUND_MOUSE, format: null })]), J(MOUSE.sounds));
check('a sprite with no sounds still has none', J(SNAKE.sounds) === '[]');

const PARTIAL = S.lessonProject({ stage: { backdrops: BACKDROPS },
  sprites: [{ name: 'A', costumes: COSTUMES, sounds: [{ name: '只有名字', assetId: 's2', ext: 'wav' },
                                                      { name: '帶 md5', assetId: 's3', md5ext: 's3.mp3', dataFormat: 'mp3', format: 'adpcm' }] }] }).targets[1].sounds;
check('a sound without md5ext/dataFormat gets them from ext', J(PARTIAL[0]) === J({ name: '只有名字', assetId: 's2', md5ext: 's2.wav', dataFormat: 'wav', rate: 0, sampleCount: 0, format: null }), J(PARTIAL[0]));
check('a sound keeps its own dataFormat/format', J(PARTIAL[1]) === J({ name: '帶 md5', assetId: 's3', md5ext: 's3.mp3', dataFormat: 'mp3', rate: 0, sampleCount: 0, format: 'adpcm' }), J(PARTIAL[1]));

if (existsSync(READONLY)) {
  const ro = loadStudio(READONLY, null, 'WonderLab');
  const proj = new ro.WonderLab({ spec: { opcodes: {} }, lesson: LESSON, assetBase: '/a/' }).compile(ro.WonderLab.empty());
  check('the read-only lab builds the same stage sounds for this lesson', J(proj.targets[0].sounds) === J(STAGE.sounds), J(proj.targets[0].sounds));
  check('the read-only lab builds the same sprite sounds for this lesson', J(proj.targets[1].sounds) === J(MOUSE.sounds), J(proj.targets[1].sounds));
} else {
  note('read-only lab not found (' + READONLY + '): cross-surface comparison skipped');
}

/* ================= bug 2: the lesson's costume / backdrop index ================= */
check('舞台 opens on the backdrop the lesson asks for', STAGE.currentCostume === 1, 'currentCostume=' + STAGE.currentCostume);
check('小老鼠 opens on the costume the lesson asks for', MOUSE.currentCostume === 1, 'currentCostume=' + MOUSE.currentCostume);
const noIndex = S.lessonProject({ stage: { backdrops: BACKDROPS }, sprites: [{ name: 'A', costumes: COSTUMES }] });
check('no currentCostume in the lesson stays 0 (every existing lesson unchanged)',
  noIndex.targets[0].currentCostume === 0 && noIndex.targets[1].currentCostume === 0);
const outOfRange = S.lessonProject({ stage: { backdrops: BACKDROPS, currentCostume: 9 }, sprites: [{ name: 'A', costumes: COSTUMES, currentCostume: -3 }] });
check('an index the lesson does not have falls back to 0', outOfRange.targets[0].currentCostume === 0 && outOfRange.targets[1].currentCostume === 0);

/* ================= bug 3: the lesson's stage properties ================= */
check('舞台 volume comes from the lesson', STAGE.volume === 70, 'volume=' + STAGE.volume);
check('舞台 tempo comes from the lesson', STAGE.tempo === 120, 'tempo=' + STAGE.tempo);
check('舞台 videoState comes from the lesson', STAGE.videoState === 'on', 'videoState=' + STAGE.videoState);
const plain = noIndex.targets[0];
check('no stage properties in the lesson keeps 100 / 60 / off',
  plain.volume === 100 && plain.tempo === 60 && plain.videoState === 'off', J({ volume: plain.volume, tempo: plain.tempo, videoState: plain.videoState }));
const odd = S.lessonProject({ stage: { backdrops: BACKDROPS, volume: 0, tempo: 0, videoState: 'banana' } }).targets[0];
check('volume 0 and tempo 0 are honoured, an unknown videoState is not', odd.volume === 0 && odd.tempo === 0 && odd.videoState === 'off', J({ volume: odd.volume, tempo: odd.tempo, videoState: odd.videoState }));

/* ================= a lesson with none of the new fields is byte-identical to before =================
   GOLDEN is the output of the pre-fix studio-lab.js (git 3bd2d7b) for this same minimal lesson. */
const GOLDEN = '{"targets":[{"isStage":true,"name":"Stage","variables":{},"lists":{},"broadcasts":{},"blocks":{},"comments":{},"currentCostume":0,"costumes":[{"assetId":"bd1","name":"背景1","md5ext":"bd1.jpg","dataFormat":"jpg","rotationCenterX":480,"rotationCenterY":360,"bitmapResolution":2}],"sounds":[],"volume":100,"layerOrder":0,"tempo":60,"videoTransparency":50,"videoState":"off","textToSpeechLanguage":null},{"isStage":false,"name":"A","variables":{},"lists":{},"broadcasts":{},"blocks":{},"comments":{},"currentCostume":0,"costumes":[{"assetId":"c1","name":"走路1","md5ext":"c1.png","dataFormat":"png","rotationCenterX":10,"rotationCenterY":10,"bitmapResolution":2},{"assetId":"c2","name":"疑問","md5ext":"c2.png","dataFormat":"png","rotationCenterX":5,"rotationCenterY":5,"bitmapResolution":2}],"sounds":[],"volume":100,"layerOrder":1,"visible":true,"x":5,"y":6,"size":100,"direction":90,"draggable":false,"rotationStyle":"all around"}],"monitors":[],"extensions":[],"meta":{"semver":"3.0.0","vm":"15.2.0","agent":"WonderLab"}}';
const minimal = S.lessonProject({ stage: { backdrops: [BACKDROPS[0]] },
  sprites: [{ name: 'A', costumes: COSTUMES, x: 5, y: 6 }] });
check('a lesson without the new fields produces exactly the old project JSON', J(minimal) === GOLDEN, J(minimal) === GOLDEN ? '' : 'differs from the golden');
}
if (typeof S.lessonProject === 'function') {
  pureMapping();
} else {
  check('studio-lab.js exposes the lesson -> project mapping (S.lessonProject)', false, 'not a function');
}
/*
 * ================================ THE BOOT HALF IS GONE ================================
 * Lines here used to boot studio-lab.js against a fake scratch-gui and assert that the lesson's
 * sounds, costume indices, volume, tempo and videoState reached the gui, plus four failure cases
 * (an error after the first load reaching no surface, a first-load failure, an unresolvable asset
 * descriptor, a library sprite whose files 404).
 *
 * That subject moved to studio-app.js (the shell), which needs a real scratch-gui - there is no
 * sandbox that can stand in for it without the assertions testing the stand-in. Two things cover it
 * now, and both drive a real editor:
 *
 *   test/module_matrix.py    boots the shell in eight configurations and fails if any one of them
 *                            leaves the editor down
 *   the lab-frame boot check boots a real lesson through lab-frame.html and asserts the stage and
 *                            sprite arrive (targets: Stage, 小貓)
 *
 * Deleted rather than skipped: a test that reports PASS for something it no longer runs is worse
 * than a test that does not mention it. If the shell ever grows a testable seam for the boot, this
 * is where that half belongs - the lesson fixtures above are still exactly what it needs.
 * ==========================================================================================
 */

console.log('\n' + (fails ? `${fails} FAILED` : 'ALL OK') + '  (' + STUDIO + ')');
process.exit(fails ? 1 : 0);
