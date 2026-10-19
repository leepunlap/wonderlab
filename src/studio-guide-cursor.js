/*!
 * Wonder Lab Studio — the guide's hand.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS IS
 * A pointer that travels, presses, ripples and clicks.
 *
 * WHY A PRETEND CURSOR
 * A ring on a button says "here". It does not say "press", and it certainly does not say "and this is
 * what pressing feels like". When the guide brings an actor in it is standing in for the child's hand:
 * the plus, the tile, the press. Without a hand the ring floats, the modal opens by itself, and the
 * demonstration quietly becomes an animation instead of an instruction. Three things together make it
 * read as a hand — travel to the target, a press that compresses the arrow, and a click you can hear.
 *
 * WHY THE SOUND IS SYNTHESISED AND NOT A FILE
 * A click is thirty milliseconds. A file would be a download, a decoder and a licence for something
 * the browser can make in four lines; and it would need a second copy of the "is sound on" rule. Two
 * nodes make it: a band-passed noise burst for the tick and a fast falling triangle for the body.
 * It is quiet on purpose — this plays eight times while a child is reading.
 *
 * WHAT IT DOES NOT DO
 * It never clicks anything. It moves, it presses, it sounds; the caller clicks, in the same tick, so
 * that the ripple and the real thing happen together. A cursor that clicks on its own would be a
 * second opinion on what the step wants.
 *
 * ES5, like the rest of the studio's own code: this ships to old browsers.
 */
