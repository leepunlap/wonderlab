#!/usr/bin/env node
/**
 * Where the hand points, against what the voice is saying at that moment.
 *
 * A step rings the thing it is talking about, one sentence at a time: `cue` is the sentence the mark
 * belongs to. Nothing checked that the two agreed. On the first page of the Tutorial the copy said
 * "add three more blocks, press the green flag" while the ring sat round the whole stage — the ring
 * was not a lie, the sprite does perform there, but it was not the thing the reader had just been
 * told to touch. It shipped three times, and every time it was a teacher who found it.
 *
 *   node tools/check_marks.mjs
 *
 * WHERE THE SENTENCE COMES FROM
 * The baked voice manifest: `clip.cues[cue].s` is the subtitle on screen at that beat, so this is
 * checked against what the student reads, not against a re-parse of the copy. A body with no clip
 * falls back to splitting on punctuation.
 *
 * THE TWO RULES
 *   1. A ring on a control is on a control the sentence names. "Press the green flag" may ring the
 *      flag, the stop button or nothing; it may not ring the palette.
 *   2. A sentence that tells the reader to DO something rings what it tells them to touch. If the
 *      sentence presses or drags something named, the stage alone is not an answer — the action is
 *      at a control, and that is where the eye has to be.
 *
 * WHAT IS DELIBERATELY NOT CHECKED
 * A ring on the stage during a sentence about the result — "碰到傳送點就返去起點" — is the idiom of
 * this guide and is left alone; the stage is where an effect is watched. And prose is not provable:
 * a sentence that implies a place without naming it passes. These two rules cover the mistakes that
 * have actually shipped.
 *
 * Exit 0 = every ring is on something its sentence names; 1 = a mark points somewhere else.
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
const VOICE = JSON.parse(readFileSync(join(SRC, 'assets/voice/manifest.json'), 'utf8'));

/**
 * The words a sentence uses when it is talking about a control. Generous on purpose: a ring that is
 * named at all is left alone. The stage is not in this table — it is the one anchor that may be
 * ringed while the sentence talks about something else (see "deliberately not checked" above).
 */
const VOCAB = {
  flag: /綠旗|绿旗|green flag/i,
  stop: /紅掣|红掣|红按钮|紅色停止|红色停止|stop button|red button/i,
  palette: /積木區|积木区|積木|blocks? palette|palette|顏色分類|颜色分类/i,
  flyout: /積木|block|揀|拣|拖|drag|pick up/i,
  workspace: /程式區|程序区|程式|程序|script|code area|code|疊|叠|拼|接埋|snap|stack/i,
  sprites: /角色清單|角色列表|sprite list|角色庫|角色库|演員|演员/i,
  addSprite: /加角色|新增角色|add a sprite|add sprite|貓仔圖案|猫仔图案/i,
  addBackdrop: /背景庫|背景库|backdrop library|揀背景|选背景|choose a backdrop|加背景/i,
  spriteInfo: /\bx\b|\by\b|座標|坐标|position numbers/i,
  /* 分頁, not 造型: 「揀啱造型」 in a lesson about costumes is a costume, not the Costumes tab, and a
     rule that cannot tell the two apart fires on every lesson that mentions a costume. */
  tabs: /分頁|分页|costumes? tab|sounds? tab|\btabs?\b/i,
  stageSize: /縮細|缩小|放大舞台|stage size|全螢幕|全屏/i,
  stageHeader: /舞台上方|舞台頂|stage header|上面嗰排|上面那排/i,
  library: /角色庫|角色库|背景庫|背景库|library/i,
  toolbar: /選單|菜单|menu|語言|语言/i,
  chatTabs: /學伴|学伴|指南|對話|对话/i,
  field: /數字|数字|number|輸入|输入|type/i
};

/** `field:motion_movesteps/STEPS` is a control inside a block: the number box. */
const anchorKey = (at) => {
  const s = String(at);
  if (s.indexOf('field:') === 0) return 'field';
  if (s === 'flyout:first') return 'flyout';
  if (s === 'canvas') return 'workspace';
  return s;
};

/* "do this to that" — a press, a drag, a typing. Only these sentences claim an action at a control;
   a sentence that merely names one is describing, and prose describes from anywhere. */
