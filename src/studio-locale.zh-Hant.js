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
    'chat.tabs': '學伴分頁',
    'chat.tab.chat': '對話',
    'chat.tab.guide': '指南',
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

    /* ---- 指南: the second tab. Every topic and step is addressed by id, so these keys are the only
       place a topic's words live - see studio-guide-topics.js for the structure they belong to. ---- */
    'guide.intro': '呢度有四個短主題，逐步教你用呢個編輯器。每一步都可以按「示範」，由編輯器自己動手做一次畀你睇。示範會暫時借用畫布，按「返回我的作品」就會還原。',
    'guide.stepCount': '{n} 步',
    'guide.back': '全部主題',
    'guide.steps': '步驟',
    'guide.stepN': '第 {n} 步',
    'guide.stepOf': '第 {n} 步 · 共 {total} 步',
    'guide.demo': '示範',
    'guide.replay': '再睇一次',
    'guide.running': '示範緊…',
    'guide.starting': '準備緊…',
    'guide.narrating': '講解緊…',
    'guide.showing': '做緊畀你睇…',
    'guide.progress': '第 {done} / {total} 個動作',
    'guide.failed': '呢一步示範唔到。',
    'guide.notReady': '編輯器仲載入緊，等一陣先。',
    'guide.practice': '跟住做一次，就會記得。',
    'guide.prev': '上一步',
    'guide.next': '下一步',
    'guide.nextTopic': '下一個主題',
    'guide.demoHolding': '示範借用緊畫布',
    'guide.stop': '停止',
    'guide.restore': '返回我的作品',
    'guide.voice': '朗讀',

    /* the three shapes the guide draws while it talks: click it, drag it, type in it */
    'guide.act.click': '按呢度',
    'guide.act.drag': '拖過去',
    'guide.act.type': '改呢個數字',
    'guide.act.watch': '睇下舞台',

    'guide.point.flag': '綠旗',
    'guide.point.stage': '舞台',
    'guide.point.sprites': '角色區',
    'guide.point.palette': '積木區',

    'guide.sprite.pico': '小光',
    'guide.sprite.lumo': '小飛',
    'guide.say.hello': '你好！',
    'guide.say.hi': '你按咗我！',

    /* The copy is spoken Cantonese, not written Chinese: it is read aloud by a Hong Kong voice, and
       a written sentence read by that voice sounds like a translation. 按 (press), 睇 (look), 佢 (it),
       嘅 / 咗 / 緊 / 埋 / 畀 are the words a teacher standing at the board would use. */
    'guide.motion.title': '動起來',
    'guide.motion.intro': '由最簡單嘅一步開始：按綠旗，角色就向前行。三步之後，佢會自己一直行，撞到邊仲會彈返轉頭。',
    'guide.motion.a1.title': '按綠旗，行一步',
    'guide.motion.a1.body': '將「當綠旗被按下」同「移動 10 步」疊埋一齊，就係第一個程式。按一下綠旗，角色就向前行一小步。',
    'guide.motion.a2.title': '加個「一直重複」，佢就唔會停',
    'guide.motion.a2.body': '行一次唔夠。將「一直重複」套喺外面，裡面嘅積木就會不停重做，直到你按停止為止。',
    'guide.motion.a3.title': '撞到邊就彈返轉頭',
    'guide.motion.a3.body': '喺重複裡面加「碰到邊緣就反彈」，角色就唔會行出舞台。',

    'guide.keys.title': '用鍵盤控制',
    'guide.keys.intro': '除咗綠旗，仲可以用按鍵同滑鼠開始。呢兩步教你換第二種「開始」嘅方法。',
    'guide.keys.k1.title': '左鍵右鍵，左右行',
    'guide.keys.k1.body': '兩段程式：一段聽右方向鍵，一段聽左方向鍵。示範完之後，你自己按一下試下。',
    'guide.keys.k2.title': '按一下角色',
    'guide.keys.k2.body': '「當角色被點擊」係另一種開始方式。砌好之後，用滑鼠按一下舞台上嘅角色，佢就會講嘢。',

    'guide.looks.title': '講嘢同換造型',
    'guide.looks.intro': '角色唔止識行：佢仲可以講嘢、換造型、變大變細。',
    'guide.looks.l1.title': '叫角色講嘢',
    'guide.looks.l1.body': '「說… 2 秒」會喺角色隔籬彈個對話框，兩秒之後自己消失。',
    'guide.looks.l2.title': '換造型、變大小',
    'guide.looks.l2.body': '將「下一個造型」同「尺寸改變」放入「重複 4 次」裡面，角色就會一邊轉造型一邊變大。',

    'guide.actors.title': '角色同舞台',
    'guide.actors.intro': '一個舞台可以有多個角色，各有各嘅程式。',
    'guide.actors.t1.title': '加第二個角色',
    'guide.actors.t1.body': '右邊嘅角色區可以加角色。示範會放兩個角色上舞台：左邊嘅小光，右邊嘅小飛。',
    'guide.actors.t2.title': '兩個角色，各自行動',
    'guide.actors.t2.body': '你揀邊個角色，積木區就係佢嘅程式。呢段程式只屬於小飛：佢會一邊轉一邊行。',

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
