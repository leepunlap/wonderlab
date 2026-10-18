/*!
 * Wonder Lab Studio — AI model picker, as a module.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS IS
 * Which model answers, and what it has cost so far. It used to be a 232px card bolted to the top of
 * the AI 學伴 pane — half the pane, for a choice a student changes once a term. It is now a 30px
 * pill that sits in the composer's accessory slot; the descriptions and the quota live one tap away
 * in a popover, so they are there for the teacher who wants them and invisible to everybody else.
 *
 * WHAT IT OWNS
 * - The model configuration fetch from /api/ai/status/<ep>, and the current selection.
 * - The pill and its popover: names, one-line descriptions, remaining quota, the R1
 *   顯示推理過程 switch (which is a property of the MODEL, so it belongs in the model's menu).
 * - Session token and cost accounting, persisted to localStorage, including the reset.
 *
 * WHAT IT DOES NOT OWN
 * The API call itself (studio-assist.js owns that) and anything about where it is on screen. The
 * module hands back a single element, `el`; StudioChat drops it into the composer slot, and a lesson
 * page can drop the same element into its own bar without either knowing about the other.
 *
 *   var models = StudioModels.create({
 *     api: '/api/ai/lab/studio',
 *     ui: { onChange: function (id) {}, onError: function (msg) {} }
 *   });
 *   chat.setAccessory(models.el);
 *   models.load().then(function () { ... });
 *   body = models.augmentRequest(body);      // adds { model, show_thinking }
 *   models.updateFromResponse(response);     // quota + tokens from the turn that just ran
 *
 * ES5, like the rest of the studio's own code: this ships to old browsers.
 */