const ACT = /撳|按|拖|揀|選|选|click|press|drag|pick up|pick|type/gi;
const ACT_NEAR = 3;   // the verb has to hold the control: 「撳綠旗」 yes, 「按鈕用嚟揀難度」 no

/* Where a control lives, so that naming the neighbour and ringing one of them is not an error:
   the palette and its flyout are one column on the screen, and the flag, the stop button and the
   stage-size toggle are one row above the stage. */
const FAMILY = {
  palette: 'blocks', flyout: 'blocks',
  flag: 'header', stop: 'header', stageHeader: 'header', stageSize: 'header',
  /* The list, the button at its corner and the library behind it are one act: "press the cat icon
     and pick one from the library" is answered by a ring on any of the three, and a sentence can
     name the list and the library in the same breath. */
  sprites: 'casting', addSprite: 'casting', library: 'casting',
  addBackdrop: 'backdrop'
};
const familyOf = (k) => FAMILY[k] || k;

/**
 * The sentence with its quotations and its button-nouns taken out: 「當綠旗被按下」 is the *name* of
 * a block, and 按鈕/按钮 is the name of a thing. Reading either as an instruction is how a checker
 * starts crying wolf.
 */
function plain(text) {
  return text
    .replace(/「[^」]*」|“[^”]*”|『[^』]*』/g, '  ')
    .replace(/按鈕|按钮|按掣/g, ' 按鈕 ');
}

const near = (text, re) => {
  let m;
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  const scan = new RegExp(re.source, flags);
  while ((m = scan.exec(text))) {
    const before = text.slice(Math.max(0, m.index - ACT_NEAR), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + ACT_NEAR);
    ACT.lastIndex = 0;
    const hit = ACT.test(before) || ACT.test(after);
    ACT.lastIndex = 0;
    if (hit) return true;
  }
  return false;
};

/** The subtitle at `cue`, or a punctuation split when there is no clip to read it from. */
function sentences(topic, step, locale) {
  const clip = VOICE.clips[`guide.${topic.id}.${step.id}.body|${locale}`];
  if (clip && (clip.cues || []).length) return clip.cues.slice().sort((a, b) => a.t - b.t).map((c) => String(c.s || ''));
  const body = String((dicts[locale] || {})[`guide.${topic.id}.${step.id}.body`] || '');
  return body.split(/(?<=[。；;！!？?])/).map((s) => s.trim()).filter(Boolean);
}

/**
 * The controls the guide can ring or press *by name*. Deliberately shorter than VOCAB above: a
 * sentence about blocks says 積木 and 拖 in every other line, and demanding a ring every time would
 * drown the real failures. These are the six things a student is told to touch and then goes looking
 * for — and the ones that have shipped wrong (x/y ringed while the words said "top-left", a step
 * telling the reader to press 「加角色」 with the ring a sentence early).
 */
const TARGET = {
  flag: VOCAB.flag,
  stop: VOCAB.stop,
  addSprite: VOCAB.addSprite,
  addBackdrop: VOCAB.addBackdrop,
  tabs: VOCAB.tabs,
  stageSize: VOCAB.stageSize
};

/** `sprite:@pico` is a press inside the sprite list; `tab:1` inside the tab row. */
function tapKey(at) {
  const s = String(at || '');
  if (s.indexOf('sprite:') === 0) return 'sprites';
  if (s.indexOf('tab:') === 0) return 'tabs';
  if (s.indexOf('chat:') === 0) return 'chatTabs';
  if (s.indexOf('stageSize:') === 0) return 'stageSize';
  if (s.indexOf('cat:') === 0) return 'palette';
  if (s.indexOf('menu:') === 0) return 'toolbar';
  return s;
}

/* "pressing it will not do anything" — the claim is the absence of an effect, so the picture is
   allowed to be the absence of a press. Same wording as check_claims' NEGATED. */
const NOTHING = /(?:唔|不|未|沒|没)[會会動动郁]|不會動|不会动|won'?t (?:move|do)|does(?:n'?t| not) (?:move|run)|nothing happens/i;

const clamp = (line) => (line.length > 42 ? line.slice(0, 42) + '…' : line);

let failures = 0, marks = 0, groups = 0;
const bad = [];

