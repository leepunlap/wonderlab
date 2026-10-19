/*!
 * Wonder Lab Studio — the guide, as a module.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS IS
 * The second tab of the AI 學伴 pane: a short, navigable course in how the editor works. A topic is
 * a few steps; a step is one idea and, when the idea is something the editor can do, a 示範 button
 * that drives the real editor — the pointer goes to the palette, the blocks are dragged in, the
 * green flag is pressed — while the student watches it happen.
 *
 * WHAT IT OWNS
 * The navigation, and only the navigation: the index of topics, one step at a time, the rail, the
 * pager, and the state of each step (idle / running / done). It also owns the copy's *keys*: every
 * word is `guide.<topic>.<step>.title` or `.body`, resolved through StudioI18n at paint time, which
 * is what makes a language change mid-topic re-render instead of reload.
 *
 * WHAT IT DOES NOT OWN
 * The editor. `run(step)` is the caller's and this module waits for it: while it waits it shows a
 * progress line and nothing else. Nor does it own the demonstration's project, its blocks or its
 * cleanup — those are `studio-guide-drive.js`'s, which is why this file has no idea a VM exists.
 *
 *   var guide = StudioGuide.create({
 *     i18n: StudioI18n,
 *     topics: StudioGuideTopics,           // the structure; the words are in the locale files
 *     run: function (step, onProgress) { return drive.run(step, onProgress); },
 *     stop: function () { drive.stop(); },
 *     restore: function () { return drive.restore(); },
 *     isActive: function () { return drive.isActive(); }
 *   });
 *   chat.addView('guide', guide.el);
 *
 * ES5, like the rest of the studio's own code: this ships to old browsers.
 */
