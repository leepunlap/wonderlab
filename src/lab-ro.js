/*!
 * Wonder Lab — the read-only runtime: the engine, the stage, the blocks, the toolbar and the restore offer.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 (see LICENSE).
 *
 * This is the lab a lesson gets when the build has no Studio, when the lab GET says studio:false, or when the
 * screen is too narrow for the editor — and the lab the standalone entry falls back to when there is no studio
 * folder to mount. It owns:
 *   · the engine prefetch (one file at a time while the student reads) and the boot;
 *   · the empty-state line, the arrow pad and the run / stop / undo toolbar;
 *   · one lab turn over src/wonderlab.js (the model the AI's ops are applied to);
 *   · the "load what you did last time" offer.
 * It never mounts anything: the editor belongs to lab-studio.js, and the host (lab-host.js) belongs to neither.
 *
 * ES5 on purpose (see lab-core.js).
 */
WLR.define('ro', function (L, req) {
  'use strict';
  var C = req('core'), P = req('page');
  var el = C.el, $ = C.$, narrow = C.narrow, side = C.side, mq = C.mq, device = C.device;

  var pre = {}, lessonKeys = false, undoBtn = null, seenEl = null;

  /* ---- prefetch: download the engine into the HTTP cache while the student reads the lesson (one file at a time);
     boot() waits for a file that is still downloading instead of fetching it twice. ---- */
  function prefetch() {
    var eng = P.base + L.man.engine;
    C.scripts(L.man).reduce(function (p, f) {
      return p.then(function () {
        if (L.booting || L.wl) return;
        pre[f] = fetch(eng + f, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(C.noop, C.noop);
        return pre[f];
      });
    }, Promise.resolve());
  }

  /** The lesson's own data file, or an empty lesson when this manifest names none (the standalone case). */
  function lesson() {
    if (!L.info.data) return Promise.resolve(C.emptyLesson(P.slug));
    return L.api.getJSON(P.base + L.info.data);
  }

  function loadScript(src) {
    return new Promise(function (ok, bad) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = function () { bad(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function boot() {
    if (L.booting) return L.booting;
    var eng = P.base + L.man.engine, t0 = Date.now(), n = 0, load = $('wlload'), NS = C.scripts(L.man).length || 5;
    load.hidden = false; load.textContent = 'Wonder Lab 載入中… 0/' + NS;
    L.booting = C.scripts(L.man).reduce(function (p, f) {
      return p.then(function () { return pre[f] || null; })
        .then(function () { return loadScript(eng + f); })
        .then(function () { n += 1; load.textContent = 'Wonder Lab 載入中… ' + n + '/' + NS; });
    }, Promise.resolve())
      // a standalone manifest may name no lesson data file at all: the lab still boots, with an empty lesson
      .then(function () { return Promise.all([L.api.getJSON(eng + 'opcodes.json'), lesson()]); })
      .then(function (r) {
        var wl = L.wl = window.WL = new window.WonderLab({ spec: r[0], lesson: r[1], assetBase: new URL(L.man.assets || 'a/', P.base).href, mediaBase: eng + 'media/',
          el: { stage: $('wlstage'), blocks: $('wlblocks'), tabs: $('wltabs'), monitors: $('wlmons'), ask: $('wlask') } });
        wl.boot();
        lessonKeys = !!r[1].keys;
        // the blocks area changes size without a window resize (the right pane opens or closes, the pad shows)
        if (window.ResizeObserver) new window.ResizeObserver(function () {
          var B = window.ScratchBlocks || window.Blockly; try { B.svgResize(wl.ws); } catch (e) {}
          L.ui.placeZoom();
        }).observe($('wlblocks'));
        return wl.load(L.st.program || window.WonderLab.empty()).then(function () {
          load.hidden = true; window.WL_BOOT_MS = Date.now() - t0;
          showEmpty(); showPad(); L.ui.placeZoom();
          if (!L.st.hist.length) { L.chat.add('bot', r[1].opening || C.MSG.REPLAY_OPEN); offerRestore(); }
        });
      })
      .catch(function (e) { load.textContent = 'Wonder Lab 載入失敗，請重新整理頁面。'; L.booting = null; throw e; });
    return L.booting;
  }

  /* ---- the empty state and the arrow pad ---- */

  function hasScripts(p) {
    if (!p) return false;
    var n = 0; Object.keys(p.sprites || {}).forEach(function (k) { n += Object.keys((p.sprites[k] || {}).scripts || {}).length; });
    return n + Object.keys((p.stage || {}).scripts || {}).length > 0;
  }
  // no blocks yet: say where the AI 學伴 is on this screen (the right pane, or the 問 AI 學伴 button on a phone or a
  // tablet held upright); the zoom buttons hide while there is nothing to zoom (lab.css .wl-noblocks)
  function emptyText() {
    return '還沒有積木。' + (narrow() && !side() ? '按右下角「問 AI 學伴」，說說你的想法' : '在右邊說說你的想法') + '，AI 會照你說的砌出來。';
  }
  function showEmpty() {
    var e = $('wlempty'), none = !hasScripts(L.wl ? L.wl.program : L.st.program);
    e.hidden = !none; L.ui.pane.classList.toggle('wl-noblocks', none);
    if (none && e.textContent !== emptyText()) e.textContent = emptyText();
  }
  // the arrow pad and the keyboard hint: only for a lesson played with keys (lesson json "keys") or a program that reads keys
  function usesKeys(p) { try { return /"(event_whenkeypressed|sensing_keypressed)"/.test(JSON.stringify(p || {})); } catch (e) { return false; } }
  function showPad() {
    var on = lessonKeys || usesKeys(L.wl ? L.wl.program : L.st.program), pad = $('wlpad'), hint = L.ui.pane.querySelector('.wl-hint');
    if (pad.hidden === !on) return;
    pad.hidden = hint.hidden = !on;
    if (L.labmode) L.ui.sizeDrawer();
  }
  function afterChange() { L.mode.save(); showEmpty(); showPad(); L.ui.placeZoom(); }
  function showNew() { if (L.wl && L.wl.showNew) L.wl.showNew(); }

  /* ---- a program kept on the server (another tab / device): offer it, never load it silently ---- */
  function offerRestore() {
    Promise.resolve(L.last).then(function (d) {
      if (!d || !d.ok || !d.program || !hasScripts(d.program)) return;
      L.chat.chip('載入你上次在這一課的程式' + (d.when ? '（' + d.when + '）' : ''), '', function () {
        if (L.studioOn && L.ST) {
          L.st.sprev = L.ST.state(600000); L.ST.setTools({ undo: true });
          L.ST.loadProgram(d.program).then(function () { L.st.seen = L.ST.program(); L.mode.save(); });
          L.chat.add('sys', '已載入上次的程式。按「上一步」可以回到空白。');
          return;
        }
        L.st.prev = L.wl.program; undoBtn.disabled = false;
        L.wl.applyTurn({ program: d.program, ops: [] }).then(afterChange);
        L.chat.add('sys', '已載入上次的程式。按「上一步」可以回到空白。');
      });
    }).catch(C.noop);
  }

  /* ---- one lab turn over the read-only runtime ---- */
  function turn(text) {
    if (!L.wl) {                                 // still loading: keep the words and send them once the lab is ready
      if (!L.pendingSend) { L.pendingSend = true; L.chat.add('sys', 'Wonder Lab 載入中，載入好就會送出'); }
      boot().then(function () { if (L.pendingSend) { L.pendingSend = false; L.mode.sendLab(); } }, function () { L.pendingSend = false; });
      return;
    }
    L.chat.add('me', text); P.input.value = ''; L.ui.unexplain();
    var w = L.chat.add('bot wait', '正在照你的想法砌積木…'); L.busy = true; L.mode.lockLab(true);
    var run = L.ranSinceTurn ? (L.wl.trace ? L.wl.report() : (L.st.report || null)) : null;
    L.api.labSend(P.ep, { text: text, history: L.st.hist.slice(-8), program: L.wl.program, run: run, note: L.st.note, signals: L.sig, device: device() })
      .then(L.api.reply)
      .then(function (d) {
        w.remove(); L.busy = false;
        if (!d.ok) {
          // 429 with retry: another turn of this login is still in flight (a second tab, or the shared class login):
          // nothing is capped, so the words stay in the box and the reason is only a line in the conversation
          var code = d._status, soft = code === 429 && d.retry === true, capped = !soft && (code === 429 || code === 404);
          if (code === 413) d.reason = C.MSG.BIG;
          else if (code === 504) d.reason = C.MSG.SLOW;
          L.chat.add(soft ? 'sys wl-soft' : 'sys', d.reason || 'AI 學伴暫時未能回答。');
          if (!capped) P.input.value = text;     // keep the student's words to send again
          if (code === 429 && !soft && d.reason) L.capsReason = d.reason;
          if (code === 404) L.closedReason = d.reason || 'Wonder Lab 這一課即將推出。';
          L.mode.lockLab(false);
          L.mode.consolNext();
          if (soft) return;
          L.mode.refreshCaps();
          if (code === 429) setTimeout(L.mode.checkCaps, 1000);
          return;
        }
        L.st.hist.push({ role: 'user', content: text }, { role: 'assistant', content: ((d.say || '') + ' ' + (d.question || '')).trim() });
        // this answer belongs to the wrap-up: it was running before the turn (step 1 / 2, or pending and this turn
        // became step 1), or the turn started it (the class switch). Still 'pending' after the turn = the teacher
        // started it while this ordinary turn ran: not a wrap-up answer; consolNext() sends the wrap-up next.
        var cs = L.mode.consolClass(d.consol);
        if (d.say) L.chat.add('bot' + cs, d.say);
        if (d.question) L.chat.add('bot wl-q' + cs, d.question);
        L.mode.showConsol(d.consol);
        if (d.masked) L.chat.add('sys', '提醒：個人資料（名字、電話等）不要在網上分享，已幫你遮蓋。');
        var changed = (d.ops || []).length > 0;
        if (changed) { L.st.prev = L.wl.program; undoBtn.disabled = false; }
        L.ranSinceTurn = false; L.st.note = null; L.st.report = null; L.sig = { runs: 0, stops: 0, undo: 0 };
        return L.wl.applyTurn(d).then(function () {
          afterChange();
          L.mode.consolNext();                 // the teacher started the wrap-up while this turn was in flight
          if (changed) {
            if (narrow()) L.ui.lookChip();
            setTimeout(showNew, 60);
          }
          return L.mode.refreshCaps();
        }).then(function () { if (L.labmode && mq('(pointer:fine)') && !P.input.disabled) try { P.input.focus(); } catch (e) {} });
      })
      .catch(function () { w.remove(); L.busy = false; L.chat.add('sys', C.MSG.DOWN); P.input.value = text; L.mode.lockLab(false); L.mode.refreshCaps(); });
  }

  /* ---- toolbar (a button clicked with a pointer gives the keyboard back to the stage) ---- */
  function toolbar() {
    undoBtn = $('wlundo');
    undoBtn.disabled = !L.st.prev;
    $('wlexport').onclick = function (ev) { L.ui.explain(C.MSG.EXPORT); if (ev && ev.detail) this.blur(); };
    $('wlrun').onclick = function (ev) {
      if (!L.wl) return;
      if (P.input) P.input.blur();
      L.wl.run(); L.ranSinceTurn = true; L.sig.runs += 1; L.mode.save(); L.ui.unexplain();
      if (narrow() && !side() && P.chat.classList.contains('open')) L.ui.closePane();      // the drawer gives the stage back
      L.ui.underBar($('wlstage'), true);                                                  // the output must be on screen
      seenChip();
      if (ev && ev.detail) this.blur();
    };
    $('wlstop').onclick = function (ev) { if (L.wl) { L.wl.stop(); L.sig.stops += 1; L.mode.save(); } if (ev && ev.detail) this.blur(); };
    undoBtn.onclick = function () {
      if (!L.wl || !L.st.prev) return;
      var p = L.st.prev; L.st.prev = null; undoBtn.disabled = true;
      L.st.note = '（學生按了「上一步」，程式回到 AI 上一次改動之前的版本。）'; L.sig.undo = 1;
      L.wl.applyTurn({ program: p, ops: [] }).then(afterChange);
      L.mode.save();
      L.chat.add('sys', '已回到上一步的程式。');
    };
    Array.prototype.forEach.call(document.querySelectorAll('#wlpad button'), function (b) {
      var k = b.getAttribute('data-k');
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); if (L.wl) L.wl.key(k, true); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { b.addEventListener(ev, function () { if (L.wl) L.wl.key(k, false); }); });
    });
  }
  function seenChip() {
    if (seenEl && seenEl.parentNode) return;
    seenEl = L.chat.chip('說說你看到甚麼……', 'wl-seen', function () {
      seenEl = null;
      if (P.input) { P.input.value = '我看到'; try { P.input.focus(); } catch (e) {} }
    });
  }
  function undoEl() { return undoBtn; }

  return { prefetch: prefetch, boot: boot, turn: turn, toolbar: toolbar, offerRestore: offerRestore,
           showEmpty: showEmpty, showPad: showPad, afterChange: afterChange, showNew: showNew,
           hasScripts: hasScripts, usesKeys: usesKeys, seenChip: seenChip, undoEl: undoEl,
           get lessonKeys() { return lessonKeys; }, set lessonKeys(v) { lessonKeys = !!v; } };
});
