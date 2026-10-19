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

const topics = sandbox.StudioGuideTopics || [];
const spec = JSON.parse(readFileSync(join(SRC, 'opcodes.json'), 'utf8')).opcodes;
const REGIONS = new Set(['flag', 'stage', 'sprites', 'palette', 'flyout', 'flyout:first', 'workspace', 'toolbar']);
const SHAPES = new Set(['square', 'circle', 'arrow']);

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
  'chat.tabs', 'chat.tab.chat', 'chat.tab.guide']);

const seenTopic = new Set();
for (const t of topics) {
  check(`topic ${t.id} has a unique id`, !seenTopic.has(t.id));
  seenTopic.add(t.id);
  ['title', 'intro'].forEach((k) => required.add(`guide.${t.id}.${k}`));

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

    if (d.focus) check(`  ${t.id}/${s.id} focus is a sprite ref`, String(d.focus).startsWith('@'), String(d.focus));
    for (const sp of (d.project && d.project.sprites) || []) {
      if (sp.ref) required.add(`guide.sprite.${String(sp.ref).slice(1)}`);
    }
    check(`  ${t.id}/${s.id} project has a sprite`, !d.project || (d.project.sprites || []).length > 0);
    if (d.point) {
      check(`  ${t.id}/${s.id} points at a known region`, REGIONS.has(d.point), d.point);
      required.add(`guide.point.${d.point}`);
    }

    /* the marks: a shape, a place, and a word. A mark whose anchor is misspelt is simply not drawn,
       which is the same failure as a demonstration that does nothing - silence. */
    for (const m of d.annotate || []) {
      check(`  ${t.id}/${s.id} mark ${m.shape} is one of three shapes`, SHAPES.has(m.shape), String(m.shape));
      if (m.when) check(`  ${t.id}/${s.id} mark is said or built`, m.when === 'say' || m.when === 'built', String(m.when));
      if (m.shape === 'arrow') {
        check(`  ${t.id}/${s.id} arrow has a from and a to`, !!m.from && !!m.to);
      } else {
        check(`  ${t.id}/${s.id} ${m.shape} has somewhere to go`, !!m.at);
      }
      for (const anchor of [m.from, m.to, m.at]) {
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
}

/* every required key, in every language */
for (const [id] of LOCALES) {
  const missing = [...required].filter((k) => !has(id, k));
  check(`${id}: every word the guide asks for exists`, missing.length === 0, missing.slice(0, 8).join(', '));
}

/* and nothing beyond: a key added to one language and forgotten in another drifts silently */
const all = new Set();
for (const [id] of LOCALES) Object.keys(dicts[id] || {}).forEach((k) => all.add(k));
for (const [id] of LOCALES) {
  const extra = [...all].filter((k) => !has(id, k));
  check(`${id}: no key is missing relative to the other languages`, extra.length === 0, extra.slice(0, 8).join(', '));
}

console.log(failures ? `\n${failures} check(s) failed` : '\nthe guide is consistent: structure, words and opcodes all line up');
process.exit(failures ? 1 : 0);