(function (root) {
  'use strict';

  var doc = root.document;

  function noop() {}

  function h(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /** The topic icon, drawn the way the rest of the studio draws icons (class "ic" carries the size). */
  function ic(paths) {
    var s = doc.createElement('span');
    s.innerHTML = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
    return s.firstChild;
  }

  var ICON_CHEV = '<path d="m9 18 6-6-6-6"/>';
  var ICON_BACK = '<path d="M15 18l-6-6 6-6"/>';

  function create(cfg) {
    cfg = cfg || {};

    var i18n = cfg.i18n || (root.StudioI18n && typeof root.StudioI18n.t === 'function' ? root.StudioI18n : null);
    function T(key, params) { return i18n ? i18n.t(key, params) : key; }

    var topics = (cfg.topics || []).filter(function (t) { return t && t.id; });
    var run = cfg.run || function () { return Promise.resolve(); };
    var stopFn = cfg.stop || noop;
    var restoreFn = cfg.restore || function () { return Promise.resolve(); };
    var canRun = cfg.canRun || function () { return true; };
    var isActive = cfg.isActive || function () { return false; };

    /* Where the student is. Kept out of the DOM so a language change, a resize or returning from a
       demonstration re-paints the same place rather than the beginning. */
    var view = { kind: 'index', topic: 0, step: 0 };
    var marks = {};          // "topicId/stepId" -> 'running' | 'done' | 'failed'
    var progress = null;     // { done, total } while a demonstration is running

    var el = h('div', 'wl-guide');
    var bodyBox = h('div', 'wl-g-body');
    bodyBox.setAttribute('role', 'region');
    el.appendChild(bodyBox);

    var foot = h('div', 'wl-g-foot');
    foot.hidden = true;
    el.appendChild(foot);

    var statusEl = null;     // the live line under the 示範 button, if one is painted

    /* ---------- keys ----------
       Derived, never stored: a step carries an id, and its words are found by that id. A missing key
       shows as the key itself, which is how a half-written topic announces itself instead of showing
       an empty card. */
    function keyTopic(t, name) { return 'guide.' + t.id + '.' + name; }
    function keyStep(t, s, name) { return 'guide.' + t.id + '.' + s.id + '.' + name; }
    function stepKey(t, s) { return t.id + '/' + s.id; }

    function stepCount(t) { return (t.steps || []).length; }
    function currentTopic() { return topics[view.topic] || null; }
    function currentStep() {
      var t = currentTopic();
      return t ? (t.steps || [])[view.step] || null : null;
    }

    /* ---------- painting ---------- */
    function iconBtn(paths, label, onClick) {
      var b = h('button', 'wl-g-back');
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.appendChild(ic(paths));
      b.addEventListener('click', onClick);
      return b;
    }

    function renderIndex() {
      var box = h('div', 'wl-g-index');
      box.appendChild(h('p', 'wl-g-intro', T('guide.intro')));

      var list = h('div', 'wl-g-list');
      topics.forEach(function (t, i) {
        var b = h('button', 'wl-g-topic');
        b.type = 'button';
        var badge = h('span', 'wl-g-ico');
        badge.appendChild(ic(t.icon || ICON_CHEV));
        b.appendChild(badge);

        var main = h('span', 'wl-g-tmain');
        main.appendChild(h('span', 'wl-g-ttitle', T(keyTopic(t, 'title'))));
        main.appendChild(h('span', 'wl-g-tsub', T('guide.stepCount', { n: stepCount(t) })));
        b.appendChild(main);

        var chev = h('span', 'wl-g-chev');
        chev.appendChild(ic(ICON_CHEV));
        b.appendChild(chev);

        b.addEventListener('click', function () { go(i, 0); });
        list.appendChild(b);
      });
      box.appendChild(list);
      return box;
    }

    function renderTopic() {
      var t = currentTopic(), steps = (t && t.steps) || [], s = steps[view.step] || null;
      var box = h('div', 'wl-g-topic-page');

      var bar = h('div', 'wl-g-bar');
      bar.appendChild(iconBtn(ICON_BACK, T('guide.back'), function () { goIndex(); }));
      var head = h('div', 'wl-g-bar-main');
      head.appendChild(h('h2', 'wl-g-h', T(keyTopic(t, 'title'))));
      bar.appendChild(head);
      box.appendChild(bar);

      box.appendChild(h('p', 'wl-g-intro', T(keyTopic(t, 'intro'))));

      /* the rail: where you are in the topic, and a way to jump. A dot, not a number-in-a-circle:
         three to five steps do not need to be numbered twice. */
      var rail = h('div', 'wl-g-rail');
      rail.setAttribute('role', 'group');
      rail.setAttribute('aria-label', T('guide.steps'));
      steps.forEach(function (st, i) {
        var d = h('button', 'wl-g-dot' + (i === view.step ? ' is-on' : '') + (marks[stepKey(t, st)] === 'done' ? ' is-done' : ''));
        d.type = 'button';
        d.setAttribute('aria-label', T('guide.stepN', { n: i + 1 }));
        d.setAttribute('aria-current', i === view.step ? 'step' : 'false');
        d.addEventListener('click', function () {
          if (i === view.step) return;
          stopFn();
          go(view.topic, i);
        });
        rail.appendChild(d);
      });
      box.appendChild(rail);

      if (!s) return box;

      var card = h('article', 'wl-g-card');
      card.appendChild(h('div', 'wl-g-kick', T('guide.stepOf', { n: view.step + 1, total: steps.length })));
      card.appendChild(h('h3', 'wl-g-ctitle', T(keyStep(t, s, 'title'))));
      card.appendChild(h('p', 'wl-g-cbody', T(keyStep(t, s, 'body'))));
      box.appendChild(card);

      /* The demonstration is a button on the step, not an automatic run: a page that starts moving
         on its own takes the choice away, and a student who has just scrolled into a step may not be
         looking at the editor at all. */
      var acts = h('div', 'wl-g-acts');
      if (s.demo) {
        var mark = marks[stepKey(t, s)];
        var b = h('button', 'wl-g-demo');
        b.type = 'button';
        b.textContent = T(mark === 'done' ? 'guide.replay' : mark === 'running' ? 'guide.running' : 'guide.demo');
        b.disabled = mark === 'running';
        b.addEventListener('click', function () { play(t, s); });
        acts.appendChild(b);

        if (mark === 'failed') acts.appendChild(h('span', 'wl-g-note is-bad', T('guide.failed')));
        else if (mark === 'running') {
          statusEl = h('span', 'wl-g-note', progress ? T('guide.progress', progress) : T('guide.starting'));
          statusEl.setAttribute('aria-live', 'polite');
          acts.appendChild(statusEl);
        } else if (!canRun()) {
          acts.appendChild(h('span', 'wl-g-note', T('guide.notReady')));
        }
      } else {
        acts.appendChild(h('span', 'wl-g-note', T('guide.practice')));
      }
      box.appendChild(acts);

      /* pager */
      var pager = h('div', 'wl-g-pager');
      var prev = h('button', 'wl-btn wl-small', T('guide.prev'));
      prev.type = 'button';
      prev.disabled = view.step === 0;
      prev.addEventListener('click', function () { stopFn(); go(view.topic, Math.max(0, view.step - 1)); });
      pager.appendChild(prev);

      var last = view.step >= steps.length - 1, more = view.topic < topics.length - 1;
      var next = h('button', 'wl-btn wl-small wl-g-next', T(last ? (more ? 'guide.nextTopic' : 'guide.back') : 'guide.next'));
      next.type = 'button';
      next.addEventListener('click', function () {
        stopFn();
        if (!last) go(view.topic, view.step + 1);
        else if (more) go(view.topic + 1, 0);
        else goIndex();
      });
      pager.appendChild(next);
      box.appendChild(pager);

      return box;
    }

    function renderFoot() {
      var on = !!isActive();
      foot.hidden = !on;
      if (!on) { foot.innerHTML = ''; return; }
      foot.innerHTML = '';
      foot.appendChild(h('span', 'wl-g-foot-label', T('guide.demoHolding')));
      var s = h('button', 'wl-btn wl-small', T('guide.stop'));
      s.type = 'button';
      s.addEventListener('click', function () { stopFn(); paint(); });
      foot.appendChild(s);
      var r = h('button', 'wl-btn wl-small wl-g-restore', T('guide.restore'));
      r.type = 'button';
      r.addEventListener('click', function () { restoreFn().then(paint, paint); });
      foot.appendChild(r);
    }

    function paint() {
      statusEl = null;
      while (bodyBox.firstChild) bodyBox.removeChild(bodyBox.firstChild);
      bodyBox.appendChild(view.kind === 'index' || !currentTopic() ? renderIndex() : renderTopic());
      renderFoot();
    }

    /* Nav is a re-paint plus a scroll reset: the body is the scroll container, so a step change that
       kept its offset would open the next step halfway down. */
    function go(topicIndex, stepIndex) {
      view = { kind: 'topic', topic: topicIndex, step: stepIndex };
      paint();
      bodyBox.scrollTop = 0;
    }
    function goIndex() {
      view = { kind: 'index', topic: view.topic, step: 0 };
      paint();
      bodyBox.scrollTop = 0;
    }

    /* ---------- the demonstration ---------- */
    function paintStatus() {
      if (!statusEl) return;
      statusEl.textContent = progress ? T('guide.progress', progress) : T('guide.starting');
    }

    function play(t, s) {
      var k = stepKey(t, s);
      if (marks[k] === 'running') return;
      if (!canRun()) { paint(); return; }
      marks[k] = 'running';
      progress = null;
      paint();

      var settle = function (mark) {
        marks[k] = mark;
        progress = null;
        paint();
      };
      var p;
      try {
        p = run(s, function (done, total) { progress = { done: done, total: total }; paintStatus(); }, t);
      } catch (e) {
        settle('failed');
        return;
      }
      Promise.resolve(p).then(function (ok) {
        settle(ok === false ? 'failed' : 'done');
      }, function (e) {
        if (root.console) root.console.warn('[guide] demonstration failed:', e && e.message);
        settle('failed');
      });
    }

    /* ---------- the outside world ---------- */
    /** The pane asks this when the language changes: re-paint, do not restart. */
    function refresh() { paint(); }

    if (i18n && typeof i18n.on === 'function') i18n.on(refresh);

    paint();

    return {
      el: el,
      refresh: refresh,
      /** open a topic by id, for a caller that wants to point at one (`guide.open('keys')`). */
      open: function (id, step) {
        var i = -1;
        topics.forEach(function (t, n) { if (t.id === id) i = n; });
        if (i < 0) return false;
        go(i, Math.max(0, step || 0));
        return true;
      },
      /** the demonstration finished, was stopped, or the canvas was given back */
      sync: function () { renderFoot(); },
      topics: function () { return topics; }
    };
  }

  root.StudioGuide = { create: create };
}(typeof window !== 'undefined' ? window : this));
