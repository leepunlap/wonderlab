#!/usr/bin/env node
/**
 * What the guide *says* against what the guide *does*.
 *
 * Every other check in this repo looks at one side of a step: check_guide asks whether a step can be
 * built and whether its words exist, check_pace asks whether the picture has time to finish. Neither
 * reads the sentence. So a step whose copy promises "the pointer drags two blocks out" and whose
 * demonstration builds five passes every check and ships — which is exactly what happened on the
 * first page of the Tutorial, and a teacher looking at the screen is the one who finds it.
 *
 *   node tools/check_claims.mjs
 *
 * WHAT COUNTS AS A CLAIM
 * Only a sentence a reader could hold the screen to. "兩塊積木" is a count; "第二塊" is an ordinal,
 * "幾塊" is neither. A sentence listing the contents of a block family is a taxonomy, not a
 * demonstration, so the action rules below only fire when the copy says something is about to happen
 * in front of the reader (`示範`, `睇住`, `做畀你睇`, `watch`, `the pointer`). A false alarm is worse
 * than a missing rule, because a checker people switch off checks nothing.
 *
 * Exit 0 = every claim matches the demonstration; 1 = a sentence and a screen disagree.
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
const load = (f) => vm.runInContext(readFileSync(join(SRC, f), 'utf8'), ctx, { filename: f });

const dicts = {};
sandbox.StudioI18n = {
  register(id, label, dict) { dicts[id] = dict; },
  t(k) { return k; },
  available() { return []; },
  on() { return () => {}; },
  locale() { return 'zh-Hant'; }
};
for (const [, f] of LOCALES) load(f);
load('studio-guide-topics.js');
load('studio-guide-lessons.js');
load('studio-guide-refs.js');

const topics = [].concat(sandbox.StudioGuideLessons || [], sandbox.StudioGuideRefs || [], sandbox.StudioGuideTopics || []);

/* ---------- what a demonstration actually does ---------- */
const NUMERALS = { 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const toNumber = (s) => (NUMERALS[s] != null ? NUMERALS[s] : Number(s));

/** Every opcode in a script, substacks included: a "makes a sound" claim is about the program, not
    about the top level of the stack. */
function ops(blocks, into) {
  const out = into || [];
  (blocks || []).forEach((b) => {
    if (!b || !b.op) return;
    out.push(b.op);
    Object.keys(b).forEach((k) => { if (Array.isArray(b[k])) ops(b[k], out); });
  });
  return out;
}
const hasOp = (list, p) => list.some((o) => o === p || o.indexOf(p) === 0);

/**
 * The state each script ends in: a step may list one script twice, the second entry being the same
 * stack grown on a later sentence (`cue`). Counting both would count the shared blocks twice, and
 * the copy's "two blocks, then three more" would be held against seven.
 */
function lastState(scripts) {
  const out = [];
  (scripts || []).forEach((s) => {
    const i = out.findIndex((o) => o.sprite === s.sprite && o.id === s.id);
    if (i >= 0) out[i] = s; else out.push(s);
  });
  return out;
}

/**
 * The names the sprites carry on the stage in this step, in this language. A step that rings the
 * sprite list while saying "the cat, the dog" is describing a stage the student is not looking at,
 * and no amount of correct timing makes that true.
 */
function spriteName(dict, ref) {
  if (!ref) return null;
  const key = 'guide.sprite.' + String(ref).replace(/^@/, '');
  return dict[key] || null;
}

function facts(demo, dict, locale) {
  const f = { blocks: 0, ops: [], sprites: 0, runs: false, stops: false, movesteps: null,
    names: [], known: {}, refs: [], onStage: false, locale: locale };
  /* every name the guide can put on a sprite, so a sentence naming one can be held to the stage */
  Object.keys(dict || {}).forEach((k) => {
    if (k.indexOf('guide.sprite.') !== 0) return;
    const name = String(dict[k] || '').trim();
    if (name) f.known[name] = k;
  });
  if (!demo) return f;
  lastState(demo.scripts).forEach((s) => {
    const list = ops(s.blocks);
    f.blocks += list.length;
    list.forEach((o) => f.ops.push(o));
    (s.blocks || []).forEach((b) => { if (b && b.op === 'motion_movesteps' && b.STEPS != null) f.movesteps = Number(b.STEPS); });
  });
  const seeded = ((demo.project && demo.project.sprites) || []);
  const added = (demo.add || []).filter((a) => a && a.do === 'add_sprite');
  f.sprites = seeded.length + added.length;
  seeded.concat(added).forEach((s) => {
    const ref = String(s.ref || s.sprite || '').replace(/^@/, '');
    if (ref && f.refs.indexOf(ref) < 0) f.refs.push(ref);
    const n = spriteName(dict, s.ref || s.sprite);
    if (n && f.names.indexOf(n) < 0) f.names.push(n);
  });
  f.onStage = f.refs.length > 0;
  f.runs = Number(demo.run) > 0 || !!demo.keys;
  f.stops = demo.stop === true;
  return f;
}

/* ---------- what a sentence claims ---------- */
/* "something is about to happen here" — without this, naming a block ("外觀管變大細") reads as a
   promise that a sprite grows. */
const GATE = /示範|示范|睇住|睇吓|做畀你睇|做给你看|做到你睇|指標|指标|撳落|拖去|watch|the pointer|demonstrat/i;
/* a press, as an act rather than a label: "紅色停止掣" names it, "撳紅掣" uses it */
const pressNear = (t, word) => new RegExp(`(?:撳|按|按下|click|press)[^。；;\\n]{0,10}(?:${word})|(?:${word})[^。；;\\n]{0,6}(?:撳|按|press|click)`, 'i').test(t);
/* "…所以撳綠旗都未會郁" — the claim is that nothing happens, which the demonstration can satisfy */
const NEGATED = /(?:唔|不|未|沒|没)[會会動动郁]|不會|won't|doesn't|does not|will not/i;

/* Sprite names that are ordinary nouns before they are cast members: 起點 is where a program starts
   long before it is a sprite, and "係程式嘅起點" is not a claim about the stage. Held by key, not by
   word, so one list covers all three languages. */
const GENERIC = new Set(['start', 'goal', 'warp', 'food', 'berry', 'power', 'sun', 'drop', 'bolt',
  'firework', 'gift', 'tube', 'face', 'key']);

/**
 * The words a sentence can use for an actor, which are not always the sprite's own name: the sprite
 * is 小貓 and the sentence says 貓. Keyed like the sprite dictionary, because what decides whether
 * the word is true is which sprite is on the stage, not how the sentence spells it.
 *
 * `dog` is here with no sprite behind it, on purpose: a sentence naming a dog is a sentence about a
 * cast that does not exist in this course at all, and that is the falsehood this list exists for.
 */
const CAST = {
  cat: { 'zh-Hant': ['貓'], 'zh-Hans': ['猫'], en: ['cat', 'kitten'] },
  dog: { 'zh-Hant': ['狗'], 'zh-Hans': ['狗'], en: ['dog'] },
  mouse: { 'zh-Hant': ['老鼠'], 'zh-Hans': ['老鼠'], en: ['mouse'] },
  rabbit: { 'zh-Hant': ['兔'], 'zh-Hans': ['兔'], en: ['rabbit'] },
  chick: { 'zh-Hant': ['雞'], 'zh-Hans': ['鸡'], en: ['chicken', 'chick'] },
  fish: { 'zh-Hant': ['魚'], 'zh-Hans': ['鱼'], en: ['fish'] },
  elephant: { 'zh-Hant': ['大象', '小象'], 'zh-Hans': ['大象', '小象'], en: ['elephant'] },
  giraffe: { 'zh-Hant': ['長頸鹿'], 'zh-Hans': ['长颈鹿'], en: ['giraffe'] },
  snake: { 'zh-Hant': ['蛇'], 'zh-Hans': ['蛇'], en: ['snake'] },
  butterfly: { 'zh-Hant': ['蝴蝶'], 'zh-Hans': ['蝴蝶'], en: ['butterfly'] },
  dove: { 'zh-Hant': ['白鴿'], 'zh-Hans': ['白鸽'], en: ['dove'] },
  slime: { 'zh-Hant': ['史萊姆'], 'zh-Hans': ['史莱姆'], en: ['slime'] },
  boy: { 'zh-Hant': ['小男孩'], 'zh-Hans': ['小男孩'], en: ['boy'] },
  girl: { 'zh-Hant': ['小女孩'], 'zh-Hans': ['小女孩'], en: ['girl'] },
  tree: { 'zh-Hant': ['小樹'], 'zh-Hans': ['小树'], en: ['tree'] }
};

/* The cat that is not an actor: the Add-Sprite button really is drawn as one, so "the cat icon" is
   the only honest way to tell a beginner which button to press. Those words are taken out first. */
const NOT_A_CAST = {
  'zh-Hant': [/貓仔圖案/g, /貓形圖案/g, /貓圖案/g],
  'zh-Hans': [/猫形/g, /猫图标/g, /猫图案/g],
  /* "the mouse position" is the pointer, not the actor, and "cat" is inside "indicate" */
  en: [/cat icon/gi, /\bmouse (?:position|pointer)\b/gi]
};

/** Latin words are matched as words: "cat" inside "indicate" is not a cast member either. */
const says = (text, w) => (/^[a-z]+$/i.test(w)
  ? new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text)
  : text.indexOf(w) >= 0);

