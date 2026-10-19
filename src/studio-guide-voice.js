/*!
 * Wonder Lab Studio — the guide, out loud.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS IS
 * Narration and subtitles for the guide. `say(['guide.motion.a1.title', 'guide.motion.a1.body'])`
 * plays the step in Microsoft Edge's voice and shows each line over the stage as it is spoken.
 *
 * WHERE THE AUDIO COMES FROM
 * tools/build_voice.mjs bakes one mp3 per line per language, with the clip's own cue track. So the
 * subtitle is not an estimate: it is the timing the voice actually used, and what is heard and what
 * is read cannot drift apart. Nothing here calls a service, which is why the guide still speaks on a
 * school network that blocks everything but the school's own server.
 *
 * WHEN THERE IS NO CLIP
 * A newly written step, a language added without rebuilding, a broken fetch: the line is read by the
 * browser instead, preferring an Edge natural voice when the page is running in Edge. Failing even
 * that, the cue track is played on a timer, so the subtitles still work with the sound off. A missing
 * voice must never mean a silent, unmoving step.
 *
 * WHAT IT DOES NOT OWN
 * The words (locale files) and when to speak (studio-guide.js). This file knows about audio, one
 * strip of text over the stage, and a preference that survives a reload.
 *
 * ES5, like the rest of the studio's own code: this ships to old browsers.
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var PREF = 'wl.voice';
  var MIN_CUE = 900;         // ms: below this a subtitle is a flash, not a line
  var EDGE_LANG = { 'zh-Hant': 'zh-HK', 'zh-Hans': 'zh-CN', en: 'en-GB' };
  var WANT = { 'zh-Hant': ['zh-hk', 'zh-tw', 'zh'], 'zh-Hans': ['zh-cn', 'zh'], en: ['en-gb', 'en-us', 'en'] };

  function noop() {}

  function create(cfg) {
    cfg = cfg || {};

    var i18n = cfg.i18n || (root.StudioI18n && typeof root.StudioI18n.t === 'function' ? root.StudioI18n : null);
    var base = cfg.base == null ? 'assets/voice/' : cfg.base;
    function T(k) { return i18n ? i18n.t(k) : k; }
    function locale() { return i18n && typeof i18n.locale === 'function' ? i18n.locale() : 'zh-Hant'; }

    var manifest = null;
    var loading = null;
    var on = readPref();
    var sub = null;            // the strip over the stage
    var audio = null;          // the clip currently playing
    var timers = [];
    var seq = 0;               // bumped by every say/stop: stale callbacks find a different number

    /* ---------- the preference ---------- */
    function readPref() {
      try { return root.localStorage.getItem(PREF) !== 'off'; } catch (e) { return true; }
    }

    /** Read or set the mute. Silent by choice is a decision, so it is remembered. */
    function enabled(v) {
      if (v === undefined) return on;
      on = !!v;
      try { root.localStorage.setItem(PREF, on ? 'on' : 'off'); } catch (e) { /* private mode */ }
      if (!on) stop();
      return on;
    }

    /* ---------- the strip ---------- */
    function strip() {
      if (sub) return sub;
      sub = doc.createElement('div');
      sub.className = 'wl-sub';
      sub.setAttribute('aria-hidden', 'true');   // the same words are already in the pane's step card
      sub.hidden = true;
      doc.body.appendChild(sub);
      return sub;
    }

    function stageRect() {
      var a = cfg.anchor ? cfg.anchor() : doc.querySelector('[class*="stage-wrapper_stage-wrapper"]');
      return a ? a.getBoundingClientRect() : null;
    }

    /** Over the bottom of the stage, because that is the thing being narrated. */
    function place() {
      var s = strip(), r = stageRect();
      if (!r || !r.width) {
        s.style.left = '50%';
        s.style.transform = 'translateX(-50%)';
        s.style.width = 'auto';
        s.style.maxWidth = 'min(560px, 88vw)';
        s.style.bottom = '24px';
        return;
      }
      s.style.transform = 'none';
      s.style.left = Math.round(r.left + 10) + 'px';
      s.style.width = Math.round(r.width - 20) + 'px';
      s.style.maxWidth = 'none';
      s.style.bottom = Math.round(root.innerHeight - r.bottom + 10) + 'px';
    }

    function cue(text) {
      var s = strip();
      if (!text) { s.hidden = true; s.textContent = ''; return; }
      s.textContent = text;
      s.hidden = false;
      place();
    }

    if (root.addEventListener) {
      root.addEventListener('resize', function () { if (sub && !sub.hidden) place(); });
    }

    /* ---------- the manifest ---------- */
    /** Resolves to the clip map; `manifest` keeps the whole file for anything that asks about voices. */
    function clips() {
      if (loading) return loading;
      if (typeof root.fetch !== 'function') { manifest = null; return Promise.resolve(null); }
      loading = root.fetch(base + 'manifest.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { manifest = j; return j && j.clips ? j.clips : null; })
        .catch(function () { manifest = null; return null; });
      return loading;
    }

    /* ---------- reading it instead ---------- */
    function estimate(text) {
      var cjk = (String(text).match(/[\u3400-\u9FFF\u3040-\u30FF]/g) || []).length;
      var rest = String(text).length - cjk;
      return Math.max(MIN_CUE, Math.round(cjk * 265 + rest * 72) + 260);
    }

    /** Sentence-sized cues, because a subtitle that appears whole for nine seconds is not a subtitle. */
    function systemCues(text) {
      var out = [];
      (String(text || '').match(/[^。！？!?…]+[。！？!?…]*/g) || []).forEach(function (raw) {
        var p = raw.trim();
        if (!p) return;
        while (p.length > 42) {
          var at = Math.max(p.lastIndexOf('，', 42), p.lastIndexOf('、', 42), p.lastIndexOf(',', 42), p.lastIndexOf(' ', 42));
          if (at < 12) at = 42;
          out.push({ s: p.slice(0, at + 1).trim(), d: estimate(p.slice(0, at + 1)) });
          p = p.slice(at + 1).trim();
        }
        if (p) out.push({ s: p, d: estimate(p) });
      });
      if (!out.length && String(text || '').trim()) out.push({ s: String(text).trim(), d: estimate(text) });
      return out;
    }

    /** The best voice this browser has for the language, Edge's natural ones first. */
    function pickVoice(lang) {
      var synth = root.speechSynthesis;
      if (!synth || typeof synth.getVoices !== 'function') return null;
      var voices = synth.getVoices() || [];
      var want = WANT[lang] || WANT['zh-Hant'];
      var best = null, bestScore = -1;
      voices.forEach(function (v) {
        var tag = String(v.lang || '').replace('_', '-').toLowerCase(), rank = 0;
        for (var i = 0; i < want.length && !rank; i++) if (tag.indexOf(want[i]) === 0) rank = want.length - i;
        if (!rank) return;
        var score = rank * 10;
        if (/natural|online/i.test(v.name)) score += 20;   // what Edge calls its neural voices
        if (/microsoft|edge/i.test(v.name)) score += 10;
        if (score > bestScore) { bestScore = score; best = v; }
      });
      return best;
    }

    /**
     * The same lines the clips would have spoken, split by sentence. One cue per sentence, and one
     * per key: a heading read inside the body's first sentence reads as one long run-on.
     */
    function cuesFor(keys) {
      var out = [];
      keys.forEach(function (k) {
        var text = T(k);
        if (text) systemCues(text).forEach(function (c) { out.push(c); });
      });
      return out;
    }

    function speakWithSystem(keys, mine) {
      strip().setAttribute('data-from', 'voice');
      var list = cuesFor(keys);
      var synth = root.speechSynthesis, U = root.SpeechSynthesisUtterance;
      if (!synth || !U) return timed(list, mine);
      var lang = locale(), voice = pickVoice(lang), i = 0;
      return new Promise(function (resolve) {
        function next() {
          if (mine !== seq) return resolve(false);
          if (i >= list.length) { cue(''); return resolve(true); }
          var c = list[i++] ;
          cue(c.s);
          var u = new U(c.s);
          u.lang = EDGE_LANG[lang] || 'zh-HK';
          u.rate = 0.95;
          if (voice) u.voice = voice;
          u.onend = next;
          u.onerror = next;
          try { synth.speak(u); } catch (e) { timed(list.slice(i - 1), mine).then(resolve); }
        }
        next();
      });
    }

    /** No voice at all: the subtitles still have to move. */
    function timed(list, mine) {
      strip().setAttribute('data-from', 'timed');
      return new Promise(function (resolve) {
        var i = 0;
        function step() {
          if (mine !== seq) return resolve(false);
          if (i >= list.length) { cue(''); return resolve(true); }
          var c = list[i++];
          cue(c.s);
          timers.push(setTimeout(step, Math.max(MIN_CUE, c.d || estimate(c.s))));
        }
        step();
      });
    }

    /* ---------- the audio ---------- */
    /**
     * One clip. The element is attached to the document rather than kept as a bare Audio(): an
     * unattached media element is collectable in the middle of its own playback, and a clip that
     * stops firing `ended` leaves the next line unspoken and the subtitle stuck on the wrong words.
     */
    function playClip(clip, mine) {
      strip().setAttribute('data-from', 'clip');
      return new Promise(function (resolve) {
        var a = new root.Audio(base + clip.file);
        a.preload = 'auto';
        a.hidden = true;
        a.setAttribute('aria-hidden', 'true');
        doc.body.appendChild(a);
        audio = a;
        var shown = -1;
        var guard = null;
        function drop() {
          if (guard) { clearTimeout(guard); guard = null; }
          if (a.parentNode) a.parentNode.removeChild(a);
        }
        function tick() {
          if (mine !== seq) return;
          var t = a.currentTime * 1000, hit = -1;
          for (var i = 0; i < clip.cues.length; i++) if (t >= clip.cues[i].t) hit = i;
          if (hit !== shown) { shown = hit; cue(hit >= 0 ? clip.cues[hit].s : ''); }
        }
        a.addEventListener('timeupdate', tick);
        a.addEventListener('ended', function () {
          drop();
          if (mine === seq) { audio = null; cue(''); }
          resolve(true);
        });
        a.addEventListener('error', function () { drop(); if (mine === seq) audio = null; resolve(false); });
        /* A clip that stops making progress — no audio device, a throttled tab, a decoder that gave
           up — must not hold the step hostage: after its own length plus a margin, the element is
           dropped and the rest of the line is shown on a timer. */
        guard = setTimeout(function () {
          drop();
          if (mine !== seq) return resolve(false);
          audio = null;
          timed(clip.cues, mine).then(resolve);
        }, (clip.ms || 8000) + 2500);
        var p = a.play();
        // a refused playback is not a failed step: the cues still read correctly on a timer
        if (p && typeof p.catch === 'function') {
          p.catch(function () { timed(clip.cues, mine).then(resolve); });
        }
      });
    }

    /* ---------- the verb ---------- */
    /**
     * Narrate these keys, in order, in the language the pane is in. Resolves when the last line has
     * been spoken (or abandoned); resolves false if there was nothing to say.
     */
    function say(keys) {
      var list = (keys || []).filter(Boolean);
      if (!on || !list.length) return Promise.resolve(false);
      stop();
      var mine = seq;
      return clips().then(function (m) {
        if (mine !== seq) return false;
        var lang = locale();
        var entries = list.map(function (k) {
          return { text: T(k), clip: m ? m[k + '|' + lang] : null };
        }).filter(function (e) { return e.text; });
        if (!entries.length) return false;
        if (!entries.some(function (e) { return e.clip; })) return speakWithSystem(list, mine);
        var i = 0;
        function next() {
          if (mine !== seq) return false;
          if (i >= entries.length) { cue(''); return true; }
          var e = entries[i++];
          // a line with no clip is read by the browser rather than skipped: the step is not half-silent
          if (e.clip) return playClip(e.clip, mine).then(next);
          return timed(systemCues(e.text), mine).then(next);
        }
        return next();
      });
    }

    function stop() {
      seq++;
      timers.forEach(clearTimeout);
      timers = [];
      if (audio) {
        try { audio.pause(); } catch (e) { /* already gone */ }
        if (audio.parentNode) audio.parentNode.removeChild(audio);
        audio = null;
      }
      if (root.speechSynthesis) { try { root.speechSynthesis.cancel(); } catch (e) { /* nothing queued */ } }
      if (sub) { sub.hidden = true; sub.textContent = ''; }
    }

    // some browsers hand over the voice list a moment after the page loads
    if (root.speechSynthesis && typeof root.speechSynthesis.addEventListener === 'function') {
      root.speechSynthesis.addEventListener('voiceschanged', noop);
    }

    return {
      say: say,
      stop: stop,
      enabled: enabled,
      /** which voice a clip is in, for a page that wants to say so */
      voice: function (lang) { return (manifest && manifest.voices && manifest.voices[lang || locale()]) || null; }
    };
  }

  root.StudioGuideVoice = { create: create };
}(typeof window !== 'undefined' ? window : this));
