#!/usr/bin/env node
/**
 * The guide's invariants, checked before a browser has to discover them.
 *
 * The guide is content (studio-guide-topics.js), words (three locale files) and opcodes
 * (opcodes.json) that only meet at run time: a step whose opcode is not whitelisted, a sprite ref
 * with no name, or a topic with no title shows up as a demonstration that quietly does nothing —
 * the worst possible failure for something whose whole job is to show a student that it works.
 *
 *   node tools/check_guide.mjs
 *
 * Exit 0 = every step can be built and every word exists in every language; 1 = something is missing.
 * Sets WONDERLAB_SRC / IITS_LESSONS_SRC is NOT needed: this only reads this checkout.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describeMisread, findMisread } from './pronunciation.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', 'src');
const LOCALES = [['zh-Hant', 'studio-locale.zh-Hant.js'], ['zh-Hans', 'studio-locale.zh-Hans.js'], ['en', 'studio-locale.en.js']];

const sandbox = { console };
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);

function load(file) { vm.runInContext(readFileSync(join(SRC, file), 'utf8'), ctx, { filename: file }); }

/* collect what each locale file registers, without needing the registry to work */
const dicts = {};
sandbox.StudioI18n = {
  register(id, label, dict) { dicts[id] = dict; },
  t(k) { return k; },
  available() { return []; },
  on() { return () => {}; },
  locale() { return 'zh-Hant'; }
};
for (const [, file] of LOCALES) load(file);
load('studio-guide-topics.js');
load('studio-guide-lessons.js');
load('studio-guide-refs.js');

/* Three shelves in one course: the lessons, the cards, and the basics. They are checked as one
   list because they are checked by the same rules — only the shelf they sit on differs. */
const topics = [].concat(sandbox.StudioGuideLessons || [], sandbox.StudioGuideRefs || [], sandbox.StudioGuideTopics || []);
const spec = JSON.parse(readFileSync(join(SRC, 'opcodes.json'), 'utf8')).opcodes;
/* The picture follows the sentences, so the sentences have to exist: the gate that starts a ring or
   a press fires on a cue, and a body with no cue track has no beat to fire on, in that language. */
const VOICE = JSON.parse(readFileSync(join(SRC, 'assets/voice/manifest.json'), 'utf8'));
/* Mirrors REGION in src/studio-guide-marks.js: the names a mark may be anchored to. Kept in step with
   that table by hand — a name the table does not have is a mark that is never drawn, which is why the
   check exists. */
const REGIONS = new Set(['flag', 'stage', 'sprites', 'palette', 'flyout', 'flyout:first', 'workspace', 'toolbar',
  'addSprite', 'addBackdrop', 'library', 'stop', 'stageSize', 'stageHeader', 'tabs', 'spriteInfo',
  'spriteX', 'spriteY', 'chatTabs']);
const SHAPES = new Set(['square', 'circle']);
const KINDS = new Set(['lesson', 'ref', 'basic']);
/* The library is outside this repo, so a missing file is a skip, not a failure: what it guards is
   "the demonstration asks for an actor the library does not have", which cannot be checked offline. */
let LIB_NAMES = null;
try {
  const LIBRARY = JSON.parse(readFileSync(resolve(SRC, '..', '..', '..', 'local-lab', 'lab-library', 'library.json'), 'utf8'));
  LIB_NAMES = new Set([...(LIBRARY.sprites || []), ...(LIBRARY.backdrops || [])].map((e) => e.name));
} catch (e) { LIB_NAMES = null; }

