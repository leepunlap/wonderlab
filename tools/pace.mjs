#!/usr/bin/env node
/*!
 * Wonder Lab Studio — how long the demonstration needs, and how long the narration gives it.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * THE QUESTION THIS ANSWERS
 * "Do as I explain" only works if the doing fits inside the explaining. A step that says four
 * sentences and imports four actors in the same breath is not synchronised — it is a demonstration
 * that finishes after the teacher has stopped talking, and the student is left watching a silent
 * screen. The reverse is just as bad: a line that ends while the blocks are still arriving teaches
 * the student to ignore the voice.
 *
 * So every step has two numbers:
 *   need  the milliseconds its actions take, summed in the order studio-guide-drive.js performs them
 *   have  the milliseconds of body narration after its first sentence begins (the first gate)
 *
 * `need > have` is the defect this file exists to find, and `rate` is the remedy: the body is read
 * more slowly, which lengthens `have` without touching a word of the copy. Nothing is measured per
 * lesson by hand — the costs below are the editor's own animation constants, and the durations come
 * from the baked clips' cue tracks.
 *
 * WHERE THE COSTS COME FROM (all in studio-guide-drive.js / studio-anim.js)
 *   open      openPicker: 900 lead + 90 press + the modal's first paint
 *   tile      chooseTile: find, 900 hold, 90 press, close, and the actor landing in the VM
 *   backdrop  the same walk, but a backdrop is a whole picture: the arrival is slower
 *   build     studio-anim's own estimate: 400 + 850 per top-level block + 480 per nested block
 *   settle    the VM learns about Blockly's blocks a frame or two after the animation ends
 *   builtMark a "built" ring stands alone for 900ms before the program is run
 *   key       press(): 240 held down + 160 released
 *
 * If any of those constants change in the driver, they change here too — check_pace.mjs compares the
 * model against the clip durations on every run, so a drift shows up as a step that no longer fits
 * rather than as a lesson that feels wrong.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', 'src');

export const LOCALES = ['zh-Hant', 'zh-Hans', 'en'];
/** The rate every clip is baked at unless pacing asks for something slower. */
export const BASE_RATE = -5;
/** How slow a lesson may be read before the answer is "the copy needs another sentence". */
export const MIN_RATE = -22;
/** ms after the first sentence begins that the first action is allowed to start (voice.js LEAD). */
const LEAD = 120;
/** A breath between the last action and the end of the sentence that described it. */
export const TAIL = 300;
/**
 * How far past the last word a step may finish before it counts as unsynchronised.
 *
 * Not zero, and the reason is structural: the step ends when the *hand* ends, and the last thing the
 * hand does is press a tile whose actor then takes a moment to arrive. A lesson that lands its last
 * actor a second after the sentence is still a lesson where everything was said before it was done.
 * What this threshold really forbids is the case the guide used to have: several seconds of silent
 * screen while the picture caught up with a paragraph that had already finished.
 */
export const TOL = 1200;

/**
 * Each cost has two values:
 *   base   what the driver does when it is not in a hurry — a 900ms hold on the tile it is about to
 *          press, a 560ms walk of the hand
 *   floor  the same action with every deliberate pause cut to the bone (about a third of the hold).
 *          The fixed parts — finding the tile, the press, the modal closing, the actor landing —
 *          do not shrink, which is why four actors can never be rushed below ~7.5s.
 *
 * The voice is slowed until the *floor* fits; the hand then spends whatever is left over between the
 * floor and the base. Neither side is guessing: both read the same clock.
 */
