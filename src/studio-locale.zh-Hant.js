/*!
 * Wonder Lab Studio — 繁體中文（香港）strings.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * THE SOURCE LANGUAGE. Every other locale file is derived from this one: if a key is missing
 * elsewhere the translator falls back here, so a half-finished translation degrades into Chinese
 * rather than into `chat.send`.
 *
 * Keys are `surface.thing`, not sentences. A key is a place in the interface; if the Chinese and the
 * English would split one key into two, that is a sign the interface has two places, not one.
 */
(function (root) {
  'use strict';
  if (!root.StudioI18n) return;

  root.StudioI18n.register('zh-Hant', '繁體', {
    'app.editorLabel': '積木編輯器',

    'chat.title': 'AI 學伴',
    'chat.badge': '原型 · 模擬回覆',
    'chat.context': '送出時會附上：你的程式',
    'chat.chips': ['我想角色移動', '角色一直走', '加入聲音'],
    'chat.more': '更多',
    'chat.collapse': '收起 AI 學伴',
    'chat.trySaying': '試試這樣說',
    'chat.yourIdea': '你的想法',
    'chat.placeholder': '說說你的想法，例如：按空白鍵時角色跳起',
    'chat.undo': '上一步',
    'chat.send': '送出',
    'chat.back': '返回',
    'chat.thinking': '思考中…',
    'chat.showReasoning': '顯示思考過程',
    'chat.hideReasoning': '隱藏思考過程',
    'chat.versionN': '版本 {n}',
    'chat.menu.versions': '版本記錄',
    'chat.menu.about': '說明',
    'chat.language': '語言',
    'chat.editorLocaleFailed': '積木編輯器未能轉用這個語言。重新載入頁面就會生效。',

    'chat.sheet.versionsHelp': '每次你自己改程式，或者 AI 改了程式，都會記下一個版本。之後可以比較：先前試過、行不通的做法，和最後行得通的做法。',
    'chat.sheet.export': '匯出全部版本（JSON）',

    'chat.about.what': '這是甚麼',
    'chat.about.body1': 'Wonder Lab Studio 原型：左邊是完整的積木編輯器（積木、造型、音效、繪圖編輯器、舞台、角色），右邊是 AI 學伴。你可以自己拖積木，也可以說出想法，由 AI 把想法變成積木。',
    'chat.about.body2': '每一次對話都會附上你自己砌的程式和上一次執行的結果，所以 AI 會根據你自己的做法回應。',
    'chat.about.legal': '版權及原始碼',
    'chat.about.legalBody': '本頁以 GNU Affero General Public License v3.0 發布。編輯器部分來自開源的 scratch-editor 15.2.0（AGPL-3.0-only）及 scratch-blocks 2.1.19（Apache-2.0）。',
    'chat.about.noticeLink': '版權聲明及原始碼',
    'chat.about.sourceLink': '下載本頁原始碼',
    'chat.about.trademark': '本產品與 Scratch Foundation 或麻省理工學院沒有關係，亦未獲其贊助或認可。',

    'chat.greeting': '你好！我是 AI 學伴。你可以自己拖積木，也可以告訴我你的想法，我會把它變成積木放進左邊的程式區。',
    'chat.fab': 'AI 學伴',
    'chat.source.stub': '原型 · 模擬回覆',
    'chat.source.model': '真實模型',
    'chat.bootFailed': '編輯器載入失敗',

    /* The context line is assembled from parts, not concatenated in code: English puts the count
       after the noun and joins with commas, Chinese puts it before and joins with 、. */
    'chat.ctx.prefix': '送出時會附上：',
    'chat.ctx.program': '你的程式：{scripts} 段、{blocks} 個積木',
    'chat.ctx.hand': '你自己改了 {n} 段',
    'chat.ctx.run': '上次執行的結果',
    'chat.ctx.unsupported': '（有 {n} 段用了 AI 未支援的積木）',
    'chat.ctx.join': '、',

    'chat.versions.blocks': '{n} 個積木',
    'chat.versions.unsupported': '（另有 AI 看不懂的積木）',
    'chat.versions.ran': ' · 已執行 {secs} 秒',
    'chat.versions.restore': '還原這個版本',
    'chat.versions.restored': '還原了第 {n} 版',
    'chat.versions.restoreFailed': '還原失敗：',
    'chat.versions.source.start': '開始',
    'chat.versions.source.hand': '自己改',
    'chat.versions.source.ai': 'AI 改',
    'chat.versions.source.load': '載入',
    'chat.versions.source.restore': '還原',

    'assist.unavailable': 'AI 學伴暫時未能回答。',
    'assist.unsupportedBlocks': '有一段程式用了 AI 看不懂的積木，AI 的版本放在旁邊，你原本的程式沒有改動。',
    'assist.skipped': '有 {n} 個改動未能套用。',
    'assist.applyFailed': '套用積木時出錯。',
    'assist.network': '連線有問題，請再試一次。',

    'models.label': '模型',
    'models.quota': '剩 {left} / {max}',
    'models.quotaToday': '今日剩 {left} / {max}',
    'models.showReasoning': '顯示推理過程',
    'models.session': '本次 {n} tokens',
    'models.reset': '重設統計',
    'models.resetConfirm': '重設本次對話統計？這會清除 token 用量和費用記錄。',
    'models.loadFailed': '無法載入模型配置',
    'models.networkFailed': '連線有問題',
    'models.desc.deepseek-chat': '快速回應，適合一般對話',
    'models.desc.deepseek-reasoner': '深度推理，可顯示思考過程'
  }, 0);
}(typeof window !== 'undefined' ? window : this));