let failures = 0;
const check = (what, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}${ok || !detail ? '' : '   ' + detail}`);
  if (!ok) failures++;
};
const has = (locale, key) => Object.prototype.hasOwnProperty.call(dicts[locale] || {}, key);

console.log(`guide: ${topics.length} topics, ${topics.reduce((n, t) => n + (t.steps || []).length, 0)} steps`);

check('the topics file loads', topics.length > 0);
check('every locale registered a dictionary', LOCALES.every(([id]) => !!dicts[id]),
  LOCALES.filter(([id]) => !dicts[id]).map(([id]) => id).join(', '));

/* keys each locale must have, built from the structure rather than listed by hand */
const required = new Set(['guide.intro', 'guide.stepCount', 'guide.back', 'guide.steps', 'guide.stepN',
  'guide.stepOf', 'guide.demo', 'guide.replay', 'guide.running', 'guide.starting', 'guide.progress',
  'guide.failed', 'guide.notReady', 'guide.practice', 'guide.prev', 'guide.next', 'guide.nextTopic',
  'guide.demoHolding', 'guide.stop', 'guide.restore', 'guide.narrating', 'guide.showing',
  'guide.mode', 'guide.mode.new', 'guide.mode.pro',
  'guide.section.lesson', 'guide.section.ref', 'guide.section.basic',
  'chat.tabs', 'chat.tab.chat', 'chat.tab.guide']);

const seenTopic = new Set();
for (const t of topics) {
  check(`topic ${t.id} has a unique id`, !seenTopic.has(t.id));
  seenTopic.add(t.id);
  check(`topic ${t.id} sits on a known shelf`, KINDS.has(t.kind || 'basic'), String(t.kind));
  ['title', 'intro'].forEach((k) => required.add(`guide.${t.id}.${k}`));
  /* a lesson or a card may carry a `sub` (which lesson it is) and a `tip` (what to watch for);
     they are optional in structure, but once written they must exist in every language. */
  for (const [id] of LOCALES) {
    for (const extra of ['sub', 'tip']) if (has(id, `guide.${t.id}.${extra}`)) required.add(`guide.${t.id}.${extra}`);
  }

  const steps = t.steps || [];
  check(`topic ${t.id} has steps`, steps.length > 0);
  const seenStep = new Set();
  for (const s of steps) {
    check(`  step ${t.id}/${s.id} has a unique id`, !seenStep.has(s.id));
    seenStep.add(s.id);
    ['title', 'body'].forEach((k) => required.add(`guide.${t.id}.${s.id}.${k}`));

    const d = s.demo;
    if (!d) continue;

    const scripts = d.scripts || [];
    for (const sc of scripts) {
      check(`  ${t.id}/${s.id} script ${sc.id} has a target`, !!sc.sprite, 'no sprite');
      if (typeof sc.sprite === 'string' && sc.sprite.startsWith('@')) required.add(`guide.sprite.${sc.sprite.slice(1)}`);
      const walk = (list) => {
        for (const b of list || []) {
          if (!b || !b.op) { check(`  ${t.id}/${s.id} block has an opcode`, false, JSON.stringify(b)); continue; }
          check(`  ${t.id}/${s.id} ${b.op} is whitelisted`, !!spec[b.op]);
          for (const [k, v] of Object.entries(b)) {
            if (Array.isArray(v)) walk(v);
            else if (v && typeof v === 'object' && v.op) walk([v]);
            else if (v && typeof v === 'object' && v.k) required.add(v.k);
          }
        }
      };
      walk(sc.blocks || []);
      check(`  ${t.id}/${s.id} script ${sc.id} is not empty`, (sc.blocks || []).length > 0);
    }

    /* the imports: an actor or a backdrop brought in from the library, which is the whole of a
       "from scratch" step. A name the library does not have fails silently at run time — the sprite
       simply never arrives — so it is checked here instead. */
    for (const a of d.add || []) {
      check(`  ${t.id}/${s.id} import is add_sprite or add_backdrop`,
        a['do'] === 'add_sprite' || a['do'] === 'add_backdrop', String(a['do']));
      check(`  ${t.id}/${s.id} import names something`, !!a.name, JSON.stringify(a));
      if (LIB_NAMES) check(`  ${t.id}/${s.id} import ${a.name} is in the library`, LIB_NAMES.has(a.name), String(a.name));
      if (a.sprite && String(a.sprite).startsWith('@')) required.add(`guide.sprite.${String(a.sprite).slice(1)}`);
    }

    if (d.focus) check(`  ${t.id}/${s.id} focus is a sprite ref`, String(d.focus).startsWith('@'), String(d.focus));
    for (const sp of (d.project && d.project.sprites) || []) {
      if (sp.ref) required.add(`guide.sprite.${String(sp.ref).slice(1)}`);
    }
    /* A lesson that starts from nothing has an empty project on purpose; every other step needs an
       actor to build on. */
    check(`  ${t.id}/${s.id} project has a sprite`,
      !d.project || d.project.empty === true || (d.project.sprites || []).length > 0, 'no sprites and not empty');
    if (d.point) {
      check(`  ${t.id}/${s.id} points at a known region`, REGIONS.has(d.point), d.point);
      required.add(`guide.point.${d.point}`);
    }

    /* the marks: a shape, a place, and a word. A mark whose anchor is misspelt is simply not drawn,
       which is the same failure as a demonstration that does nothing - silence. */
    for (const m of d.annotate || []) {
      check(`  ${t.id}/${s.id} mark ${m.shape} is a ring or a box`, SHAPES.has(m.shape), String(m.shape));
      if (m.when) check(`  ${t.id}/${s.id} mark is said or built`, m.when === 'say' || m.when === 'built', String(m.when));
      /* a mark may ask to appear on a later sentence (`cue`), because the copy names the tile in the
         second one and a ring that is already there when the student looks is not pointing */
      if (m.cue != null) {
        check(`  ${t.id}/${s.id} mark cue is a sentence index`,
          Number.isInteger(m.cue) && m.cue >= 0, String(m.cue));
      }
      check(`  ${t.id}/${s.id} ${m.shape} has somewhere to go`, !!m.at);
      for (const anchor of [m.at]) {
        if (!anchor) continue;
        if (String(anchor).startsWith('field:')) {
          const [op, field] = String(anchor).slice(6).split('/');
          check(`  ${t.id}/${s.id} mark field ${op}.${field} exists`, !!op && !!field && !!spec[op], String(anchor));
        } else if (!REGIONS.has(anchor) && !/^[.[#]/.test(String(anchor))) {
          check(`  ${t.id}/${s.id} mark anchor ${anchor} is known`, false, 'not a region, a field: or a selector');
        }
      }
      if (m.label) required.add(m.label);
    }
  }
  /* a reader in 熟手 mode sees the steps that are not `basic`: a lesson made only of imports would
     vanish for them, which is the one way this feature can lose a lesson entirely. */
  check(`topic ${t.id} still has steps in 熟手 mode`, steps.some((s) => !s.basic));
}

/* every required key, in every language */
for (const [id] of LOCALES) {
  const missing = [...required].filter((k) => !has(id, k));
  check(`${id}: every word the guide asks for exists`, missing.length === 0, missing.slice(0, 8).join(', '));
}

/* The clock the picture follows is made of the clips' own cue tracks: one entry per sentence, each
   with the millisecond it begins. A body with no clip, or a clip with no sentence, leaves the
   demonstration with nothing to wait for and it runs after the paragraph again. */
for (const [id] of LOCALES) {
  const bad = [];
  let sentences = 0, steps = 0;
  for (const t of topics) {
    for (const s of t.steps || []) {
      /* The heading is spoken too, and it is spoken as sentences of its own: the card shows the
         sentence being said, so the sentences have to be the ones the card is made of. */
      for (const part of ['title', 'body']) {
        const key = `guide.${t.id}.${s.id}.${part}`;
        const clip = VOICE.clips[`${key}|${id}`];
        if (!clip) { bad.push(`${t.id}/${s.id}: no clip for the ${part}`); continue; }
        const cues = (clip.cues || []).slice().sort((a, b) => a.t - b.t);
        if (!cues.length) { bad.push(`${t.id}/${s.id}: one long unreachable sentence`); continue; }
        if (part === 'body') {
          steps++;
          sentences += cues.length;
          if (cues[0].t >= clip.ms) bad.push(`${t.id}/${s.id}: first sentence starts after the clip ends`);
        }
        /* the sentences the voice speaks and the line on the card have to be the same words: the
           card is split along them, and a line the voice says differently cannot be highlighted */
        const said = cues.map((c) => c.s || '').join('').replace(/\s+/g, '');
        const line = String((dicts[id] || {})[key] || '').trim().replace(/\s+/g, '');
        if (said !== line) {
          bad.push(`${t.id}/${s.id} ${part}: the voice's sentences do not add up to the line`);
        }
      }
    }
  }
  check(`${id}: every step's body is spoken in sentences the picture can follow`, bad.length === 0,
    bad.slice(0, 6).join('; '));
  if (!bad.length) console.log(`        ${sentences} sentences across ${steps} steps, ${(sentences / steps).toFixed(1)} per step`);
}

/* and nothing beyond: a key added to one language and forgotten in another drifts silently */
const all = new Set();
for (const [id] of LOCALES) Object.keys(dicts[id] || {}).forEach((k) => all.add(k));
for (const [id] of LOCALES) {
  const extra = [...all].filter((k) => !has(id, k));
  check(`${id}: no key is missing relative to the other languages`, extra.length === 0, extra.slice(0, 8).join(', '));
}

/* What is read aloud is the only part of the copy no other check can see: the words are there, the
   key exists, and then the voice says the wrong character. See tools/pronunciation.mjs. */
for (const [id] of LOCALES) {
  const spoken = (dicts[id] || {});
  const hits = findMisread(spoken, id);
  check(`${id}: nothing the voice reads is known to be read wrong`, hits.length === 0,
    '\n' + describeMisread(id, hits).join('\n'));
}

console.log(failures ? `\n${failures} check(s) failed` : '\nthe guide is consistent: structure, words and opcodes all line up');
process.exit(failures ? 1 : 0);
