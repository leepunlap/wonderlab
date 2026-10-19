#!/usr/bin/env node
/*!
 * Wonder Lab Studio — the guide's voice, generated ahead of time.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS IS
 * Every narrated line of the guide, spoken by Microsoft Edge's neural voices, written to
 * src/assets/voice/ as mp3 with a cue track, plus one manifest for the page to read.
 *
 *   pip install edge-tts
 *   EDGE_TTS=/path/to/edge-tts npm run build:voice     (or just: npm run build:voice)
 *
 * WHY AHEAD OF TIME
 * The alternative is a speech endpoint, which would mean the guide goes silent the day the school
 * network blocks it, and would leave the static production deploy (nginx, no app server) without a
 * voice at all. Baked files are the only form that survives both. The page still falls back to the
 * browser's own speech if a clip is missing, so nothing here is load-bearing for correctness.
 *
 * WHY ONE CLIP PER LINE
 * A clip per line means the subtitle is the clip's own cue track: no timings to estimate and no
 * drift between what is heard and what is read. Files are named by a hash of voice + text, so
 * re-running is idempotent and editing one sentence regenerates exactly one file.
 *
 * WHICH VOICES
 * zh-Hant is read in Cantonese, not Mandarin: the copy is written in Hong Kong Chinese (向前行,
 * 一直行) and a Mandarin voice reading it would be a translation, not a narration. English is
 * British, which is the English these students hear.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(SRC, 'assets', 'voice');
const CLI = process.env.EDGE_TTS || 'edge-tts';
const CONCURRENCY = Number(process.env.VOICE_JOBS || 4);
const PIPELINE = 2;   // bump when the cue track changes shape: entries from older runs are redone

const LOCALES = {
  'zh-Hant': { voice: 'zh-HK-HiuMaanNeural', rate: '-5%' },
  'zh-Hans': { voice: 'zh-CN-XiaoxiaoNeural', rate: '-5%' },
  en: { voice: 'en-GB-SoniaNeural', rate: '-5%' }
};

/* ---------- the words ---------- */
/**
 * The locale files are plain scripts that hand a dictionary to StudioI18n.register. Running them
 * against a stub is more honest than a regex: escapes, comments and multi-line strings stay the
 * browser's problem and the browser's parser, which is the same code that will read them at run time.
 */
function dictionary(locale) {
  const file = path.join(SRC, 'studio-locale.' + locale + '.js');
  const src = fs.readFileSync(file, 'utf8');
  let got = null;
  const sandbox = {
    StudioI18n: { register: (code, short, dict) => { if (code === locale) got = dict; } }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox, { filename: file });
  if (!got) throw new Error('no dictionary registered in ' + file);
  return got;
}

/** `guide.<topic>.<step>.title` and `.body` — the steps, and only the steps. */
function narratedKeys(dict) {
  return Object.keys(dict).filter((k) => {
    const p = k.split('.');
    return p.length === 4 && p[0] === 'guide' && (p[3] === 'title' || p[3] === 'body');
  }).sort();
}

/* ---------- speech ---------- */
function hash(text, voice, rate) {
  return createHash('sha1').update(voice + '\u0000' + rate + '\u0000' + text).digest('hex').slice(0, 12);
}

/** "00:00:00,100 --> 00:00:05,487" plus the line under it, which is the line to show. */
function parseVtt(vtt) {
  const cues = [];
  const blocks = String(vtt).replace(/\r/g, '').split('\n\n');
  blocks.forEach((block) => {
    const lines = block.split('\n').filter((l) => l.trim() !== '' && !/^WEBVTT/.test(l));
    const timing = lines.find((l) => l.includes('-->'));
    if (!timing) return;
    const at = lines.indexOf(timing);
    const [from, to] = timing.split('-->').map((s) => s.trim());
    const start = seconds(from), end = seconds(to);
    const text = lines.slice(at + 1).join(' ').trim();
    if (!text) return;
    cues.push({ t: Math.round(start * 1000), d: Math.round((end - start) * 1000), s: text });
  });
  return cues;
}

function seconds(stamp) {
  const m = /(?:(\d+):)?(\d+):(\d+)[.,](\d+)/.exec(stamp);
  if (!m) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2]) * 60) + Number(m[3]) + (Number(m[4]) / 1000);
}

/**
 * Edge's own subtitle splitter can drop the last character of a line — a closing quote, usually,
 * which is exactly the sort of thing a student notices. Its timings are still the only honest ones
 * available, so the text is put back rather than the cue thrown away: if what it produced is a
 * prefix of what was asked for, the missing tail goes on the last line.
 */
