#!/usr/bin/env node
/**
 * Words the neural voices read wrong.
 *
 * Everything else about a narrated line can be checked without ears: the key exists, the opcode is
 * whitelisted, the actor is in the library. Pronunciation cannot. A polyphonic character is read
 * correctly by luck or not at all, and the result sounds like a sentence that was written by someone
 * who does not speak the language — which, to a seven-year-old being taught by this, is worse than
 * silence.
 *
 * The toolchain gives no way to correct it: edge-tts escapes whatever it is handed and wraps it in
 * its own SSML, so <phoneme> cannot be passed through, and there is no per-voice lexicon to edit.
 * The only lever is the copy. So the rule here is: if a word is read wrong, rewrite the sentence
 * around a word that is read right — and record it here so the next person does not write it again.
 *
 * Confirmed by ear, not by a dictionary. Add an entry the day someone hears one.
 */
export const MISREAD = [
  {
    word: '重做',
    locales: ['zh-Hant', 'zh-Hans'],
    fix: { 'zh-Hant': '重複', 'zh-Hans': '重复' },
    note: 'read as 重 (heavy) 做; 重複/重复 is read correctly and is the word the guide already uses for the loop'
  }
];

/** Every `{ key, word, fix }` in one dictionary, for one locale. */
export function findMisread(dict, locale) {
  const list = MISREAD.filter((m) => !m.locales || m.locales.indexOf(locale) >= 0);
  const out = [];
  Object.keys(dict || {}).forEach((key) => {
    const text = String(dict[key] || '');
    list.forEach((m) => {
      if (text.indexOf(m.word) < 0) return;
      out.push({ key, word: m.word, fix: (m.fix && m.fix[locale]) || null, note: m.note });
    });
  });
  return out;
}

/** One line per offender, ready to print. */
export function describeMisread(locale, hits) {
  return hits.map((h) =>
    '  ' + locale + ' ' + h.key + ': "' + h.word + '" is read wrong' +
    (h.fix ? ' — say "' + h.fix + '" instead' : ' — reword it') + '\n      (' + h.note + ')');
}
