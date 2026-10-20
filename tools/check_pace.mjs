#!/usr/bin/env node
/*!
 * Wonder Lab Studio — does every lesson's demonstration fit inside its narration?
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS GUARDS
 * "Do as I explain" is a timing promise, and timing cannot be reviewed by reading the copy: a
 * sentence that looks short can be four seconds of speech, and four actors take eleven seconds to
 * arrive. So the promise is checked arithmetically, for every step of every lesson, in every
 * language, before anyone sits through it:
 *
 *   need  the actions, summed in the order perform() runs them        (tools/pace.mjs)
 *   have  the body clip after its first sentence begins              (the baked cue track)
 *   slack = have - need - a breath
 *
 * Exit 1 when any step's picture outlives its words, and when a body clip is baked at a rate the
 * pacing no longer asks for (which is how "slower, but nobody re-baked" is caught).
 *
 *   node tools/check_pace.mjs
 *   node tools/check_pace.mjs --quiet      only the failures
 *
 * Nothing here opens a browser. The browser proof that the numbers correspond to the screen is
 * src/_sync-check.html, which measures the same step with a written-down timeline.
 */
import { clipFor, LOCALES, manifest, plan, rateFor, alongSentences, BASE_RATE, MIN_RATE, TOL } from './pace.mjs';

const quiet = process.argv.includes('--quiet');
const rows = plan();
const live = rows.filter((r) => !r.missing && r.need > 0);

const mm = (n) => (n / 1000).toFixed(1) + 's';
const pad = (s, n) => String(s).padEnd(n).slice(0, n);

let failures = 0;
const fail = (msg) => { console.log('  FAIL  ' + msg); failures++; };
const ok = (msg) => { if (!quiet) console.log('  ok    ' + msg); };

console.log('[pace] ' + live.length + ' narrated steps, ' + LOCALES.length + ' languages');

/* ---------- 1. no step outlives its own narration ---------- */
const late = live.filter((r) => -r.slack > TOL + 50);   // 50ms of rounding
const tight = live.slice().sort((a, b) => a.slack - b.slack);

if (late.length) {
  for (const r of late) {
    fail(`${r.topic}/${r.step} [${r.locale}] the picture runs ${mm(-r.slack)} past the words` +
      ` (allowed ${mm(TOL)})` +
      ` (need ${mm(r.need)}, have ${mm(r.have)}, rate ${r.rate}% → wants ${r.want}%)`);
  }
} else {
  ok('every step finishes before its narration does');
}

/* ---------- 2. the slowest read is the floor, not a suggestion ---------- */
const floor = live.filter((r) => r.want <= MIN_RATE && -r.slack > TOL + 50);
if (floor.length) {
  for (const r of floor) {
    fail(`${r.topic}/${r.step} [${r.locale}] still does not fit at the slowest read (${MIN_RATE}%) —` +
      ' the copy needs another sentence, not a slower voice');
  }
}

/* ---------- 3. what is on disk matches what the pacing asks for ---------- */
const m = manifest();
const stale = [];
for (const r of live) {
  const clip = clipFor(m, r.topic, r.step, r.locale);
  const baked = clip && clip.rate != null ? clip.rate : BASE_RATE;
  if (Math.abs(baked - r.want) > 1) stale.push({ r, baked });
}
if (stale.length) {
  fail(stale.length + ' body clip(s) are baked at a rate the pacing no longer asks for — run ' +
    '`npm run build:voice`  (' + stale.slice(0, 3).map((s) =>
      `${s.r.topic}/${s.r.step} ${s.r.locale}: ${s.baked}% → ${s.r.want}%`).join('; ') + ')');
} else {
  ok('every body clip is baked at the rate its step asks for');
}

/* ---------- 4. an action should not start under the next sentence ---------- */
let bleed = 0, bleedSteps = [];
for (const r of live) {
  const clip = clipFor(m, r.topic, r.step, r.locale);
  const beats = alongSentences(r, clip);
  const first = beats[0];
  if (first && first.over > 250) { bleed++; bleedSteps.push(`${r.topic}/${r.step} [${r.locale}] +${mm(first.over)}`); }
}
if (bleed) {
  if (!quiet) {
    console.log('  note  ' + bleed + ' step/language(s) where the first action starts under the next sentence');
    bleedSteps.slice(0, 6).forEach((s) => console.log('          ' + s));
  }
}

/* ---------- the table ---------- */
if (!quiet) {
  console.log('\n  tightest steps (all languages):');
  console.log('    ' + pad('step', 22) + pad('locale', 9) + pad('need', 8) + pad('have', 8) + pad('slack', 8) + 'rate');
  tight.slice(0, 12).forEach((r) => {
    console.log('    ' + pad(r.topic + '/' + r.step, 22) + pad(r.locale, 9) + pad(mm(r.need), 8) +
      pad(mm(r.have), 8) + pad((r.slack < 0 ? '-' : '+') + mm(Math.abs(r.slack)), 8) + r.rate + '%');
  });
  const slow = live.filter((r) => r.rate < BASE_RATE).length;
  console.log('\n  ' + slow + ' step/language(s) are read slower than the base rate;' +
    ' slowest ' + (Math.min(...live.map((r) => r.rate))) + '%');
}

console.log(failures ? '\n[pace] FAIL — ' + failures : '\n[pace] PASS');
process.exit(failures ? 1 : 0);
