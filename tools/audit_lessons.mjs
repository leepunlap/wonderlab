/*!
 * Wonder Lab Studio — audit the lesson library.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS ANSWERS
 * Three questions a help system has to have answered before a single line of copy is written:
 *   1. Which lessons actually contain programming? (Most of the library is mechanics.)
 *   2. What does each one teach, and which "key knowledge" does it lean on?
 *   3. What is missing — no starter project, no text steps, or a concept the studio cannot yet do?
 *
 * WHY A TOOL AND NOT A SPREADSHEET
 * The lesson pages are the source of truth and they change every term. This reads them again on
 * demand, so the audit can be re-run after a content drop instead of going stale in a document
 * nobody trusts.
 *
 * WHAT IT READS (both outside this repo, hence the flags)
 *   --classfiles  the published lesson pages, one index.html per lesson slug
 *   --lab         the Wonder Lab starter projects (local-lab/lab/manifest.json + <slug>.json)
 *   --out         where to write the machine-readable inventory (JSON)
 *
 * USAGE
 *   node tools/audit_lessons.mjs
 *   node tools/audit_lessons.mjs --classfiles ../../classfiles --lab ../../local-lab/lab
 *
 * It writes nothing but --out. Everything else goes to stdout as a markdown report.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

const CLASSFILES = resolve(arg('classfiles', '../../classfiles'));
const LAB = resolve(arg('lab', '../../local-lab/lab'));
const OUT = resolve(arg('out', 'docs/lesson-audit.json'));

const LEVELS = ['L1', 'L2', 'L3', 'L4'];
const SLUG = /^\d{3}-bp\d{2}$/;

/* The five things a newcomer cannot guess, plus the concepts that keep coming back. Each entry is
   what the copy will one day have to explain, so the audit counts how many lessons lean on it. */
const CONCEPTS = {
  'importSprite': { label: '匯入角色', keys: ['匯入', '新增角色', '加入角色', '上傳角色', '角色庫', '選擇角色'] },
  'setBackdrop': { label: '設定背景', keys: ['背景', '選一個背景', '背景庫', '舞台背景'] },
  'switchScene': { label: '切換場景', keys: ['廣播', '當收到', '切換背景', '換背景', '場景', '訊息'] },
  'collision': { label: '碰撞偵測', keys: ['碰到', '碰撞', '碰到角色', '碰到邊緣', '碰到鼠標'] },
  'colorDetect': { label: '顏色偵測', keys: ['碰到顏色', '顏色碰到', '顏色偵測', '碰到的顏色'] },
  'sound': { label: '聲音音效', keys: ['聲音', '音效', '播放聲音', '錄音', '麥克風'] },
  'costume': { label: '造型與繪製', keys: ['造型', '繪製', '畫筆', '繪圖', '旋轉中心'] },
  'variables': { label: '變數與清單', keys: ['變數', '變量', '清單', '列表'] },
  'motion': { label: '座標與移動', keys: ['座標', '坐標', '滑行', '移動', '面向'] },
  'clones': { label: '分身克隆', keys: ['分身', '克隆', '克隆體'] },
  'control': { label: '條件與迴圈', keys: ['如果', '重複', '直到', '等待', '條件判斷'] },
  'operators': { label: '運算與隨機', keys: ['隨機', '運算', '餘數', '四捨五入', '字串'] },
  'input': { label: '鍵鼠互動', keys: ['鍵盤', '按下', '鼠標', '點擊', '拖曳', '觸控'] },
  'procedures': { label: '自製積木', keys: ['自製積木', '函式', '定義'] }
};

/** What the studio can actually build today. A lesson that leans on something outside this list
    cannot be demonstrated by the guide, and the audit says so rather than promising it. */
const STUDIO_OPCODES = (() => {
  try {
    return Object.keys(JSON.parse(readFileSync(new URL('../src/opcodes.json', import.meta.url), 'utf8')).opcodes);
  } catch (e) { return []; }
})();
const has = (p) => STUDIO_OPCODES.some((o) => o.startsWith(p));

const stripTags = (s) => s.replace(/<[^>]+>/g, '\n');