(function (root) {
  'use strict';

  /* The arrow's tip sits a couple of pixels inside its own box, so the box is placed that much up and
     left of the point being aimed at. Without this the arrow points at where the target is *going*. */
  var TIP_X = 3;
  var TIP_Y = 2;

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function create(cfg) {
    cfg = cfg || {};

    var el = null;              // the arrow
    var rippleEl = null;        // reused, so eight presses leave eight milliseconds of garbage, not eight nodes
    var downTimer = null;
    var x = 0, y = 0;           // where the tip is
    var placed = false;
    var travel = 0, presses = 0, sounds = 0;
    var actx = null;            // the AudioContext, built on the first press
    var reduce = null;

    function doc() { return root.document; }

    /** Sound follows the narration's switch: a child who asked for quiet did not mean "except clicks". */
    function soundOn() { return cfg.sound ? !!cfg.sound() : true; }

    function reduced() {
      if (reduce === null) {
        reduce = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
      }
      return reduce;
    }

    /* ---------- the arrow ---------- */
    function build() {
      if (el) return el;
      el = doc().createElement('div');
      el.className = 'wl-cur';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML =
        '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">' +
          '<path d="M3 2 L3 19.6 L8 14.8 L11.3 21.8 L14.4 20.4 L11.1 13.5 L18 13.5 Z" ' +
                'fill="#ffffff" stroke="#1f2a37" stroke-width="1.5" stroke-linejoin="round"/>' +
        '</svg>';
      doc().body.appendChild(el);
      return el;
    }

    /** Put the box where the tip lands on (x, y). No animation: the transition does that. */
    function place(ms) {
      if (!el) return;
      el.style.transitionDuration = Math.max(0, ms || 0) + 'ms, 220ms';
      el.style.transform = 'translate3d(' + Math.round(x - TIP_X) + 'px,' + Math.round(y - TIP_Y) + 'px,0)';
    }

    /** Come in from the bottom-right, where the pane the student just pressed is. */
    function enter() {
      x = Math.round((root.innerWidth || 1280) - 56);
      y = Math.round((root.innerHeight || 800) - 72);
      place(0);
      placed = true;
    }

    function show() {
      build();
      if (!placed) enter();
      el.classList.add('is-on');
      return el;
    }

    function hide() {
      if (el) el.classList.remove('is-on');
    }

    /* ---------- moving and pressing ---------- */
    function moveTo(nx, ny, ms) {
      show();
      var d = reduced() ? 0 : (ms == null ? 560 : ms);
      x = nx; y = ny;
      place(d);
      travel++;
      return wait(d + 30);
    }

    /** Move so the tip sits on the middle of `node`. Resolves false if there is nothing to aim at. */
    function moveToEl(node, ms) {
      if (!node) return Promise.resolve(false);
      var r = node.getBoundingClientRect();
      if (!r.width || !r.height) return Promise.resolve(false);
      return moveTo(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), ms)
        .then(function () { return true; });
    }

    function ripple() {
      var d = doc();
      if (!rippleEl) {
        rippleEl = d.createElement('div');
        rippleEl.className = 'wl-ripple';
        rippleEl.setAttribute('aria-hidden', 'true');
        d.body.appendChild(rippleEl);
      }
      rippleEl.style.left = Math.round(x) + 'px';
      rippleEl.style.top = Math.round(y) + 'px';
      rippleEl.classList.remove('is-go');
      void rippleEl.offsetWidth;      // restart the animation the second time round
      rippleEl.classList.add('is-go');
    }

    /**
     * The press itself: the arrow compresses, a ring leaves the tip, and the click sounds. Synchronous
     * on purpose — the caller clicks the real button in the same tick, so the two are one event.
     */
    function press() {
      show();
      presses++;
      el.classList.add('is-down');
      if (downTimer) clearTimeout(downTimer);
      downTimer = setTimeout(function () {
        downTimer = null;
        if (el) el.classList.remove('is-down');
      }, 130);
      ripple();
      click();
      return true;
    }

    /* ---------- the sound ---------- */
    function audio() {
      if (actx !== null) return actx;
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) { actx = false; return actx; }
      try { actx = new AC(); } catch (e) { actx = false; }
      return actx;
    }

    /**
     * Two layers, because a real click is two: the tick of the switch and the knock of the case.
     * Both decay in well under a tenth of a second — this is punctuation, not a sound effect.
     *
     * Written against a context rather than against the global one so `probe` can render the very
     * same graph offline: a click nobody can hear is a bug no screenshot would ever show.
     */
    function shape(a, t) {
      var osc = a.createOscillator(), gain = a.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(210, t);
      osc.frequency.exponentialRampToValueAtTime(96, t + 0.05);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.15, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.062);
      osc.connect(gain);
      gain.connect(a.destination);
      osc.start(t);
      osc.stop(t + 0.08);

      var n = Math.max(1, Math.floor(a.sampleRate * 0.03));
      var buf = a.createBuffer(1, n, a.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < n; i++) {
        // a steep curve: the first millisecond is the click, everything after it is the room
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 7);
      }
      var src = a.createBufferSource();
      src.buffer = buf;
      var bp = a.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 1.6;
      var ng = a.createGain();
      ng.gain.value = 0.4;
      src.connect(bp);
      bp.connect(ng);
      ng.connect(a.destination);
      src.start(t);
    }

    function click() {
      if (!soundOn()) return false;
      var a = audio();
      if (!a) return false;
      if (a.state === 'suspended' && typeof a.resume === 'function') {
        try { a.resume(); } catch (e) { /* it will stay silent, and the step still runs */ }
      }
      try {
        shape(a, a.currentTime + 0.01);
      } catch (e) {
        return false;
      }
      sounds++;
      return true;
    }

    /**
     * The same click, rendered offline and measured. `peak` is what a speaker would be asked to move;
     * silence is 0, and a ramp scheduled wrongly would be. Resolves null where the browser has no
     * OfflineAudioContext — a fact about the browser, not about the click.
     */
    function probe() {
      var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
      if (!OAC) return Promise.resolve(null);
      var a;
      try { a = new OAC(1, Math.floor(0.5 * 44100), 44100); } catch (e) { return Promise.resolve(null); }
      try { shape(a, 0); } catch (e) { return Promise.resolve({ peak: 0, error: String(e && e.message) }); }
      return a.startRendering().then(function (buf) {
        var d = buf.getChannelData(0), peak = 0;
        for (var i = 0; i < d.length; i++) {
          var v = d[i] < 0 ? -d[i] : d[i];
          if (v > peak) peak = v;
        }
        return { peak: Math.round(peak * 1000) / 1000, ms: Math.round((buf.length / buf.sampleRate) * 1000) };
      }, function () { return null; });
    }

    return {
      show: show,
      hide: hide,
      moveTo: moveTo,
      moveToEl: moveToEl,
      press: press,
      /** render one click offline and measure it: the only way a silent click shows up */
      probe: probe,
      /** what the tests read: has it been seen, where is it, how often did it press */
      state: function () {
        return {
          visible: !!(el && el.classList.contains('is-on')),
          x: x, y: y,
          travels: travel,
          presses: presses,
          sounds: sounds
        };
      },
      /** nobody calls this yet; it is here so a page that unmounts can leave nothing behind */
      destroy: function () {
        if (downTimer) clearTimeout(downTimer);
        if (el && el.parentNode) el.parentNode.removeChild(el);
        if (rippleEl && rippleEl.parentNode) rippleEl.parentNode.removeChild(rippleEl);
        el = null;
        rippleEl = null;
        placed = false;
      }
    };
  }

  root.StudioGuideCursor = { create: create };
})(window);
