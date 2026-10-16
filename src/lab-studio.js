/*!
 * Wonder Lab — the Studio: EVERYTHING this front-end knows about the full block editor.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 (see LICENSE).
 *
 * The editor itself is someone else's program in an iframe from a content-hashed studio-<hex>/ folder. The mount is
 * lab-host.js's job (the lesson lab and the teachers' playground share that one file); what lives HERE is everything
 * a lesson wraps around it:
 *   · whether this page, this login and this screen may use the editor at all (studioDef + the lab GET + 1024 px);
 *   · its prefetch, its pane, its parking spot and its size, and the events it sends back;
 *   · the two ways to work in it — 「AI 幫我砌」 and 「我自己砌」 — and the 助教 that only reads in the second one;
 *   · one AI turn with the editor (studioTurn), the restore point (sprev) and 上一步 (studioUndo).
 *
 * Nothing outside this file names a Studio method, an editor file or a sub-mode: lab-mode.js asks it questions
 * (smode() / curSig() / drawerMode() / phNow()) and calls it, and the read-only lab never loads it.
 *
 * ES5 on purpose (see lab-core.js).
 */
WLR.define('studio', function (L, req) {
  'use strict';
  var C = req('core'), P = req('page');
  var el = C.el, $ = C.$, mq = C.mq, narrow = C.narrow, noop = C.noop, device = C.device;

  // manifest "studio": "studio-<hex>/" (the content-hashed folder of the editor; its page is lab-frame.html).
  // lab-host.js resolves it and owns the frame from here on; this file owns everything around it (the pane, the
  // conversation, the caps, the reload state). Resolved lazily and once: the manifest arrives after this factory runs.
  var hst = null, sbox = null, sdefDone = false, sdef = null;
  var spre = null;                                          // the editor file being prefetched (the frame waits for it: no second download)
  var lockT = null, taEl = null, sbase = null;

  /* ---- may this page open the editor at all? ---- */
  function def() {
    if (!sdefDone) { sdefDone = true; sdef = L.host ? L.host.studioDef(L.man) : null; }
    return sdef;
  }
  function wanted() {
    // ...and there has to be a lesson to open: the editor boots a project built from the lesson's stage, and a
    // stage with no backdrop at all is not a valid SB3 project. A page whose manifest names no lesson data file
    // (src/standalone.js on a bare folder) therefore gets the read-only runtime instead of a failed frame.
    return !!(L.host && def() && L.last && L.last.studio === true && L.info.data
      && (window.innerWidth || document.documentElement.clientWidth || 0) >= 1024 && C.supported());
  }
  function inUse() { return !!(L.studioOn && L.ST); }

  /* ---- the editor's own files, prefetched while the student reads ---- */
  function prefetch() {
    var sd = P.base + def().dir;
    ['scratch-gui-standalone.js', 'studio-lab.js', 'studio-ops.js'].reduce(function (p, f) {
      return p.then(function () {
        if (L.sbooting || L.ST) return;
        spre = fetch(sd + f, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(noop, noop);
        return spre;
      });
    }, Promise.resolve());
  }

  /* ---- the two verbs of the editor, and the 助教 that only reads ---- */
  // Lucide (ISC): wand-sparkles, hand, eye
  var SICO = {
    wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/> <path d="m14 7 3 3"/> <path d="M5 6v4"/> <path d="M19 14v4"/> <path d="M10 2v2"/> <path d="M7 8H3"/> <path d="M21 16h-4"/> <path d="M11 3H9"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/> <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/> <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/> <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/> <circle cx="12" cy="12" r="3"/>'
  };
  function sic(n) {
    return '<svg class="wl-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + SICO[n] + '</svg>';
  }
  var SELF_PH = '問 AI 助教，例如：點解按空白鍵佢唔停？', SELF_HEAD = '你自己砌，AI 助教看了會提問，不會改你的積木';
  var SELF_WAIT = 'AI 助教正在看你的程式…', REVIEW_TEXT = '請助教看看', LOCK_MAX = 60000, ANIM_MAX = 30000;
  var MODE_HINT = { ai: 'AI 幫我砌：說出你的想法，AI 會照你說的砌積木。你也可以隨時自己改。',
                    self: '我自己砌：你自己砌積木。AI 助教只會看你的程式和提問，不會改你的積木。' };
  var MODES = ['ai'], MKEY = 'iits-lab-mode:', smode = 'ai';
  var smodeBar = null, smodeHint = null, sacts = null, bAI = null, bSelf = null, taBtn = null, animBox = null;

  function zsig() { return { runs: 0, stops: 0, undo: 0 }; }
  function curSig() {
    if (!inUse()) return L.sig;
    var a = sbase || zsig(), b = L.ST.sig();
    return { runs: (+a.runs || 0) + (+b.runs || 0), stops: (+a.stops || 0) + (+b.stops || 0), undo: (a.undo || b.undo) ? 1 : 0 };
  }
  function phNow() { return L.studioOn && smode === 'self' ? SELF_PH : C.MSG.LAB_PH; }
  function headLine() { return (L.studioOn && smode === 'self') ? SELF_HEAD : C.MSG.LAB_HEAD; }
  function tabtnDisabled(v) { if (taBtn) taBtn.disabled = !!v; }
  function drawerMode() { return !!L.studioOn && (window.innerWidth || 0) < 1280; }
  function modeNow() { return smode; }

  /** The mode switch (top of the pane) and the actions row (above the box): Wonder Lab with the full editor only. */
  function init() {
    MKEY = 'iits-lab-mode:' + P.ep;
    smodeBar = el('div', 'wl-smode'); smodeHint = el('p', 'wl-smodehint'); sacts = el('div', 'wl-sacts');
    smodeBar.setAttribute('role', 'radiogroup'); smodeBar.setAttribute('aria-label', '砌積木的方式'); smodeBar.hidden = smodeHint.hidden = sacts.hidden = true;
    bAI = el('button', '', sic('wand') + '<span>AI 幫我砌</span>'); bSelf = el('button', '', sic('hand') + '<span>我自己砌</span>');
    [bAI, bSelf].forEach(function (b, i) {
      b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('data-m', i ? 'self' : 'ai'); smodeBar.appendChild(b);
      b.onclick = function () { if (smode !== b.getAttribute('data-m')) setSMode(b.getAttribute('data-m')); };
    });
    smodeBar.addEventListener('keydown', function (e) {
      if (!/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown)$/.test(e.key)) return;
      e.preventDefault();
      var nx = smode === 'ai' ? 'self' : 'ai';
      if (MODES.indexOf(nx) >= 0) { setSMode(nx); (nx === 'ai' ? bAI : bSelf).focus(); }
    });
    taBtn = el('button', 'wl-tabtn', sic('eye') + '<span>' + REVIEW_TEXT + '</span>'); taBtn.type = 'button';
    taBtn.title = 'AI 助教看看你的程式和上次執行的結果，然後問你一個問題（不會改你的積木）';
    taBtn.onclick = function () { sendReview(); };
    animBox = el('label', 'wl-animsw', '<input type="checkbox"><span>AI 改積木時播放動畫</span>'); animBox.hidden = true;
    animBox.querySelector('input').onchange = function () { if (L.ST) L.ST.setAnim(this.checked); syncAnim(); };
    sacts.appendChild(taBtn); sacts.appendChild(animBox);
    if (L.last && L.last.studio === true) {
      MODES = (Array.isArray(L.last.modes) ? L.last.modes : ['ai', 'self']).filter(function (m) { return m === 'ai' || m === 'self'; });
      if (!MODES.length) MODES = ['ai'];
    }
    try { smode = localStorage.getItem(MKEY) || 'ai'; } catch (e) { smode = 'ai'; }
    if (MODES.indexOf(smode) < 0) smode = MODES[0];
    if (L.last && L.last.studio === true && def()) {
      L.ui.bar.parentNode.insertBefore(smodeBar, L.ui.bar.nextSibling);
      smodeBar.parentNode.insertBefore(smodeHint, smodeBar.nextSibling);
      if (P.form && P.form.parentNode) P.form.parentNode.insertBefore(sacts, P.form);
    }
  }
  function syncAnim() {
    var a = L.ST ? L.ST.anim() : { available: false, enabled: false }, cb = animBox.querySelector('input');
    animBox.hidden = !(L.studioOn && smode === 'ai' && a.available);
    cb.checked = !!a.enabled;
  }
  function setSMode(m, quiet) {
    if (MODES.indexOf(m) < 0) m = MODES[0];
    smode = m;
    try { localStorage.setItem(MKEY, m); } catch (e) {}
    [bAI, bSelf].forEach(function (b) {
      var mm = b.getAttribute('data-m'), on = mm === m, ok = MODES.indexOf(mm) >= 0;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; b.hidden = !ok;
    });
    smodeBar.classList.toggle('one', MODES.length < 2);
    smodeHint.textContent = MODE_HINT[m];
    taBtn.hidden = m !== 'self';
    syncAnim();
    document.body.classList.toggle('wl-selfmode', !!L.studioOn && m === 'self');
    if (L.labmode && L.studioOn) L.ui.setHead(m === 'self' ? SELF_HEAD : C.MSG.LAB_HEAD);
    if (L.labmode && L.studioOn && !L.busy) L.mode.lockLab(false);
    if (taEl && taEl.parentNode) { taEl.remove(); taEl = null; }
    if (!quiet && L.labmode) L.chat.add('sys', m === 'self' ? '已轉為「我自己砌」：AI 助教只會看和提問，不會改你的積木。' : '已轉為「AI 幫我砌」：說出你的想法，AI 會照你說的砌積木。');
  }
  function setModeUI(on) { smodeBar.hidden = smodeHint.hidden = sacts.hidden = !on; }

  /* ---- the pane, the parking spot, the size ---- */
  function box() {
    if (sbox) return sbox;
    sbox = el('section', 'wl-studio'); sbox.id = 'wlstudio'; sbox.hidden = true; sbox.setAttribute('aria-label', 'Wonder Lab 積木編輯器');
    // the frame, the shared loading overlay and the error line are lab-host.js's (.wl-host > .wl-sload + .wl-sframe)
    L.ui.pane.parentNode.insertBefore(sbox, L.ui.pane.nextSibling);
    return sbox;
  }
  function park(on) {               // leaving Wonder Lab: the editor keeps running off screen at its size (no re-layout)
    if (!sbox) return;
    if (on && !sbox.classList.contains('wl-park')) {
      var r = sbox.getBoundingClientRect();
      if (r.width && r.height) { sbox.style.width = Math.round(r.width) + 'px'; sbox.style.height = Math.round(r.height) + 'px'; }
      sbox.classList.add('wl-park');
    } else if (!on) { sbox.classList.remove('wl-park'); sbox.style.width = sbox.style.height = ''; }
  }
  function size() {
    var top = L.ui.stickyTop();
    // the drawer hangs below the editor's menu bar, so 上一步 and 「AI 學伴」 (which closes it again) stay in reach
    var fb = sbox && !sbox.classList.contains('wl-park') ? sbox.getBoundingClientRect() : null;
    document.body.style.setProperty('--wl-dtop', (fb && fb.height ? Math.round(fb.top + 48 + 2) : top) + 'px');
    if (L.ST) L.ST.setTools({ drawer: drawerMode() });
  }
  function sClose() { P.chat.classList.remove('open'); document.body.classList.remove('chatopen'); }
  function sOpen() {
    P.chat.classList.add('open'); document.body.classList.add('chatopen');
    if (narrow()) L.ui.parentFull(true);
    setTimeout(function () { L.chat.toEnd(); }, 60);
  }

  function onStudio(type, data) {
    if (type === 'change') { L.mode.save(); return; }
    if (type === 'run') {               // 我自己砌: after a run with hand changes, offer the 助教 (no automatic AI call)
      if (L.labmode) { if (smode === 'self') setTimeout(taChip, 1200); else if (data && data.what === 'start') L.ro.seenChip(); }
      if (!data || data.what !== 'activity') L.mode.save();
      return;
    }
    if (type === 'undo') { studioUndo(); return; }
    if (type === 'chat') { if (P.chat.classList.contains('open')) sClose(); else sOpen(); return; }
  }

  /* ---- the editor itself: lab-host.js resolves the manifest, builds the frame, mounts it in the Studio pane and
     waits for it to be ready (with a timeout), then calls WLStudio.boot(). What stays here is the lesson: its data
     file, the program to restore, the ids the editor keeps, and what each event means for this page. ---- */
  function boot() {
    if (L.sbooting) return L.sbooting;
    var t0 = Date.now(), container = box(), lesson0 = null;
    hst = L.host.create({
      base: P.base, container: container, waitFor: spre, loadingText: 'Wonder Lab 編輯器載入中…',
      // the manifest is already in hand (this lab fetched it for the page): handing it over is what stops the host
      // fetching assets/lab/manifest.json a second time on every page that opens the editor.
      manifest: L.man,
      frame: { id: 'wlsframe', title: 'Wonder Lab 積木編輯器' },
      onEvent: onStudio
    });
    // the lesson file and the frame are fetched together (the frame takes seconds: the JSON must not wait for it)
    L.sbooting = Promise.all([hst.mount(), L.info.data ? L.api.getJSON(P.base + L.info.data) : Promise.resolve(C.emptyLesson(P.slug))]).then(function (r) {
      var lesson = r[1]; lesson0 = lesson;
      L.ro.lessonKeys = !!lesson.keys;
      var s0 = L.st.studio && L.st.studio.project ? L.st.studio : null;
      return hst.boot(lesson, {
        project: s0 ? s0.project : null, sids: s0 ? s0.sids : null, hand: s0 ? s0.hand : 0, assets: s0 ? s0.assets : null,
        program: s0 ? null : (L.st.program || null)
      }).then(function (x) { return x.studio; });
    }).then(function (w) {
      L.ST = window.WLS = w;
      window.WL_BOOT_MS = Date.now() - t0; window.WL_STUDIO = true;
      sbase = (L.st.sig && typeof L.st.sig === 'object') ? { runs: +L.st.sig.runs || 0, stops: +L.st.sig.stops || 0, undo: +L.st.sig.undo || 0 } : zsig();
      if (!L.st.seen) L.st.seen = (L.st.studio || L.st.hist.length) ? L.ST.program() : { sprites: {}, stage: { scripts: {} } };
      L.ST.setTools({ undo: !!L.st.sprev, drawer: drawerMode() });
      setSMode(smode, true);
      if (!L.st.hist.length) { L.chat.add('bot', (lesson0 && lesson0.opening) || C.MSG.REPLAY_OPEN); L.ro.offerRestore(); }
      L.mode.save();
      return L.ST;
    }).catch(function (e) {
      // the editor cannot start on this device: the read-only lab instead, with the same program and conversation
      if (window.console) console.warn('Wonder Lab editor unavailable, read-only lab instead:', e && e.message);
      if (hst) { try { hst.destroy(); } catch (x) {} }      // the frame goes: a half-loaded editor must not stay live
      hst = null; L.studioOn = false; L.ST = null; window.WLS = null;
      if (sbox) sbox.hidden = true;
      document.body.classList.remove('wl-studiomode', 'wl-selfmode'); document.documentElement.classList.remove('wl-studio-on');
      setModeUI(false);
      L.chat.add('sys', '這部裝置未能開啟完整的積木編輯器，改用簡易版 Wonder Lab。');
      if (L.labmode) L.mode.setMode(true);
      return null;
    });
    return L.sbooting;
  }

  /* ---- one turn with the editor ---- */
  function releaseLock() { clearTimeout(lockT); lockT = null; if (L.ST) L.ST.lock(false); }
  function handEdits(a, b) {          // {added|changed|removed: [{sprite, id}]} (AI ids such as s1 repeat across sprites)
    var out = { added: [], changed: [], removed: [] };
    try { (L.ST.diff(a, b) || []).forEach(function (e) { if (out[e.change] && out[e.change].length < 40) out[e.change].push({ sprite: e.sprite, id: e.id }); }); } catch (e) {}
    return out;
  }
  function studioBody(text, kind) {
    var req2 = L.ST.request(), run = L.ST.ran() ? L.ST.report() : (L.st.ran ? (L.st.report || null) : null);
    var b = { text: text, history: L.st.hist.slice(-8), program: req2.program, run: run, note: L.st.note, signals: curSig(), device: device(), mode: smode,
      studio: { targets: req2.targets, editing: req2.editing, hand_edits: handEdits(L.st.seen, req2.program), unsupported: req2.unsupported, text: req2.text } };
    if (kind) b.kind = kind;
    return { body: b, program: req2.program };
  }
  function turnSeen(program) {      // the run and the signals went with this turn; hand edits count from this program on
    L.st.seen = program; L.st.note = null; L.st.report = null; L.st.ran = false; sbase = zsig(); if (L.ST) L.ST.turnDone();
  }
  /** One turn with the full editor: typed words (kind null) or 請助教看看 (kind review, no text). */
  function turn(text, kind) {
    if (!P.input || L.busy || P.input.disabled) return;
    if (!L.ST) {                                 // still loading: keep the words and send them once the editor is ready
      if (!L.pendingSend) { L.pendingSend = true; L.chat.add('sys', 'Wonder Lab 載入中，載入好就會送出'); }
      boot().then(function () { if (L.pendingSend) { L.pendingSend = false; if (L.ST) turn(text, kind); else L.mode.sendLab(); } }, function () { L.pendingSend = false; });
      return;
    }
    if (taEl && taEl.parentNode) { taEl.remove(); taEl = null; }
    var ai = smode === 'ai', review = kind === 'review';
    L.chat.add('me', review ? REVIEW_TEXT : text);
    if (!review) P.input.value = '';
    L.ui.unexplain();
    var w = L.chat.add('bot wait', ai ? '正在照你的想法砌積木…' : SELF_WAIT); L.busy = true; L.mode.lockLab(true);
    L.ST.setTools({ busy: true });
    if (ai) { L.ST.lock(true); clearTimeout(lockT); lockT = setTimeout(releaseLock, LOCK_MAX); }
    var snap = studioBody(review ? '' : text, kind), ctl = window.AbortController ? new AbortController() : null, late = false;
    var abortT = setTimeout(function () { late = true; if (ctl) ctl.abort(); }, LOCK_MAX);
    L.api.labSend(P.ep, snap.body, { signal: ctl ? ctl.signal : undefined })
      .then(L.api.reply)
      .then(function (d) {
        clearTimeout(abortT);
        if (late) throw new Error('late');
        w.remove(); L.busy = false; L.ST.setTools({ busy: false });
        if (!d.ok) {
          releaseLock();
          var code = d._status, soft = code === 429 && d.retry === true, capped = !soft && (code === 429 || code === 404);
          if (code === 413) d.reason = C.MSG.BIG;
          else if (code === 504) d.reason = C.MSG.SLOW;
          L.chat.add(soft ? 'sys wl-soft' : 'sys', d.reason || 'AI 學伴暫時未能回答。');
          if (!capped && !review) P.input.value = text;
          if (code === 429 && !soft && d.reason) L.capsReason = d.reason;
          if (code === 404) L.closedReason = d.reason || 'Wonder Lab 這一課即將推出。';
          L.mode.lockLab(false);
          L.mode.consolNext();
          if (soft) return;
          L.mode.refreshCaps();
          if (code === 429) setTimeout(L.mode.checkCaps, 1000);
          return;
        }
        L.st.hist.push({ role: 'user', content: review ? REVIEW_TEXT : text }, { role: 'assistant', content: ((d.say || '') + ' ' + (d.question || '')).trim() });
        var cs = L.mode.consolClass(d.consol);
        if (d.say) L.chat.add('bot' + cs, d.say);
        if (d.question) L.chat.add('bot wl-q' + cs, d.question);
        L.mode.showConsol(d.consol);
        if (d.masked) L.chat.add('sys', '提醒：個人資料（名字、電話等）不要在網上分享，已幫你遮蓋。');
        var changes = ai && (d.ops || []).length > 0;          // 我自己砌: the 助教 never changes the program (ops ignored)
        turnSeen(snap.program);
        var done;
        if (changes) {
          var before = L.ST.state(600000);
          clearTimeout(lockT); lockT = setTimeout(releaseLock, ANIM_MAX);
          done = L.ST.apply(d, { animate: true, maxMs: 20000 }).then(function (res) {
            L.st.sprev = before; L.st.prev = snap.program; L.ST.setTools({ undo: true });
            L.st.seen = L.ST.program();
            if (res && res.skipped) L.chat.add('sys', '有 ' + res.skipped + ' 個改動未能套用。');
            if (res && res.sideBySide) L.chat.add('sys', '有一段程式用了 AI 看不懂的積木，AI 的版本放在旁邊，你原本的程式沒有改動。');
            return res;
          });
        } else done = Promise.resolve(null);
        return done.then(function () {
          releaseLock();
          if (d.focus || d.focus_sprite) L.ST.glow(typeof d.focus === 'object' ? d.focus : null, d.focus_sprite || (typeof d.focus === 'string' ? d.focus : null));
          L.mode.save();
          L.mode.consolNext();                        // the teacher started the wrap-up while this turn was in flight
          return L.mode.refreshCaps();
        }).then(function () { if (L.labmode && mq('(pointer:fine)') && !P.input.disabled) try { P.input.focus(); } catch (e) {} });
      })
      .catch(function () {
        clearTimeout(abortT); w.remove(); L.busy = false; L.ST.setTools({ busy: false }); releaseLock();
        L.chat.add('sys', late ? C.MSG.SLOW : C.MSG.DOWN); if (!review) P.input.value = text; L.mode.lockLab(false); L.mode.refreshCaps();
      });
  }
  function sendReview() { if (L.studioOn && L.ST && smode === 'self') turn('', 'review'); }
  function taChip() {
    if (!L.ST || L.busy || !L.labmode || smode !== 'self' || (taEl && taEl.parentNode)) return;
    var d = []; try { d = L.ST.diff(L.st.seen, L.ST.program()); } catch (e) {}
    if (!d.length) return;
    taEl = L.chat.chip('想助教看看？', 'wl-ta', function () { taEl = null; sendReview(); });
  }
  function studioUndo() {
    if (!L.ST || !L.st.sprev || L.busy) return;
    var p = L.st.sprev; L.st.sprev = null; L.st.prev = null; L.ST.setTools({ undo: false });
    L.st.note = '（學生按了「上一步」，程式回到 AI 上一次改動之前的版本。）'; sbase = sbase || zsig(); sbase.undo = 1;
    L.ST.loadState(p).then(function (ok) { L.mode.save(); L.chat.add('sys', ok ? '已回到上一步的程式。' : '未能回到上一步。'); });
  }
  function attach() {
    window.addEventListener('pagehide', function () { if (L.studioOn) { releaseLock(); } });
  }

  return { wanted: wanted, inUse: inUse, def: def, prefetch: prefetch, init: init, attach: attach, boot: boot,
           turn: turn, sendReview: sendReview, turnSeen: turnSeen, payload: studioBody, curSig: curSig,
           phNow: phNow, headLine: headLine, tabtnDisabled: tabtnDisabled, drawerMode: drawerMode,
           setSMode: setSMode, setModeUI: setModeUI, size: size, park: park, box: box, sClose: sClose, sOpen: sOpen,
           releaseLock: releaseLock, smode: modeNow };
});