const CLAIMS = [
  {
    id: 'block count',
    /* A count of blocks a reader can expect to see stacked. Ordinals ("第二塊") and single blocks
       are not totals, and a sentence may enumerate the parts ("兩塊…再加三塊"), so the sum counts. */
    parse: (t) => {
      const hits = t.match(/([二兩两三四五六七八九十]|\d{1,2})\s*[塊块个個]\s*(?:彩色)?積木/g) ||
        t.match(/\b(two|three|four|five|six|seven|eight|\d{1,2})\s+blocks?\b/gi);
      if (!hits) return null;
      return hits.map((h) => toNumber((h.match(/[二兩两三四五六七八九十]|\d{1,2}|two|three|four|five|six|seven|eight|[一二三四五六七八九十]/i) || [''])[0].toLowerCase()));
    },
    check: (ns, f) => {
      if (ns.length > 1 && ns.reduce((a, b) => a + b, 0) === f.blocks) return [{ ok: true }];
      return ns.map((n) => ({ ok: n === f.blocks, detail: `says ${n}, built ${f.blocks}` }));
    }
  },
  {
    id: 'step count',
    parse: (t) => {
      const m = t.match(/(?:移動|移动)\s*(\d+)\s*步/g) || t.match(/\bmove\s+(\d+)\s+steps?\b/gi);
      return m ? m.map((h) => Number(h.match(/\d+/)[0])) : null;
    },
    /* only when this step really builds a 移動 block: otherwise the number belongs to some other
       block (a turn, a glide) and there is nothing to compare it with */
    check: (ns, f) => (f.movesteps == null ? [{ ok: true }] : ns.map((n) => ({ ok: n === f.movesteps, detail: `says ${n} steps, the block says ${f.movesteps}` })))
  },
  {
    id: 'green flag',
    parse: (t) => (pressNear(t, '綠旗|绿旗|green flag') ? [NEGATED.test(t)] : null),
    /* [negated] — if the copy says pressing it will not move anything, the demonstration has to be
       one that builds without running */
    check: (ns, f) => [{ ok: ns[0] ? !f.runs : f.runs, detail: ns[0] ? 'says nothing happens, but the program runs' : 'nothing runs' }],
    gate: false
  },
  {
    id: 'red button',
    parse: (t) => (pressNear(t, '紅掣|红按钮|停止掣|red (?:stop )?button') ? [true] : null),
    check: (_, f) => [{ ok: f.stops, detail: 'the red button is never pressed' }],
    gate: false
  },
  { id: 'a sound', parse: (t) => (/發聲|发出?声|有聲出|makes? a sound|plays? a sound/i.test(t) ? [true] : null), check: (_, f) => [{ ok: hasOp(f.ops, 'sound_'), detail: 'no sound block in the program' }] },
  { id: 'grows', parse: (t) => (/變大|变大|grows?\b/i.test(t) ? [true] : null), check: (_, f) => [{ ok: hasOp(f.ops, 'looks_changesizeby') || hasOp(f.ops, 'looks_setsizeto'), detail: 'no size block in the program' }] },
  { id: 'says something', parse: (t) => (/講嘢|说话|說「|说「|says?\s*[「"]/i.test(t) ? [true] : null), check: (_, f) => [{ ok: hasOp(f.ops, 'looks_say'), detail: 'no say block in the program' }] },
  { id: 'moves', parse: (t) => (/向前行|向前走|郁一郁|動一下|移动角色|takes? (?:one small )?step|the sprite moves/i.test(t) ? [true] : null), check: (_, f) => [{ ok: hasOp(f.ops, 'motion_'), detail: 'no motion block in the program' }] },
  {
    id: 'sprite count',
    parse: (t) => {
      const m = t.match(/(?:有|共|總共|一共有)\s*([一二兩两三四五六\d]+)\s*[隻只个個]\s*角色/g) ||
        t.match(/there are\s+(\d+|two|three|four|five)\s+sprites?/gi);
      return m ? m.map((h) => toNumber((h.match(/[一二兩两三四五六\d]+|\d+|two|three|four|five/i) || [''])[0].toLowerCase())) : null;
    },
    check: (ns, f) => ns.map((n) => ({ ok: n === f.sprites, detail: `says ${n} sprites, the stage has ${f.sprites}` }))
  },
  {
    id: 'sprite named',
    /* Every name in the sprite dictionary is a name this guide can put on the stage. If the words
       use one this step never puts there, the sentence is describing a cast the student is not
       looking at — "the cat, the dog" over a list holding Pico and Lumo.

       Not gated by `GATE`: naming a sprite is not a promise about what is about to happen, it is a
       claim about what is already on the screen, and it is false in plain description too. */
    gate: false,
    parse: (t, f) => {
      if (!f.onStage) return null;           // no demonstration drives the stage here
      const hits = Object.keys(f.known).filter((n) => {
        const id = String(f.known[n]).replace('guide.sprite.', '');
        if (GENERIC.has(id)) return false;   // "the starting point of a program" is not a sprite
        return t.indexOf(n) >= 0 && f.names.indexOf(n) < 0;
      });
      return hits.length ? hits : null;
    },
    check: (ns, f) => ns.map((n) => ({ ok: false,
      detail: `says ${n}, but the stage holds ${f.names.join('、')} — nothing called ${n} is on it` }))
  },
  {
    id: 'actor named',
    /* The same falsehood in the other direction: the words name an animal, and the stage has none.
       "the cat, the dog" over a list holding Pico and Lumo is the sentence this was written for. */
    gate: false,
    parse: (t, f) => {
      if (!f.onStage) return null;
      let text = t;
      (NOT_A_CAST[f.locale] || []).forEach((re) => { text = text.replace(re, ' '); });
      const hits = [];
      Object.keys(CAST).forEach((id) => {
        if (f.refs.indexOf(id) >= 0) return;
        (CAST[id][f.locale] || []).forEach((w) => {
          /* the sprite's own name may hold the word the sentence used (小象 is an elephant) */
          if (f.names.some((n) => n.toLowerCase().indexOf(w.toLowerCase()) >= 0)) return;
          if (says(text, w)) hits.push(w);
        });
      });
      return hits.length ? hits : null;
    },
    check: (ns, f) => ns.map((w) => ({ ok: false,
      detail: `says ${w}, but the stage holds ${f.names.join('、')} — no ${w} is ever on it` }))
  }
];

/* ---------- the run ---------- */
let failures = 0;
let read = 0;
const bad = [];
const body = (locale, topic, step) => String((dicts[locale] || {})[`guide.${topic}.${step}.body`] || '').trim();

topics.forEach((topic) => {
  (topic.steps || []).forEach((step) => {
    LOCALES.forEach(([locale]) => {
      const text = body(locale, topic.id, step.id);
      if (!text) return;
      const f = facts(step.demo, dicts[locale], locale);
      CLAIMS.forEach((rule) => {
        if (rule.gate !== false && !GATE.test(text)) return;
        const got = rule.parse(text, f);
        if (!got) return;
        rule.check(got, f).forEach((r) => {
          read++;
          if (r.ok) return;
          failures++;
          bad.push(`  ${topic.id}/${step.id} [${locale}] ${rule.id} — ${r.detail}`);
        });
      });
    });
  });
});

const steps = topics.reduce((n, t) => n + (t.steps || []).length, 0);
console.log(`[claims] ${steps} steps, ${read} claim(s) held against the demonstration`);
if (failures) {
  console.log(bad.join('\n'));
  console.log(`\n[claims] FAIL — ${failures} sentence(s) the screen does not back up`);
  process.exit(1);
}
console.log('[claims] PASS');
