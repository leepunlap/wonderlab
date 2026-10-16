/*!
 * Wonder Lab — the lab's session: which mode it is in, what gates it, what survives a reload, and the wrap-up.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 (see LICENSE).
 *
 * Everything that is true of the lab as a whole rather than of one of its runtimes:
 *   · the lab GET (does this login get the lab, and is the Studio open for it?) and the retry when the network blips;
 *   · the material / Wonder Lab switch, and one lab turn's entry point (sendLab), which hands over to whichever
 *     runtime is running;
 *   · the caps — the same /status gate the Q&A goes through; class time lifts them — and the "turns left" line;
 *   · the session state: the transcript, the restore points and the objective signals, written to sessionStorage so
 *     a reload puts the student back where they were;
 *   · 整合鞏固 / the wrap-up: the poll, the marker and the reply that must not be mistaken for a chat turn.
 *
 * ES5 on purpose (see lab-core.js).
 */
WLR.define('mode', function (L, req) {
  'use strict';
  var C = req('core'), P = req('page');
  var el = C.el, narrow = C.narrow, side = C.side, noop = C.noop, device = C.device;

  var MODEKEY = '', trying = false, tries = 0, retryT = null;
  var pollT = null, cmark = null, consolState = 'off';
  var consolT = null, consolBusy = false, consolWait = 0, consolSeen = false, consolRT = null, consolRetries = 0;
  var CONSOL_ON = { pending: 1, step1: 1, step2: 1 };
  // Every 8 s in lab mode the lab GET is read for consol (no AI call, a small database read). When the teacher has
  // started the wrap-up (consol.pending), a turn with {kind: "consol"} and no text is posted: the AI's first wrap-up
  // question appears without the student typing (the teacher page promises about 20 s: 8 s poll + the AI's answer).
  // 409 = nothing pending any more; 429 retry:true = another turn of this login is in flight: try again in 3 s;
  // 429 without retry = caps: read the caps and let the poll try again. A lab turn that ends while the wrap-up is
  // pending sends it at once (consolNext), so a student who was typing does not wait for the next poll.
  // A new 'pending' is read once more 1.5 s later before anything shows: a 開始整合 that the teacher takes back at
  // once (停止整合 right after) never reaches the student.
  var CONSOL_POLL = 8000, CONSOL_CONFIRM = 1500, CONSOL_RETRY = 3000;
  var CAPROWS = [['lesson_hour_left', '本課每小時'], ['lesson_day_left', '本課每天'], ['student_day_left', '今天全部課']];

  /* ---- the lab GET: may this login open the lab here? the same call returns this student's last program ---- */
  function probe() {
    clearTimeout(retryT); trying = true;
    L.api.labGet(P.ep)
      .then(function (d) {
        trying = false;
        if (d && d.ok) L.ui.whenShown(function () {
          L.ui.bLab.disabled = false; L.ui.bLab.title = '';
          L.main.setup(d);                             // enters lab mode at once if the student asked for it
          C.idle(prefetch);
        });
        else if (d && d.soon) { if (L.wantLab) L.ui.hush(); L.wantLab = false; L.ui.soon(false); }
        else throw new Error('lab reply');
      })
      .catch(function () {
        trying = false; L.ui.whenShown(function () { L.ui.bLab.disabled = false; }); L.ui.bLab.title = C.MSG.NET;
        if (L.wantLab) { L.wantLab = false; L.ui.tell(C.MSG.NET); }
        if (++tries <= 6) retryT = setTimeout(probe, Math.min(30000, 3000 * tries));
      });
  }
  /** The gate the lesson page uses: the server decides whether the lab is open for this login. */
  function arm() {
    L.ui.bLab.disabled = true;
    L.ui.bLab.onclick = function () {                    // used until setup() replaces it
      if (!C.supported()) { L.ui.tell(C.MSG.OLD); return; }
      L.wantLab = true; L.ui.tell('正在連線 Wonder Lab…');
      if (!trying) probe();
    };
    probe();
  }
  /** Download the runtime into the HTTP cache while the student reads the lesson, whichever runtime this page gets. */
  function prefetch() {
    if (L.prefetched || !C.supported()) return; L.prefetched = true;
    var c = navigator.connection; if (c && c.saveData) return;
    if (L.studio.wanted()) L.studio.prefetch(); else L.ro.prefetch();
  }

  /* ---- the session: the transcript, the restore points, the signals, and the mode this page was left in ---- */
  function begin(last) {
    L.last = last || null;
    L.KEY = 'iits-lab:' + P.ep; MODEKEY = 'iits-mode:' + location.pathname;
    L.st = { hist: [], program: null, prev: null, note: null, sig: null, ran: false, report: null, studio: null, sprev: null, seen: null };
    try { var s0 = JSON.parse(sessionStorage.getItem(L.KEY) || 'null'); if (s0 && typeof s0 === 'object') L.st = Object.assign(L.st, s0); } catch (e) {}
    if (!Array.isArray(L.st.hist)) L.st.hist = [];
    L.labmode = false; L.busy = false; L.capsReason = ''; L.closedReason = ''; L.pendingSend = false;
    // since the last turn: objective signals for learning analysis (kept across a reload)
    L.sig = (L.st.sig && typeof L.st.sig === 'object') ? { runs: +L.st.sig.runs || 0, stops: +L.st.sig.stops || 0, undo: +L.st.sig.undo || 0 } : { runs: 0, stops: 0, undo: 0 };
    L.ranSinceTurn = !!L.st.ran;
    window.addEventListener('pagehide', function () { save(); });
  }
  function save() {
    if (L.studioOn && L.ST) return saveStudio();
    try {
      if (L.wl && L.ranSinceTurn && L.wl.trace) L.st.report = L.wl.report();
      sessionStorage.setItem(L.KEY, JSON.stringify({ hist: L.st.hist.slice(-16), program: L.wl ? L.wl.program : L.st.program, prev: L.st.prev, note: L.st.note,
        sig: L.sig, ran: L.ranSinceTurn, report: L.ranSinceTurn ? (L.st.report || null) : null,
        studio: L.wl ? null : L.st.studio, sprev: L.wl ? null : L.st.sprev, seen: L.st.seen }));      // the read-only lab owns the program now
    } catch (e) {}
  }
  // the full editor: the whole project (painted costumes too, within a cap) + script ids, so a reload shows exactly this
  function saveStudio() {
    try {
      var s = L.ST.state(1200000);
      L.st.studio = { project: s.project, sids: s.sids, hand: s.hand, assets: s.assets };
      L.st.program = L.ST.program();
      if (L.ST.ran()) { L.st.ran = true; L.st.report = L.ST.report(); }
    } catch (e) {}
    var base = { hist: L.st.hist.slice(-16), program: L.st.program, prev: L.st.prev, note: L.st.note, sig: L.studio.curSig(), ran: !!L.st.ran,
      report: L.st.ran ? (L.st.report || null) : null, seen: L.st.seen };
    var attempts = [
      { studio: L.st.studio, sprev: L.st.sprev },
      { studio: L.st.studio, sprev: L.st.sprev && { project: L.st.sprev.project, sids: L.st.sprev.sids, hand: L.st.sprev.hand, assets: {} } },
      { studio: L.st.studio && { project: L.st.studio.project, sids: L.st.studio.sids, hand: L.st.studio.hand, assets: {} }, sprev: null },
      { studio: null, sprev: null }];
    for (var i = 0; i < attempts.length; i++) {
      try { sessionStorage.setItem(L.KEY, JSON.stringify(Object.assign({}, base, attempts[i]))); return; } catch (e) {}
    }
  }

  /* ---- the mode switch ---- */
  function setMode(on) {
    if (on && !C.supported()) { L.ui.tell(C.MSG.OLD); return; }
    if (on && L.studioOn === null) L.studioOn = L.studio.wanted();    // decided once: the full editor, or the read-only lab
    L.labmode = on; L.ui.hush();
    document.body.classList.toggle('wl-labmode', on);
    var sOn = on && !!L.studioOn;
    document.body.classList.toggle('wl-studiomode', sOn); document.documentElement.classList.toggle('wl-studio-on', sOn);
    document.body.classList.toggle('wl-selfmode', sOn && L.studio.smode() === 'self');
    L.ui.select(on);
    L.ui.pane.hidden = !on || !!L.studioOn; L.chat.body.hidden = !on; if (P.chbody) P.chbody.hidden = on;
    if (L.studioOn) { var sb = L.studio.box(); sb.hidden = false; L.studio.park(!on); L.studio.setModeUI(on); }
    L.ui.setHead(on ? L.studio.headLine() : L.ui.headText());
    L.ui.setSendLabel(on ? '送出' : P.sendLabel);
    if (P.input && P.send) {
      if (on) lockLab(L.busy);
      else { P.input.placeholder = L.capsReason || P.matPlaceholder; P.input.disabled = P.send.disabled = !!L.capsReason; }
    }
    try { sessionStorage.setItem(MODEKEY, on ? 'lab' : 'mat'); } catch (e) {}
    if (narrow()) L.ui.parentFull(on || P.chat.classList.contains('open'));
    if (on && L.studioOn) {
      L.studio.size(); setTimeout(L.studio.size, 0);
      checkCaps();
      // first visit: the pane shows the opening
      if (L.studio.drawerMode() && !L.st.hist.length && !P.chat.classList.contains('open')) L.studio.sOpen();
      L.studio.boot().then(function (x) {
        if (!x || !L.labmode || !L.studioOn) return;
        L.studio.size(); L.studio.setSMode(L.studio.smode(), true);
        if (consolState === 'pending') sendConsol();             // started before the page was opened
      }).catch(noop);
      clearTimeout(consolT); consolT = setTimeout(consolPoll, CONSOL_POLL);
      return;
    }
    if (on) {
      if (narrow()) { try { window.scrollTo(0, 0); } catch (e) {} }
      if (side() && !P.chat.classList.contains('open')) L.ui.openPane();      // held sideways: the AI 學伴 is the right pane
      L.ui.sizeDrawer();
      checkCaps();
      L.ro.boot().then(function () {
        L.wl.active = L.labmode; L.wl.resize(); var B = window.ScratchBlocks || window.Blockly; try { B.svgResize(L.wl.ws); } catch (e) {}
        L.ui.sizeDrawer(); L.ro.showEmpty(); L.ui.placeZoom();
        if (consolState === 'pending') sendConsol();             // started before the page was opened
      }).catch(noop);
      clearTimeout(consolT); consolT = setTimeout(consolPoll, CONSOL_POLL);
    } else {
      clearTimeout(pollT); clearTimeout(consolT); clearTimeout(consolRT); consolT = consolRT = null; consolSeen = false; L.ui.unexplain();
      if (L.wl) { L.wl.active = false; L.wl.stop(); }
      if (L.ST) { L.studio.releaseLock(); L.ST.stop(); }
    }
  }
  function buttons() {
    L.ui.bMat.onclick = function () { L.ui.hush(); if (L.labmode) setMode(false); };
    L.ui.bLab.onclick = function () { setMode(true); };
    // the chat sheet's close button (narrow screens) must not drop the full-screen frame while the lab is open
    if (P.closeBtn) P.closeBtn.addEventListener('click', function () { if (L.labmode && narrow()) setTimeout(function () { L.ui.parentFull(true); }, 0); });
  }

  /* ---- wrap-up: the marker and its state (整合鞏固, 2026-10-07); the teacher starts it from the portal ---- */
  function wrapup() {
    if (!document.getElementById('wl-consol-css')) {
      var cst = el('style'); cst.id = 'wl-consol-css';
      cst.textContent = '.wl-cmark{display:flex;align-items:center;gap:8px;margin:0;padding:5px 12px;font-size:12.5px;line-height:1.4;color:#5b3fa8;' +
        'background:#f6f1ff;border-bottom:1px solid #ece4f8}.wl-cmark b{display:inline-flex;align-items:center;gap:4px;background:#6a3fc0;color:#fff;' +
        'border-radius:999px;padding:1px 9px;font-size:12px}.wl-cmark[hidden],body:not(.wl-labmode) .wl-cmark{display:none}' +
        '.msg.wl-cs{border-left:3px solid #6a3fc0}';
      document.head.appendChild(cst);
    }
    cmark = el('p', 'wl-cmark', '<b>' + C.ic('bulb') + '<span>整合</span></b><span>AI 學伴想聽你講講自己的做法</span>');
    cmark.hidden = true; cmark.setAttribute('role', 'status');
    L.ui.note.parentNode.insertBefore(cmark, L.ui.note.nextSibling);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && L.labmode) consolPoll(); });
  }
  function showConsol(c) {
    if (!c || typeof c.state !== 'string') return;
    consolState = c.state; cmark.hidden = !CONSOL_ON[c.state];
  }
  /** What class this answer's bubbles get: it belongs to the wrap-up, or it does not. */
  function consolClass(c) {
    var after = c && typeof c.state === 'string' ? c.state : null;
    return after !== 'pending' && (CONSOL_ON[consolState] || after === 'step1' || after === 'step2') ? ' wl-cs' : '';
  }
  // a lab turn has ended: if the wrap-up is still waiting (the poll found it while the turn was in flight), send it now
  function consolNext() { if (consolState === 'pending' && L.labmode) setTimeout(sendConsol, 0); }
  function consolPoll() {
    clearTimeout(consolT); consolT = null;
    if (!L.labmode) return;
    consolT = setTimeout(consolPoll, CONSOL_POLL);
    if (document.hidden || consolBusy) return;
    L.api.labGet(P.ep).then(function (d) {
      if (!d || !d.ok) return;
      var pend = !!(d.consol && d.consol.pending);
      if (pend && !consolSeen && consolState !== 'pending') {
        consolSeen = true; clearTimeout(consolT); consolT = setTimeout(consolPoll, CONSOL_CONFIRM); return;
      }
      consolSeen = false;
      showConsol(d.consol);
      if (pend) sendConsol(); else consolRetries = 0;
    }).catch(noop);
  }
  function sendConsol() {
    if (consolBusy || L.busy || !L.labmode || Date.now() < consolWait || L.capsReason || L.closedReason) return;
    if (L.studioOn ? !L.ST : !L.wl) { L.ro.boot().then(function () { setTimeout(sendConsol, 0); }, noop); return; }
    consolBusy = true; L.busy = true; lockLab(true);
    var w = L.chat.add('bot wait wl-cs', 'AI 學伴正在看你的作品…');
    var snap = L.studioOn ? L.studio.payload('', 'consol') : null;
    var run = L.studioOn ? snap.body.run : (L.ranSinceTurn ? (L.wl.trace ? L.wl.report() : (L.st.report || null)) : null);
    L.api.labSend(P.ep, L.studioOn ? (function () { var b = snap.body; delete b.text; return b; })()
        : { kind: 'consol', history: L.st.hist.slice(-8), program: L.wl.program, run: run, note: L.st.note, signals: L.sig, device: device() })
      // the wrap-up reads a reply more strictly than a chat turn: a body that is not JSON (a proxy's own 429 page,
      // say) must NOT look like "another turn is in flight", so retry stays undefined here
      .then(L.api.replyStrict)
      .then(function (d) {
        w.remove(); L.busy = false; consolBusy = false; lockLab(false);
        if (!d.ok) {
          if (d.consol) showConsol(d.consol);
          clearTimeout(consolRT); consolRT = null;
          if (d._status === 429 && d.retry === true) {                   // a turn in flight: soon, not at the next poll
            if (++consolRetries <= 10) consolRT = setTimeout(function () { consolRT = null; if (consolState === 'pending') sendConsol(); }, CONSOL_RETRY);
          } else if (d._status === 429) refreshCaps();
          else if (d._status !== 409) consolWait = Date.now() + 60000;   // AI down: wait a minute
          return;
        }
        consolRetries = 0; clearTimeout(consolRT); consolRT = null;
        L.st.hist.push({ role: 'assistant', content: ((d.say || '') + ' ' + (d.question || '')).trim() });
        if (d.say) L.chat.add('bot wl-cs', d.say);
        if (d.question) L.chat.add('bot wl-q wl-cs', d.question);
        showConsol(d.consol);
        L.ranSinceTurn = false; L.st.note = null; L.st.report = null; L.sig = { runs: 0, stops: 0, undo: 0 };   // the run went with this turn
        if (L.studioOn && L.ST) { L.studio.turnSeen(snap.program); if (d.focus || d.focus_sprite) L.ST.glow(typeof d.focus === 'object' ? d.focus : null, d.focus_sprite || null); }
        save();
        if (L.studioOn) { if (L.studio.drawerMode() && !P.chat.classList.contains('open')) L.studio.sOpen(); }   // the drawer opens so it is seen
        else if (narrow() && !P.chat.classList.contains('open') && P.fab) P.fab.click();      // tablets: open the drawer so it is seen
        setTimeout(function () { L.chat.toEnd(); }, 350);     // after the drawer has its height
        refreshCaps();
      })
      .catch(function () { w.remove(); L.busy = false; consolBusy = false; lockLab(false); consolWait = Date.now() + 60000; });
  }

  /* ---- caps: the lab goes through the same /status gate as the chat (class time lifts the caps) ---- */
  function showLeft(s) {
    var b = null;
    if (s && s.ok && !s.in_class) CAPROWS.forEach(function (r) { var v = s[r[0]]; if (typeof v === 'number' && (!b || v < b[0])) b = [v, r[1]]; });
    L.ui.leftEl.hidden = !b;
    if (b) { L.ui.leftEl.textContent = 'Wonder Lab 剩 ' + Math.max(0, b[0]) + ' 次（' + b[1] + '）'; L.ui.leftEl.className = 'wl-left' + (b[0] > 0 ? '' : ' out'); }
  }
  function poll() { clearTimeout(pollT); pollT = null; if (L.labmode && L.capsReason) pollT = setTimeout(checkCaps, 30000); }
  function checkCaps() {
    return L.api.status(P.ep).then(function (s) {
      L.capsReason = (s && s.ok && s.reason) || '';
      showLeft(s);
      if (!L.busy) lockLab(false);
      poll();
      return s;
    }).catch(function () { if (!L.busy) lockLab(false); poll(); });
  }
  function refreshCaps() { try { document.dispatchEvent(new CustomEvent('iits:caps')); } catch (e) {} return checkCaps(); }
  function lockLab(on, why) {
    if (!P.input || !P.send || !L.labmode) return;
    var stop = L.capsReason || L.closedReason;
    P.input.disabled = P.send.disabled = !!on || !!stop;
    P.input.placeholder = (on && why) || stop || L.studio.phNow();
    L.studio.tabtnDisabled(P.input.disabled);
  }
  function caps() {
    // chat.js repaints the box for the Q&A (e.g. 「輸入你的問題…」 when a class starts): put the lab wording back
    if (P.input && window.MutationObserver) new MutationObserver(function () {
      if (L.labmode && !L.busy && !L.capsReason && !L.closedReason && !P.input.disabled && P.input.placeholder !== L.studio.phNow()) P.input.placeholder = L.studio.phNow();
    }).observe(P.input, { attributes: true, attributeFilter: ['placeholder', 'disabled'] });
    // the class line changes (a class starts or ends): read the caps again at once
    var clsLine = P.capsBox && P.capsBox.querySelector('.cpclass'), wasIn = clsLine ? clsLine.classList.contains('in') : false;
    if (clsLine && window.MutationObserver) new MutationObserver(function () {
      var now = clsLine.classList.contains('in'); if (now !== wasIn) { wasIn = now; if (L.labmode) checkCaps(); }
    }).observe(clsLine, { attributes: true, attributeFilter: ['class'] });
  }

  /** The end of the wiring: the wrap-up state, and the mode this page was left in. */
  function finish() {
    // reopen in lab mode after a reload, from a #lab link, or because the toggle was tapped while the probe retried
    showConsol(L.last && L.last.consol);
    var startLab = L.wantLab || location.hash === '#lab';
    L.wantLab = false;
    try { startLab = startLab || sessionStorage.getItem(MODEKEY) === 'lab'; } catch (e) {}
    if (P.startInLab === true) startLab = true;          // a page that IS the lab (src/standalone.js) says so
    else if (P.startInLab === false) startLab = false;   // a page that wants the material view first says so
    if (startLab) setMode(true);
  }

  /** One lab turn from the box: whichever runtime is running takes it. */
  function sendLab() {
    if (!P.input) return;
    var text = (P.input.value || '').trim();
    if (!text || L.busy || P.input.disabled) return;
    if (L.studioOn) return L.studio.turn(text, null);
    return L.ro.turn(text);
  }

  return { arm: arm, probe: probe, prefetch: prefetch, begin: begin, finish: finish, setMode: setMode, buttons: buttons,
           wrapup: wrapup, caps: caps, sendLab: sendLab, lockLab: lockLab, checkCaps: checkCaps, refreshCaps: refreshCaps,
           save: save, showConsol: showConsol, consolClass: consolClass, consolNext: consolNext };
});