(function (root) {
  'use strict';

  var doc = root.document;
  var SESSION_KEY = 'wl-studio-session';

  function noop() {}

  function h(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function ic(paths, extra) {
    var s = doc.createElement('span');
    s.innerHTML = '<svg class="ic' + (extra ? ' ' + extra : '') + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      paths + '</svg>';
    return s.firstChild;
  }

  var ICON_CHECK = '<path d="M20 6 9 17l-5-5"/>';
  var ICON_CHEV = '<path d="m6 9 6 6 6-6"/>';

  function fmt(n) {
    n = n || 0;
    return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
  }

  function create(cfg) {
    cfg = cfg || {};
    var api = cfg.api || '/api/ai/lab/studio';
    var statusApi = api.replace(/\/lab\/[^/]+$/, '/status/studio');
    var ui = cfg.ui || {};
    var onChange = ui.onChange || noop;
    var onError = ui.onError || noop;

    var models = [];
    var selected = null;
    var showThinking = false;
    var role = 'student';
    var sessionTokens = { input: 0, output: 0, reasoning: 0, total: 0 };
    var sessionCost = 0;
    var turnTokens = null;

    /* ---------- the widget: a pill, and a popover that only exists while it is wanted ---------- */
    var wrap = h('div', 'wl-mpill-wrap');

    var pill = h('button', 'wl-mpill');
    pill.type = 'button';
    pill.setAttribute('aria-haspopup', 'listbox');
    pill.setAttribute('aria-expanded', 'false');
    var dot = h('span', 'wl-mpill-dot');
    var name = h('span', 'wl-mpill-name', '模型');
    pill.appendChild(dot);
    pill.appendChild(name);
    pill.appendChild(ic(ICON_CHEV, 'wl-mpill-chev'));

    var pop = h('div', 'wl-mpop');
    pop.setAttribute('role', 'listbox');
    pop.hidden = true;

    wrap.appendChild(pill);
    wrap.appendChild(pop);

    function open() {
      renderPop();
      pop.hidden = false;
      pill.setAttribute('aria-expanded', 'true');
      pill.classList.add('is-open');
    }
    function close() {
      pop.hidden = true;
      pill.setAttribute('aria-expanded', 'false');
      pill.classList.remove('is-open');
    }
    pill.addEventListener('click', function (e) {
      e.stopPropagation();
      if (pop.hidden) open(); else close();
    });
    doc.addEventListener('click', function (e) {
      if (!pop.hidden && !wrap.contains(e.target)) close();
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !pop.hidden) { close(); pill.focus(); }
    });

    /* ---------- persistence ---------- */
    function loadSession() {
      try {
        var raw = root.localStorage && root.localStorage.getItem(SESSION_KEY);
        if (!raw) return;
        var d = JSON.parse(raw);
        sessionTokens = d.tokens || sessionTokens;
        sessionCost = d.cost || 0;
        selected = d.selectedModel || selected;
        showThinking = !!d.showThinking;
      } catch (e) {
        if (root.console) root.console.warn('[models] session load failed:', e);
      }
    }

    function saveSession() {
      try {
        if (!root.localStorage) return;
        root.localStorage.setItem(SESSION_KEY, JSON.stringify({
          tokens: sessionTokens, cost: sessionCost,
          selectedModel: selected, showThinking: showThinking, t: Date.now()
        }));
      } catch (e) { /* a private-mode failure is not worth a dialog */ }
    }

    function clearSession() {
      sessionTokens = { input: 0, output: 0, reasoning: 0, total: 0 };
      sessionCost = 0;
      turnTokens = null;
      try { if (root.localStorage) root.localStorage.removeItem(SESSION_KEY); } catch (e) {}
      render();
    }

    /* ---------- model facts, in the words the UI uses ---------- */
    function quotaText(m) {
      if (!m) return '';
      if (m.limits === null) return '∞';
      var l = m.limits && m.limits.per_lesson_hour;
      return l ? ('剩 ' + l.left + ' / ' + l.max) : '';
    }

    function quotaClass(m) {
      var l = m && m.limits && m.limits.per_lesson_hour;
      if (!l || !l.max) return '';
      var pct = l.left / l.max;
      return pct > 0.5 ? 'is-ok' : (pct > 0.2 ? 'is-warn' : 'is-low');
    }

    function dayText() {
      var m = byId(selected);
      var d = m && m.limits && m.limits.per_student_day;
      return d ? ('今日剩 ' + d.left + ' / ' + d.max) : '';
    }

    function byId(id) {
      for (var i = 0; i < models.length; i++) if (models[i].id === id) return models[i];
      return null;
    }

    /* ---------- render ---------- */
    function render() {
      var m = byId(selected);
      name.textContent = m ? m.display_name : (models.length ? models[0].display_name : '模型');
      dot.className = 'wl-mpill-dot' + (m && m.supports_thinking ? ' is-reasoning' : '');
      pill.title = m ? (m.display_name + (m.description ? ' — ' + m.description : '')) : '';
      if (!pop.hidden) renderPop();
    }

    function renderPop() {
      while (pop.firstChild) pop.removeChild(pop.firstChild);

      models.forEach(function (m) {
        var on = m.id === selected;
        var item = h('div', 'wl-mitem' + (on ? ' is-on' : '') + (m.enabled === false ? ' is-off' : ''));
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(on));

        if (on) item.appendChild(ic(ICON_CHECK, 'wl-mitem-check'));
        else item.appendChild(h('span', 'wl-mitem-check'));

        var main = h('span', 'wl-mitem-main');
        main.appendChild(h('span', 'wl-mitem-name', m.display_name));
        if (m.description) main.appendChild(h('span', 'wl-mitem-desc', m.description));
        item.appendChild(main);

        var q = quotaText(m);
        if (q) item.appendChild(h('span', 'wl-mitem-quota ' + quotaClass(m), q));

        if (m.enabled !== false) {
          item.addEventListener('click', function () { pick(m.id); });
        }
        pop.appendChild(item);
      });

      // 顯示推理過程 is a property of the chosen model, so it lives with the choice
      var m = byId(selected);
      if (m && m.supports_thinking) {
        pop.appendChild(h('div', 'wl-mpop-sep'));
        var sw = h('label', 'wl-mswitch');
        var cb = h('input');
        cb.type = 'checkbox';
        cb.checked = showThinking;
        cb.addEventListener('change', function () {
          showThinking = cb.checked;
          saveSession();
        });
        sw.appendChild(cb);
        sw.appendChild(h('span', 'wl-mswitch-track'));
        sw.appendChild(h('span', 'wl-mswitch-label', '顯示推理過程'));
        pop.appendChild(sw);
      }

      var day = dayText();
      var used = sessionTokens.total > 0;
      if (day || used) {
        pop.appendChild(h('div', 'wl-mpop-sep'));
        var foot = h('div', 'wl-mpop-foot');
        if (day) foot.appendChild(h('span', 'wl-mpop-day', day));
        if (used) {
          var tok = h('span', 'wl-mpop-tok', '本次 ' + fmt(sessionTokens.total) + ' tokens');
          foot.appendChild(tok);
          if (role === 'teacher' && sessionCost > 0) {
            foot.appendChild(h('span', 'wl-mpop-cost', 'HK$' + sessionCost.toFixed(3)));
          }
          var reset = h('button', 'wl-mpop-reset', '✕');
          reset.type = 'button';
          reset.title = '重設統計';
          reset.setAttribute('aria-label', '重設統計');
          reset.addEventListener('click', function () {
            if (root.confirm('重設本次對話統計？這會清除 token 用量和費用記錄。')) clearSession();
          });
          foot.appendChild(reset);
        }
        pop.appendChild(foot);
      }
    }

    function pick(id) {
      if (id === selected) return close();
      selected = id;
      showThinking = false;   // a fresh model starts from its own defaults
      saveSession();
      render();
      close();
      onChange(id);
    }

    /* ---------- the network ---------- */
    function load() {
      loadSession();
      return fetch(statusApi, { method: 'GET', credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || !data.ok) {
            onError((data && data.error) || '無法載入模型配置');
            return null;
          }
          models = data.models || [];
          role = data.role || 'student';
          // A remembered choice wins, but only while the server still offers it.
          if (!byId(selected)) {
            var def = null;
            models.forEach(function (m) { if (m.default) def = def || m; });
            selected = def ? def.id : (models[0] ? models[0].id : null);
          }
          render();
          return data;
        })
        .catch(function (e) {
          onError('連線有問題');
          if (root.console) root.console.error('[models] load failed:', e);
          return null;
        });
    }

    /** The two fields the service reads off every turn. */
    function augmentRequest(req) {
      req = req || {};
      req.model = selected;
      if (showThinking) req.show_thinking = true;
      return req;
    }

    function updateFromResponse(resp) {
      if (!resp) return;
      var m = byId(resp.model_used);
      if (m && resp.limits_after) m.limits = resp.limits_after;
      if (resp.tokens) {
        turnTokens = resp.tokens;
        sessionTokens.input += resp.tokens.input || 0;
        sessionTokens.output += resp.tokens.output || 0;
        sessionTokens.reasoning += resp.tokens.reasoning || 0;
        sessionTokens.total += resp.tokens.total || 0;
        if (m && m.cost_per_1k_tokens) {
          sessionCost += (resp.tokens.total / 1000) * m.cost_per_1k_tokens;
        }
      }
      saveSession();
      render();
    }

    return {
      el: wrap,
      load: load,
      render: render,
      augmentRequest: augmentRequest,
      updateFromResponse: updateFromResponse,
      clearSession: clearSession,
      getSelectedModel: function () { return selected; },
      getShowThinking: function () { return showThinking; },
      getModels: function () { return models.slice(); },
      getRole: function () { return role; },
      getSessionTokens: function () { return sessionTokens; },
      /** R1 ships its reasoning wrapped in <think>; nobody downstream should see the tags. */
      cleanThinking: function (t) { return String(t || '').replace(/<\/?think>/g, '').trim(); }
    };
  }

  root.StudioModels = { create: create };
}(typeof window !== 'undefined' ? window : this));