export const COST = {
  /* Parts, not totals: every millisecond below has a line in the driver, and the two columns are
     the same action with its deliberate pauses intact and cut. The fixed parts (the press, the
     modal, the walk to the tile, the actor landing) do not shrink — which is why four actors can
     never be rushed below about seven seconds, and why those steps need words rather than speed. */
  part: {
    lead:         { base: 900, floor: 300 },   // openPicker: the hand has time to be watched
    leadAgain:    { base: 420, floor: 220 },   // the picker closes on every pick, so it reopens
    press:        { base: 90,  floor: 90  },   // pressHere: the ripple is not decoration
    modal:        { base: 250, floor: 250 },   // the library's first paint (measured: ~250ms)
    find:         { base: 400, floor: 400 },   // scroll to the tile and settle it
    hold:         { base: 900, floor: 300 },   // the tile, ringed, before it is pressed
    close:        { base: 100, floor: 100 },   // the modal going away
    arrive:       { base: 300, floor: 300 },   // the actor reaching the stage
    arriveBig:    { base: 900, floor: 900 },   // ...a backdrop is a whole picture
    after:        { base: 320, floor: 120 }    // a beat to see what arrived
  },
  settle: { base: 150, floor: 150 },
  builtMark: { base: 900, floor: 900 },
  key: { base: 400, floor: 400 },
  /* The walk to the green flag and the press. This is not the payoff — the payoff is the program
     running after it — so it belongs in the demand: a step that says "press the green flag" has to
     be given time to show the flag being pressed. */
  flag: { base: 750, floor: 390 }
};

const P = COST.part;
const sum = (parts) => ({
  base: parts.reduce((n, p) => n + p.base, 0),
  floor: parts.reduce((n, p) => n + p.floor, 0)
});

/** Pressing the plus, the ring around it, and the library arriving. */
const OPEN = sum([P.lead, P.press, P.modal]);
/** The first tile: the library is already open. */
const pick = (big) => sum([P.find, P.hold, P.press, P.close, big ? P.arriveBig : P.arrive, P.after]);
/** Every tile after the first, which has to reopen the library first. */
const again = (big) => sum([P.leadAgain, P.press, P.modal, P.find, P.hold, P.press, P.close,
  big ? P.arriveBig : P.arrive, P.after]);

/* ---------- the data ---------- */
let cached = null;

/** The same three shelves the guide ships: the lessons, the cards, the basics. */
export function topics() {
  if (cached) return cached;
  const sandbox = { console };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  const load = (file) => vm.runInContext(readFileSync(join(SRC, file), 'utf8'), ctx, { filename: file });
  load('studio-guide-topics.js');
  load('studio-guide-lessons.js');
  load('studio-guide-refs.js');
  cached = [].concat(sandbox.StudioGuideLessons || [], sandbox.StudioGuideRefs || [], sandbox.StudioGuideTopics || []);
  return cached;
}

export function manifest() {
  const file = join(SRC, 'assets', 'voice', 'manifest.json');
  if (!existsSync(file)) return { clips: {} };
  const m = JSON.parse(readFileSync(file, 'utf8'));
  m.clips = m.clips || {};
  return m;
}

/* ---------- the demand: what the driver will do, in its own order ---------- */
/** Blocks in a script, split the way the animator splits them: top level, and nested. */
function countBlocks(blocks) {
  let top = 0, nested = 0;
  const isBlock = (b) => b && typeof b === 'object' && typeof b.op === 'string';

  function walk(node, depth) {
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
    if (!isBlock(node)) {
      // an input can hold a reporter: it is a block in the animator's hands too
      if (node && typeof node === 'object') {
        Object.keys(node).forEach((k) => { if (k !== 'op') walk(node[k], depth + 1); });
      }
      return;
    }
    if (depth === 0) top++; else nested++;
    Object.keys(node).forEach((k) => {
      if (k === 'op') return;
      const v = node[k];
      if (Array.isArray(v) || isBlock(v)) walk(v, depth + 1);
    });
  }

  (blocks || []).forEach((b) => walk(b, 0));
  return { top, nested };
}

/** studio-anim's estimate, capped by the budget the guide gives it. */
export function buildCost(scripts) {
  let top = 0, nested = 0, sprites = new Set();
  (scripts || []).forEach((s) => {
    const c = countBlocks(s.blocks);
    top += c.top; nested += c.nested;
    sprites.add(s.sprite || '');
  });
  const switches = Math.max(0, sprites.size - 1);
  return Math.min(14000, 400 + top * 850 + nested * 480 + switches * 700);
}

