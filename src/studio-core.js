/*!
 * Wonder Lab Studio — the editor core.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS IS
 * The one place in the studio that knows how the upstream editor (scratch-gui / scratch-blocks) is
 * shaped. Branding, the Chinese relabelling of library buttons, the hidden entry points, the walk
 * that finds the Blockly instance, positioning a new stack, caching assets, and the project-load
 * watcher. Everything here is upstream-shaped knowledge, and it exists in ONE module because it used
 * to exist in two pages at once, patching independently.
 *
 * WHY THAT MATTERED, CONCRETELY
 * studio.js and studio-lab.js each had their own patchDom. The lesson page grew a guard — do not
 * relabel the library buttons when the page wants the real library — because without it the button
 * labelled 繪畫 was the library button and the real paint entry was hidden, which is why 繪畫 and
 * 上傳 appeared to do nothing. The prototype never got that guard. Two copies, one fix, and the
 * unfixed copy was the one a teacher could reach. There is now one copy and it has the guard.
 *
 * THE RULE
 * Prefer adding over replacing. An extension (ucmake-blocks.js) or a VM event patches nothing;
 * these DOM rules exist only for things upstream gives no seam for. Where a rule must change
 * upstream behaviour, it is expressed as an option the caller sets, never as a bare overwrite -
 * so the caller can say what it wants and the reason lives at the call site.
 *
 * ES5, like the rest of the studio's own code.
 */