for (const t of topics) {
  for (const s of (t.steps || [])) {
    const list = (s.demo && s.demo.annotate) || [];
    const said = list.filter((m) => m && (m.when || 'say') === 'say');
    if (!said.length) continue;
    marks += said.length;

    for (const [locale] of LOCALES) {
      const lines = sentences(t, s, locale);
      if (!lines.length) continue;
      const byCue = new Map();
      for (const m of said) {
        const c = Math.max(0, (m.cue | 0));
        if (!byCue.has(c)) byCue.set(c, []);
        byCue.get(c).push(m);
      }
      groups += byCue.size;

      for (const [cue, group] of byCue) {
        const text = lines[cue] || '';
        if (!text) {
          failures++;
          bad.push(`  ${t.id}/${s.id} [${locale}] cue ${cue} — the mark waits for a sentence that is not there`);
          continue;
        }
        const keys = group.map((m) => anchorKey(m.at));
        const clean = plain(text);
        if (NOTHING.test(clean)) continue;      // "pressing it will not do anything" owes no press
        const controls = Object.keys(VOCAB).filter((k) => VOCAB[k].test(clean));

        /* the rule — a sentence that tells the reader to touch something rings that something */
        const acted = controls.filter((k) => near(clean, new RegExp(VOCAB[k].source, 'gi')));
        if (acted.length) {
          const want = new Set(acted.map(familyOf));
          if (!keys.some((k) => want.has(familyOf(k)))) {
            failures++;
            bad.push(`  ${t.id}/${s.id} [${locale}] cue ${cue} — says “${clamp(text)}”, which acts on ${acted.join('/')}, but the ring is on ${keys.join('+')}`);
          }
        }
      }
    }
  }
}

/**
 * RULE 3 — a sentence that tells the reader to touch a named control is answered at that sentence,
 * by a ring on it or by the press itself.
 *
 * This is the rule that was missing when the Tutorial rang the whole stage during "top-left you see
 * x and y" and when it said 「撳右上角嗰個「加角色」掣」 with the ring drawn a sentence earlier: the
 * ring existed, it was simply in the wrong beat, and rule 2 could not see it because rule 2 only
 * looks at the cues that already have a ring.
 *
 * A mark is not the only honest answer — a step that opens the sprite picker at the sentence which
 * names the button has already shown it — so a `taps` entry at the same cue counts too.
 */
let late = 0;
for (const t of topics) {
  for (const s of (t.steps || [])) {
    const demo = s.demo || {};
    const said = ((demo.annotate) || []).filter((m) => m && (m.when || 'say') === 'say');
    const pressed = demo.taps || [];
    for (const [locale] of LOCALES) {
      const lines = sentences(t, s, locale);
      lines.forEach((text, cue) => {
        const clean = plain(text);
        /* 「撳綠旗都未會郁」 names a press whose only outcome is nothing. A step shows that by
           building and stopping, not by pressing — check_claims holds the same line — so a negated
           sentence is not owed a press. */
        if (NOTHING.test(clean)) return;
        const acted = Object.keys(TARGET).filter((k) => near(clean, new RegExp(TARGET[k].source, 'gi')));
        if (!acted.length) return;
        const want = new Set(acted.map(familyOf));
        const ringed = said.some((m) => Math.max(0, m.cue | 0) === cue &&
          want.has(familyOf(anchorKey(m.at))));
        const tapped = pressed.some((o) => Math.max(0, (o && o.cue) | 0) === cue &&
          want.has(familyOf(tapKey(o.at))));
        if (ringed || tapped) return;
        late++;
        bad.push(`  ${t.id}/${s.id} [${locale}] cue ${cue} — says “${clamp(text)}”, which acts on ${acted.join('/')}, but nothing happens there at that sentence`);
      });
    }
  }
}

console.log(`[marks] ${marks} mark(s) across ${groups} sentence group(s), read in ${LOCALES.length} languages`);
if (late) failures += late;
if (failures) {
  console.log(bad.join('\n'));
  console.log(`\n[marks] FAIL — ${failures} ring(s) pointing away from what is being said`);
  process.exit(1);
}
console.log('[marks] PASS — every ring is on something its own sentence names');