/**
 * The actions of a step, in the order perform() runs them, each with the number of ms it holds the
 * floor. `gate` is the sentence index the action waits for, mirroring perform()'s `beat()` calls:
 * the plus is sentence 0, the first tile sentence 1, the stack sentence 2, the flag the one after.
 */
export function slotsOf(step) {
  const d = (step && step.demo) || {};
  const adds = d.add || [];
  const scripts = d.scripts || [];
  const slots = [];
  /* `beat` counts the sentences the driver waits for. It is not the slot index: the picker walk is
     hand-paced after the library opens (the copy describes it in the present tense), so only the
     plus, the stack, the flag and the keys take a beat. Mirrors perform()'s `beat()` calls. */
  let beat = 0;

  if (adds.length) {
    slots.push({ what: 'open the library', base: OPEN.base, floor: OPEN.floor, gate: beat++ });
    adds.forEach((a, i) => {
      const big = a.do === 'add_backdrop';
      const c = i === 0 ? pick(big) : again(big);
      slots.push({ what: 'choose ' + (a.name || '?'), base: c.base, floor: c.floor, gate: i === 0 ? 0 : null });
    });
  }
  if (scripts.length) {
    const b = buildCost(scripts) + COST.settle.base;
    slots.push({ what: 'build ' + scripts.length + ' script(s)', base: b, floor: b, gate: beat++ });
  }
  /* `run` is the payoff, not an explanation: the program is meant to be watched after the last
     word has landed, so it is on the timeline but not in the demand. The walk to the flag is the
     opposite — it is the last thing the lesson has to show — so it stays in the demand. */
  if (d.run) {
    slots.push({ what: 'walk to the flag', base: COST.flag.base, floor: COST.flag.floor, gate: beat });
    slots.push({ what: 'run the program', base: d.run, floor: d.run, gate: beat++, run: true });
  }
  (d.keys || []).forEach((k) => {
    slots.push({ what: 'press ' + k, base: COST.key.base, floor: COST.key.floor, gate: beat++ });
  });

  const built = (d.annotate || []).some((m) => m && m.when === 'built') ? COST.builtMark.base : 0;
  const need = slots.reduce((n, s) => n + s.base, 0) + built;
  const floor = slots.reduce((n, s) => n + s.floor, 0) + built;
  return { slots, built, need, floor };
}

/** The clip a step is narrated by, in one language. */
export function clipFor(m, topicId, stepId, locale) {
  return m.clips['guide.' + topicId + '.' + stepId + '.body|' + locale] || null;
}

/* ---------- the supply: how long the body has, at the rate it was baked ---------- */
export function supplyOf(clip) {
  if (!clip || !clip.ms) return null;
  const first = (clip.cues && clip.cues[0] && clip.cues[0].t) || 0;
  return {
    ms: clip.ms,
    first,
    /** what is left after the first sentence begins: the interval all the actions share */
    have: Math.max(0, clip.ms - first - LEAD)
  };
}

/**
 * When the last action actually stops, given the sentence each action waits for.
 *
 * This is the part that makes the audit trustworthy: an action does not start when the previous one
 * ends if the copy has not reached its sentence yet, and a body with two sentences gives the first
 * two actions far more room than a plain sum would suggest. Actions past the last sentence run at
 * the hand's own pace, which is why a four-actor import with two sentences is the case that fails.
 */
