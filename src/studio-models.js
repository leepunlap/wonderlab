/*!
 * Wonder Lab Studio — AI model selector.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS IS
 * The model selector and usage tracking UI. Fetches available models from the API, displays them
 * with usage limits, and lets students/teachers switch between models (DeepSeek Chat vs R1).
 *
 * WHAT IT OWNS
 * - Model configuration fetch from /api/ai/status/<ep>
 * - Current model selection state
 * - Usage indicators (remaining requests per model)
 * - Thinking toggle for R1 model
 *
 * WHAT IT DOES NOT OWN
 * The actual API call to the AI service (studio-assist.js owns that). This just augments the
 * request body with { model, show_thinking } and updates usage counts from responses.
 *
 *   var modelSelector = StudioModels.create({
 *     api: '/api/ai/lab/studio',
 *     ui: {
 *       mount: function (html) {},           // inject the model selector HTML
 *       onModelChange: function (modelId) {}, // notify when model changes
 *       onError: function (msg) {}           // show error messages
 *     }
 *   });
 *   modelSelector.load().then(function () {
 *     var req = modelSelector.augmentRequest(baseRequest);
 *     // ... send to API ...
 *     modelSelector.updateFromResponse(response);
 *   });
 *
 * ES5, like the rest of the studio's own code: this ships to old browsers.
 */