function readLesson(file) {
  const html = readFileSync(file, 'utf8');
  /* The level's own nav is the authoritative tag list (建構 / 編程) — it is the only place that
     says which kind of work a lesson is, so read it before the nav is stripped away. */
  const slug = file.split('/').slice(-2)[0];
  const nav = (html.match(/<select[\s\S]*?<\/select>/) || [''])[0];
  const tags = (nav.match(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g) || [])
    .filter((o) => o.includes('../' + slug + '/'))
    .flatMap((o) => (o.match(/［([^］]+)］/g) || []).map((s) => s.slice(1, -1)));
  const afterNav = html.indexOf('</nav>');
  let body = afterNav > 0 ? html.slice(afterNav) : html;
  body = body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<select[\s\S]*?<\/select>/g, '');
  const lines = stripTags(body).split('\n').map((l) => l.trim()).filter(Boolean);
  const cut = lines.indexOf('AI 延伸課程');
  const core = cut > 0 ? lines.slice(0, cut) : lines;
  const text = core.join('\n');

  const title = (html.match(/<title>([^<]*)<\/title>/) || [, ''])[1].split(' · ')[0];
  const after = (label, n) => {
    const i = core.findIndex((l) => l.startsWith(label));
    return i < 0 ? [] : core.slice(i + 1, i + 1 + n);
  };

  const hits = {};
  for (const [id, c] of Object.entries(CONCEPTS)) {
    const n = c.keys.reduce((a, k) => a + text.split(k).length - 1, 0);
    if (n) hits[id] = n;
  }

  return {
    title, tags,
    focus: after('本課重點', 2),
    hard: after('難點', 2),
    practice: core.includes('動手實踐'),
    tasks: core.filter((l) => l.startsWith('任務')).map((l) => l.replace(/：/g, '：')),
    wonderlab: /Wonder Lab/.test(body),
    hardware: /UC-Mind|主控板|UCMake/.test(body),
    blocks: [...new Set((text.match(/〔([^〕]{1,14})〕/g) || []).map((s) => s.slice(1, -1)))],
    images: (body.match(/<img/g) || []).length,
    concepts: hits
  };
}

function readStarter(slug) {
  const f = join(LAB, slug + '.json');
  if (!existsSync(f)) return null;
  try {
    const d = JSON.parse(readFileSync(f, 'utf8'));
    return {
      sprites: (d.sprites || []).length,
      backdrops: ((d.stage || {}).backdrops || []).length,
      sounds: ((d.stage || {}).sounds || []).length +
              (d.sprites || []).reduce((a, s) => a + ((s.sounds || []).length), 0),
      keys: !!d.keys, colors: (d.colors || []).length
    };
  } catch (e) { return null; }
}

const manifest = (() => {
  try { return JSON.parse(readFileSync(join(LAB, 'manifest.json'), 'utf8')).lessons || {}; }
  catch (e) { return {}; }
})();

const rows = [];
for (const L of LEVELS) {
  const dir = join(CLASSFILES, L, 'lessons');
  if (!existsSync(dir)) continue;
  for (const slug of readdirSync(dir).filter((d) => SLUG.test(d))) {
    const file = join(dir, slug, 'index.html');
    if (!existsSync(file)) continue;
    const lesson = readLesson(file);
    const starter = readStarter(slug);
    const status = (manifest[slug] || {}).status || null;
    rows.push({ level: L, slug, status, starter, ...lesson });
  }
}

const programming = rows.filter((r) => r.status || r.wonderlab || r.hardware || r.practice);
const coverage = {};
for (const r of rows.filter((r) => r.status === 'ready')) {
  for (const c of Object.keys(r.concepts)) coverage[c] = (coverage[c] || 0) + 1;
}

const report = {
  generated: new Date().toISOString().slice(0, 10),
  classfiles: CLASSFILES, lab: LAB,
  levels: LEVELS.map((L) => {
    const sub = rows.filter((r) => r.level === L);
    return {
      level: L, lessons: sub.length,
      taggedProgramming: sub.filter((r) => (r.tags || []).includes('編程')).length,
      hasPracticeSteps: sub.filter((r) => r.practice).length,
      wonderLab: sub.filter((r) => r.wonderlab).length,
      hardware: sub.filter((r) => r.hardware).length
    };
  }),
  studioSupports: {
    sound: has('sound_'), collision: has('sensing_touchingobject'),
    color: has('sensing_touchingcolor'), backdrop: has('looks_switchbackdropto'),
    broadcast: has('event_broadcast'), clones: has('control_create_clone'),
    pen: has('pen_'), procedures: has('procedures_')
  },
  conceptCoverage: coverage,
  lessons: programming
};

writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log('wrote', OUT);
console.log(JSON.stringify(report.levels, null, 1));
console.log('concept coverage (ready lessons):', JSON.stringify(coverage));
console.log('studio supports:', JSON.stringify(report.studioSupports));
for (const r of rows.filter((r) => r.level === 'L4')) {
  console.log(`${r.slug} ${String(r.status || '-').padEnd(5)} ${r.title.slice(0, 14).padEnd(16)} ` +
    `practice=${r.practice ? 'Y' : 'n'} tasks=${String(r.tasks.length).padStart(2)} ` +
    `starter=${r.starter ? `s${r.starter.sprites}/b${r.starter.backdrops}/snd${r.starter.sounds}` : 'none'} ` +
    `${Object.keys(r.concepts).join(',')}`);
}