export function windowOf(slots, clip) {
  const cues = (clip && clip.cues) || [];
  const t0 = (cues[0] && cues[0].t) || 0;
  const from = t0 + LEAD;
  let at = from;
  let end = at, explainEnd = at;
  slots.forEach((s) => {
    const gate = s.gate != null && s.gate < cues.length ? cues[s.gate].t + LEAD : at;
    const start = Math.max(at, gate);
    end = start + s.floor;
    at = end;
    if (!s.run) explainEnd = end;
  });
  /* measured at the floor: this is what the hand can do at its briskest, which is the constant the
     voice has to be able to cover. The base cost is what it *wants*, and the check reports the
     difference as how much the hand will have to hurry. */
  return { from, end, explainEnd,
           need: Math.max(0, explainEnd - from),
           have: Math.max(1, (clip.ms || 0) - from) };
}

export const speedOf = (rate) => 1 + (Number(rate) || 0) / 100;
const rateOf = (speed) => Math.round((speed - 1) * 100);

/**
 * The slowest the body can be read without the sentence being over: the balance is converted to
 * "ms at speed 1" first, so the answer does not depend on the rate the clip was baked at and
 * re-running is idempotent.
 */
export function rateFor(row) {
  if (!row || !row.have || !row.need) return BASE_RATE;
  const cur = row.rate == null ? BASE_RATE : row.rate;
  /* duration × speed is the invariant: a clip read at 0.8x lasts longer, and the balance it would
     have had at full speed is what the target is solved from */
  const perUnit = row.have * speedOf(cur);
  /* the target is the floor cost minus what the threshold already allows: slowing the voice for
     time nobody needs is just a slow lesson */
  const target = Math.max(1, row.need - TOL);
  const want = Math.min(
    Math.max(perUnit / target, speedOf(MIN_RATE)),
    speedOf(BASE_RATE)                    // never faster than the base read: this tool only slows
  );
  return rateOf(want);
}

/* ---------- the plan ---------- */
/**
 * One row per step per language. `slack` is the whole answer: ms left over (or missing) when the
 * last action stops and the body narration ends.
 */
export function plan(m = manifest()) {
  const rows = [];
  for (const topic of topics()) {
    for (const step of topic.steps || []) {
      const { slots } = slotsOf(step);
      for (const locale of LOCALES) {
        const clip = clipFor(m, topic.id, step.id, locale);
        if (!clip || !clip.ms) {
          rows.push({ topic: topic.id, step: step.id, kind: topic.kind, locale, need: 0, have: 0,
            slack: null, rate: null, slots, missing: true });
          continue;
        }
        const w = windowOf(slots, clip);
        const rate = clip.rate == null ? BASE_RATE : clip.rate;
        const row = {
          topic: topic.id, step: step.id, kind: topic.kind, locale, slots,
          need: w.need, have: w.have, end: w.end,
          /* from the end of the last action to the last word: negative means the picture is still
             moving when the voice has stopped */
          slack: clip.ms - w.explainEnd,
          rate, missing: false
        };
        row.want = rateFor(row);
        rows.push(row);
      }
    }
  }
  return rows;
}

/** `key|locale` → the rate its body should be baked at. */
export function rates(m = manifest()) {
  const out = {};
  for (const r of plan(m)) {
    if (r.missing) continue;
    out['guide.' + r.topic + '.' + r.step + '.body|' + r.locale] = r.want;
  }
  return out;
}

/**
 * Where along the body each gated action lands, so a step that bleeds one sentence into the next can
 * be seen. Not a failure on its own — actions are sequential and a long one legitimately runs under
 * the next sentence — but a step whose *first* action already overruns its sentence is one where the
 * student is being told the second thing while watching the first.
 */
export function alongSentences(row, clip) {
  const cues = (clip && clip.cues) || [];
  if (!cues.length) return [];
  const out = [];
  let at = cues[0].t + LEAD;
  row.slots.forEach((s, i) => {
    const start = i < cues.length ? Math.max(at, cues[i].t + LEAD) : at;
    const end = start + s.need;
    const next = i + 1 < cues.length ? cues[i + 1].t : (clip.ms || end);
    out.push({ what: s.what, start, end, next, over: Math.max(0, end - next) });
    at = end;
  });
  return out;
}