(function (root) {
  'use strict';

  function noop() {}

  function create(cfg) {
    cfg = cfg || {};
    var api = cfg.api || '/api/ai/lab/studio';
    var statusApi = api.replace(/\/lab\/[^/]+$/, '/status/studio');
    var ui = cfg.ui || {};
    var onMount = ui.mount || noop;
    var onModelChange = ui.onModelChange || noop;
    var onError = ui.onError || noop;

    var models = [];
    var selectedModel = null;
    var showThinking = false;
    var role = 'student';
    var container = null;
    var totalTokens = 0;
    var totalCost = 0;
    var statusLine = null;

    // Session tracking
    var sessionTokens = { input: 0, output: 0, reasoning: 0, total: 0 };
    var sessionCost = 0;
    var turnTokens = null; // Last turn's token usage
    var sessionKey = 'wl-studio-session'; // localStorage key

    /** Load persisted session data */
    function loadSession() {
      try {
        var stored = localStorage.getItem(sessionKey);
        if (stored) {
          var data = JSON.parse(stored);
          sessionTokens = data.tokens || sessionTokens;
          sessionCost = data.cost || 0;
          selectedModel = data.selectedModel || selectedModel;
          showThinking = data.showThinking || false;
        }
      } catch (e) {
        if (root.console) console.warn('[models] Failed to load session:', e);
      }
    }

    /** Persist session data */
    function saveSession() {
      try {
        localStorage.setItem(sessionKey, JSON.stringify({
          tokens: sessionTokens,
          cost: sessionCost,
          selectedModel: selectedModel,
          showThinking: showThinking,
          timestamp: Date.now()
        }));
      } catch (e) {
        if (root.console) console.warn('[models] Failed to save session:', e);
      }
    }

    /** Clear session data */
    function clearSession() {
      sessionTokens = { input: 0, output: 0, reasoning: 0, total: 0 };
      sessionCost = 0;
      turnTokens = null;
      try {
        localStorage.removeItem(sessionKey);
      } catch (e) {}
      render();
    }

    /** Fetch available models from the API */
    function load() {
      // Load persisted session first
      loadSession();

      return fetch(statusApi, {
        method: 'GET',
        credentials: 'same-origin'
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.ok) {
            onError(data.error || '無法載入模型配置');
            return;
          }
          models = data.models || [];
          role = data.role || 'student';

          // Select default model
          var def = models.filter(function (m) { return m.default; })[0];
          selectedModel = def ? def.id : (models[0] ? models[0].id : null);

          render();
          return data;
        })
        .catch(function (e) {
          onError('連線有問題');
          if (root.console) console.error('[models] Failed to load:', e);
        });
    }

    /** Generate HTML for model selector */
    function render() {
      if (!models.length) return;

      var html = '<div class="wl-models">';
      html += '<div class="wl-models-head">選擇 AI 模型';
      if (role === 'teacher') html += ' <span class="wl-models-badge">教師模式</span>';
      html += '</div>';

      models.forEach(function (m) {
        var checked = m.id === selectedModel ? ' checked' : '';
        var disabled = !m.enabled ? ' disabled' : '';
        html += '<label class="wl-model-item' + disabled + '">';
        html += '<input type="radio" name="wl-model" value="' + m.id + '"' + checked + disabled + '>';
        html += '<div class="wl-model-info">';
        html += '<div class="wl-model-name">' + escapeHtml(m.display_name) + '</div>';
        html += '<div class="wl-model-desc">' + escapeHtml(m.description) + '</div>';
        html += '</div>';

        // Usage indicator
        if (m.limits === null) {
          html += '<div class="wl-model-usage">∞</div>';
        } else if (m.limits && m.limits.per_lesson_hour) {
          var left = m.limits.per_lesson_hour.left;
          var max = m.limits.per_lesson_hour.max;
          var pct = max > 0 ? Math.round((left / max) * 100) : 0;
          var cls = pct > 50 ? 'ok' : (pct > 20 ? 'warn' : 'low');
          html += '<div class="wl-model-usage wl-usage-' + cls + '">';
          html += left + '/' + max;
          html += '</div>';
        }
        html += '</label>';

        // Thinking toggle for R1
        if (m.supports_thinking && m.id === selectedModel) {
          html += '<div class="wl-thinking-toggle">';
          html += '<label>';
          html += '<input type="checkbox" id="wl-show-thinking" ' + (showThinking ? 'checked' : '') + '>';
          html += ' 顯示推理過程';
          html += '</label>';
          html += '</div>';
        }
      });

      // Overall usage stats for students
      if (role === 'student' && models.length && models[0].limits) {
        var m0 = models[0];
        html += '<div class="wl-models-stats">';
        if (m0.limits.per_lesson_day) {
          html += '<span>本課今日: ' + m0.limits.per_lesson_day.left + '/' + m0.limits.per_lesson_day.max + '</span>';
        }
        if (m0.limits.per_student_day) {
          html += '<span>今日總共: ' + m0.limits.per_student_day.left + '/' + m0.limits.per_student_day.max + '</span>';
        }
        html += '</div>';
      }

      // Token and cost tracking (always visible for transparency)
      if (sessionTokens.total > 0) {
        html += '<div class="wl-token-stats">';

        // Last turn info
        if (turnTokens) {
          html += '<div class="wl-token-turn">';
          html += '<span class="wl-token-label">上一次：</span>';
          html += '<span>' + formatNumber(turnTokens.total) + ' tokens</span>';
          if (turnTokens.reasoning > 0) {
            html += '<span class="wl-token-detail">（推理 ' + formatNumber(turnTokens.reasoning) + '）</span>';
          }
          html += '</div>';
        }

        // Session totals
        html += '<div class="wl-token-session">';
        html += '<span class="wl-token-label">本次總計：</span>';
        html += '<span>' + formatNumber(sessionTokens.total) + ' tokens</span>';

        if (role === 'teacher' && sessionCost > 0) {
          html += '<span class="wl-token-cost">HK$' + sessionCost.toFixed(3) + '</span>';
        }
        html += '<button type="button" class="wl-reset-session" title="重設統計">✕</button>';
        html += '</div>';

        html += '</div>';
      }

      html += '</div>';

      onMount(html);
      attachListeners();
    }

    function formatNumber(num) {
      if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
      }
      return String(num);
    }

    /** Attach event listeners after rendering */
    function attachListeners() {
      var radios = document.querySelectorAll('input[name="wl-model"]');
      for (var i = 0; i < radios.length; i++) {
        radios[i].addEventListener('change', function (e) {
          selectedModel = e.target.value;
          showThinking = false; // Reset when switching models
          saveSession(); // Persist model selection
          render();
          onModelChange(selectedModel);
        });
      }

      var thinkingCheckbox = document.getElementById('wl-show-thinking');
      if (thinkingCheckbox) {
        thinkingCheckbox.addEventListener('change', function (e) {
          showThinking = e.target.checked;
          saveSession(); // Persist thinking toggle
        });
      }

      // Reset session button
      var resetBtn = document.querySelector('.wl-reset-session');
      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          if (confirm('重設本次對話統計？這會清除 token 用量和費用記錄。')) {
            clearSession();
          }
        });
      }
    }

    /** Augment API request with model selection */
    function augmentRequest(req) {
      req = req || {};
      req.model = selectedModel;
      if (showThinking) {
        req.show_thinking = true;
      }
      return req;
    }

    /** Update usage counts from API response */
    function updateFromResponse(resp) {
      if (!resp) return;

      // Update usage limits
      if (resp.limits_after) {
        models.forEach(function (m) {
          if (m.id === resp.model_used && resp.limits_after) {
            m.limits = resp.limits_after;
          }
        });
      }

      // Update token tracking
      if (resp.tokens) {
        turnTokens = resp.tokens;
        sessionTokens.input += resp.tokens.input || 0;
        sessionTokens.output += resp.tokens.output || 0;
        sessionTokens.reasoning += resp.tokens.reasoning || 0;
        sessionTokens.total += resp.tokens.total || 0;

        // Calculate cost
        var model = models.filter(function (m) { return m.id === resp.model_used; })[0];
        if (model && model.cost_per_1k_tokens) {
          var turnCost = (resp.tokens.total / 1000) * model.cost_per_1k_tokens;
          sessionCost += turnCost;
        }
      }

      saveSession(); // Persist after each turn
      render();
    }

    /** Display thinking content if present */
    function showThinkingContent(thinking) {
      if (!thinking) return;

      // Extract thinking text (strip XML tags)
      var text = thinking.replace(/<\/?think>/g, '').trim();
      if (!text) return;

      var html = '<div class="wl-thinking">';
      html += '<div class="wl-thinking-head">';
      html += '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
      html += '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>';
      html += '<path d="M12 17h.01"/></svg>';
      html += '推理過程';
      html += '</div>';
      html += '<div class="wl-thinking-body">' + escapeHtml(text) + '</div>';
      html += '</div>';

      return html;
    }

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.textContent = str || '';
      return div.innerHTML;
    }

    function getSelectedModel() {
      return selectedModel;
    }

    function getShowThinking() {
      return showThinking;
    }

    function getModels() {
      return models.slice(); // Return copy
    }

    function getRole() {
      return role;
    }

    return {
      load: load,
      render: render,
      augmentRequest: augmentRequest,
      updateFromResponse: updateFromResponse,
      showThinkingContent: showThinkingContent,
      clearSession: clearSession,
      getSelectedModel: getSelectedModel,
      getShowThinking: getShowThinking,
      getModels: getModels,
      getRole: getRole
    };
  }

  root.StudioModels = { create: create };
}(typeof window !== 'undefined' ? window : this));