function repair(cues, text) {
  const norm = (s) => String(s).replace(/\s+/g, '');
  if (!cues.length) return [{ t: 0, d: 0, s: String(text).trim() }];
  const joined = norm(cues.map((c) => c.s).join(''));
  const want = norm(text);
  if (joined === want) return cues;
  if (joined.length < want.length && want.indexOf(joined) === 0) {
    const missing = want.length - joined.length;
    if (missing <= 12) {
      cues[cues.length - 1].s = (cues[cues.length - 1].s + String(text).trim().slice(-missing)).trim();
    }
  }
  return cues;
}

function synthesize({ text, voice, rate }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-voice-'));
  const media = path.join(dir, 'a.mp3');
  const subs = path.join(dir, 'a.vtt');
  return new Promise((resolve, reject) => {
    execFile(CLI, ['--voice', voice, '--rate=' + rate, '--text', text,
      '--write-media', media, '--write-subtitles', subs], { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) {
        fs.rmSync(dir, { recursive: true, force: true });
        return reject(new Error((stderr || err.message || '').trim().slice(0, 300)));
      }
      try {
        const audio = fs.readFileSync(media);
        const cues = repair(fs.existsSync(subs) ? parseVtt(fs.readFileSync(subs, 'utf8')) : [], text);
        fs.rmSync(dir, { recursive: true, force: true });
        resolve({ audio, cues });
      } catch (e) {
        fs.rmSync(dir, { recursive: true, force: true });
        reject(e);
      }
    });
  });
}

/* ---------- the run ---------- */
async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const jobs = [];
  Object.keys(LOCALES).forEach((locale) => {
    const dict = dictionary(locale);
    const keys = narratedKeys(dict);
    if (!keys.length) throw new Error(locale + ': no step keys found — has the key shape changed?');
    keys.forEach((key) => {
      const text = String(dict[key] || '').trim();
      if (text) jobs.push({ locale, key, text, ...LOCALES[locale] });
    });
  });

  console.log('[voice] ' + jobs.length + ' lines, ' + Object.keys(LOCALES).length + ' languages, ' +
    CONCURRENCY + ' at a time');

  const clips = {};
  let done = 0, reused = 0, failed = 0;
  const queue = jobs.slice();

  async function worker() {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const name = hash(job.text, job.voice, job.rate) + '.mp3';
      const file = path.join(OUT, name);
      const id = job.key + '|' + job.locale;
      if (fs.existsSync(file)) {
        // known text: the audio is already right, only the cue track has to be remembered
        const prev = clips[id];
        if (prev && prev.file === name) { reused++; done++; continue; }
      }
      try {
        const { audio, cues } = await synthesize(job);
        fs.writeFileSync(file, audio);
        clips[id] = {
          file: name,
          ms: cues.length ? cues[cues.length - 1].t + cues[cues.length - 1].d : 0,
          cues
        };
        done++;
        process.stdout.write('\r[voice] ' + done + '/' + jobs.length + '  ' + job.locale + ' ' + job.key + '   ');
      } catch (e) {
        failed++;
        console.error('\n[voice] ' + job.locale + ' ' + job.key + ': ' + e.message);
      }
    }
  }

  // a previous manifest lets unchanged lines be reused instead of re-synthesised
  const manifestPath = path.join(OUT, 'manifest.json');
  let before = {};
  if (fs.existsSync(manifestPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      // same pipeline: keep the work. different: the cue track has a new shape, so start over.
      before = prev.pipeline === PIPELINE ? (prev.clips || {}) : {};
    } catch (e) { before = {}; }
  }
  Object.keys(before).forEach((id) => {
    if (before[id] && before[id].file && fs.existsSync(path.join(OUT, before[id].file))) clips[id] = before[id];
  });
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

  // unchanged lines were carried over; drop anything no longer narrated
  const keep = new Set(Object.keys(clips).map((id) => clips[id].file));
  fs.readdirSync(OUT).forEach((f) => {
    if (f.endsWith('.mp3') && !keep.has(f)) fs.unlinkSync(path.join(OUT, f));
  });

  const manifest = {
    note: 'Generated by tools/build_voice.mjs — Microsoft Edge neural voices, baked ahead of time.',
    pipeline: PIPELINE,
    generated: new Date().toISOString().slice(0, 10),
    voices: Object.keys(LOCALES).reduce((o, l) => { o[l] = LOCALES[l].voice; return o; }, {}),
    clips
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 0) + '\n');

  const bytes = [...keep].reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  console.log('\n[voice] ' + Object.keys(clips).length + ' clips, ' + (bytes / 1024).toFixed(0) + ' KB' +
    ', ' + reused + ' reused, ' + failed + ' failed');
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error('[voice] ' + e.message); process.exit(1); });