(function (root) {
  'use strict';

  var LOCALE = 'zh-tw';
  var STAGE = '舞台';

  /** Words upstream still says in English. */
  var REPL = [
    [/Scratch 3\.0/g, '本編輯器'],
    [/Scratch Link/g, '裝置連接程式'],
    [/Scratch 團隊/g, '開發團隊'],
    [/Scratch/g, '本編輯器']
  ];

  /** Strings the bundled locale does not carry. */
  var ZH_MISSING = {};

  /** Library buttons, relabelled to what this product does with them. */
  var LIB_LABELS = { '選個角色': '繪畫', '選個背景': '繪畫', '選個造型': '繪畫', '選個音效': '錄音' };
  /** Entries the lesson lab does not offer. */
  var HIDE_LABELS = { '驚喜': 1, '選個角色': 1, '選個背景': 1, '選個造型': 1, '選個音效': 1, '添加擴展': 1, '教程': 1 };

  /** The Blockly instance riding on the injection div. React keeps it on a fiber, not a global. */
  function blocksInstance() {
    var el = document.querySelector('.injectionDiv');
    for (var node = el; node; node = node.parentElement) {
      var key = Object.keys(node).filter(function (k) {
        return k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0;
      });
      if (!key.length) continue;
      for (var f = node[key[0]]; f; f = f['return']) {
        var s = f.stateNode;
        if (s && s.workspace && s.ScratchBlocks) return s;
      }
    }
    return null;
  }

  function workspace() {
    var b = blocksInstance();
    return b && b.workspace;
  }

  /** How many blocks are in one stack. Bounded: a corrupt `next` chain must not spin forever. */
  function countStack(B, id) {
    var n = 0;
    for (var g = 0; id && B[id] && g < 500; g++) { n++; id = B[id].next; }
    return n;
  }

  /**
   * Where to put the nth new stack: free space in view if the target is the one being edited,
   * otherwise below everything already on it.
   */
  function place(vm, target, n) {
    var ws = workspace();
    if (ws && vm.editingTarget === target && ws.getMetricsManager) {
      var v = ws.getMetricsManager().getViewMetrics(true);
      var w = 320;
      var rects = ws.getTopBlocks(false).map(function (b) { return b.getBoundingRectangle(); });
      function free(x, y) {
        return rects.every(function (r) {
          return x + w < r.left - 20 || x > r.right + 20 || y + 60 < r.top - 20 || y > r.bottom + 20;
        });
      }
      for (var x = v.left + 40; x < v.left + Math.max(v.width - 100, 60); x += 120) {
        for (var y = v.top + 40; y < v.top + Math.max(v.height - 80, 60); y += 40) {
          if (free(x, y)) return { x: x, y: y };
        }
      }
      var maxB = rects.reduce(function (m, r) { return Math.max(m, r.bottom); }, v.top);
      return { x: v.left + 40, y: maxB + 60 };
    }
    var B = target.blocks._blocks, bottom = 0;
    target.blocks.getScripts().forEach(function (id) {
      var b = B[id];
      if (b) bottom = Math.max(bottom, (b.y || 0) + (b.height || 0));
    });
    return { x: 40, y: bottom + 40 };
  }

  /**
   * Keep every live asset in the storage cache, so an older version can be restored.
   * A painted costume exists only in memory; without this, going back to a version that used it
   * shows a blank costume and the student has lost their drawing.
   */
  function cacheAssets(vm) {
    var st = vm.runtime.storage;
    if (!st) return;
    vm.runtime.targets.forEach(function (t) {
      if (!t.isOriginal) return;
      t.getCostumes().concat(t.getSounds()).forEach(function (a) {
        if (a.asset && a.asset.data && a.asset.assetId) {
          try { st.builtinHelper._store(a.asset.assetType, a.asset.data, a.asset.assetId); } catch (e) { /* best effort */ }
        }
      });
    });
  }

  /** Relabel upstream's strings through the gui's own store action. */
  function patchMessages(store, opts) {
    if (!store) return;
    opts = opts || {};
    var locale = opts.locale || LOCALE;
    var L = store.getState().locales;
    var all = Object.assign({}, L.messagesByLocale);
    [locale, 'en'].forEach(function (loc) {
      var m = Object.assign({}, all[loc]);
      Object.keys(m).forEach(function (k) {
        if (/Scratch/.test(m[k])) REPL.forEach(function (r) { m[k] = m[k].replace(r[0], r[1]); });
      });
      all[loc] = m;
    });
    Object.assign(all[locale], ZH_MISSING, opts.missing || {});
    all[locale]['gui.gui.defaultProjectTitle'] = opts.title || '我的作品';
    all.en['gui.gui.defaultProjectTitle'] = opts.titleEn || 'My project';
    store.dispatch({ type: 'scratch-gui/locales/UPDATE_LOCALES', messagesByLocale: all });
  }

  /**
   * The DOM rules. Every one is additive except where an option says otherwise.
   *
   * `library: true` means the page wants upstream's real asset library (the teachers' playground
   * and the studio prototype both do). Then the library buttons must NOT be relabelled and must
   * NOT be hidden - otherwise the button a teacher presses is labelled 繪畫 but opens the library,
   * and the real paint entry has been hidden underneath it.
   */
  function patchDom(opts) {
    opts = opts || {};
    var allowLib = !!opts.library;

    var logo = document.getElementById('logo_img');
    if (logo && logo.getAttribute('src') !== 'assets/logo.svg') {
      logo.setAttribute('src', 'assets/logo.svg');
      logo.setAttribute('alt', 'Wonder Lab');
    }

    document.querySelectorAll('button[aria-label]').forEach(function (b) {
      var lab = b.getAttribute('aria-label');
      var isMain = /main-button/.test(b.className);
      if (!allowLib && isMain && LIB_LABELS[lab]) {
        b.setAttribute('data-wl-lib', LIB_LABELS[lab]);
        b.setAttribute('aria-label', LIB_LABELS[lab]);
        b.setAttribute('data-tip', LIB_LABELS[lab]);
        // the add-sprite / add-costume icons are a cat head: a plain pencil (Lucide, ISC) reads as 繪畫
        var img = b.querySelector('img');
        if (img && (lab === '選個角色' || lab === '選個造型')) img.setAttribute('src', 'assets/icon-paint.svg');
      } else if (HIDE_LABELS[lab] && !b.hasAttribute('data-wl-lib') && !(allowLib && lab.indexOf('選個') === 0)) {
        (b.closest('li') || b).classList.add('wl-hidden');
      }
    });

    document.querySelectorAll('.tutorials-button').forEach(function (b) { b.classList.add('wl-hidden'); });
    // still hard-coded English in upstream's delete-button.jsx
    document.querySelectorAll('[aria-label="Delete"]').forEach(function (b) { b.setAttribute('aria-label', '刪除'); });
  }

  /**
   * Tell the caller when the project has finished loading. The gui's loadingState moves through
   * LOADING* -> SHOWING*; only a transition out of loading counts, or a restore would re-enter.
   */
  function watchLoads(store, onLoaded) {
    if (!store) return;
    var was = null;
    store.subscribe(function () {
      var ls = store.getState().scratchGui.projectState.loadingState;
      if (ls === was) return;
      var prev = was;
      was = ls;
      if (/^SHOWING/.test(ls) && (!prev || /^LOADING|^FETCHING/.test(prev))) setTimeout(function () { onLoaded(ls); }, 0);
    });
  }

  root.StudioCore = {
    LOCALE: LOCALE,
    STAGE: STAGE,
    LIB_LABELS: LIB_LABELS,
    HIDE_LABELS: HIDE_LABELS,
    blocksInstance: blocksInstance,
    workspace: workspace,
    countStack: countStack,
    place: place,
    cacheAssets: cacheAssets,
    patchMessages: patchMessages,
    patchDom: patchDom,
    watchLoads: watchLoads
  };
}(typeof window !== 'undefined' ? window : this));
