/*!
 * Wonder Lab Studio — 简体中文 strings.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * NOT A TRANSLATION — AN ORTHOGRAPHIC VARIANT. Simplified and Traditional are the same language in
 * two writing systems, so a machine translation here would be wrong twice: it would turn 程式 into
 * 程序 but also reword sentences that never needed rewording, and it would lose the tutoring voice.
 *
 * Which is why this file is a conversion, not a translation, and why the conversion is not
 * character-by-character: Hong Kong and mainland software say different words for the same thing.
 * The pairs this product actually uses are 程式→程序, 執行→运行, 匯出→导出, 重設→重置,
 * 空白鍵→空格键, 音效→声音. Everything else is a straight character conversion.
 *
 * Scratch's own zh-cn uses 角色 / 造型 / 声音 / 舞台 / 积木, and the editor is switched to that
 * locale alongside this file, so the block editor and this pane name the same things the same way.
 */
(function (root) {
  'use strict';
  if (!root.StudioI18n) return;

  root.StudioI18n.register('zh-Hans', '简体', {
    'app.editorLabel': '积木编辑器',

    'chat.title': 'AI 学伴',
    'chat.badge': '原型 · 模拟回复',
    'chat.context': '发送时会附带：你的程序',
    'chat.chips': ['我想让角色移动', '角色一直走', '加入声音'],
    'chat.more': '更多',
    'chat.collapse': '收起 AI 学伴',
    'chat.trySaying': '试着这样说',
    'chat.yourIdea': '你的想法',
    'chat.placeholder': '说说你的想法，例如：按空格键时角色跳起',
    'chat.undo': '撤销',
    'chat.send': '发送',
    'chat.back': '返回',
    'chat.thinking': '思考中…',
    'chat.showReasoning': '显示思考过程',
    'chat.hideReasoning': '隐藏思考过程',
    'chat.versionN': '版本 {n}',
    'chat.menu.versions': '版本记录',
    'chat.menu.about': '说明',
    'chat.language': '语言',
    'chat.editorLocaleFailed': '积木编辑器未能切换到这个语言。重新加载页面即可生效。',

    'chat.sheet.versionsHelp': '每次你自己改程序，或者 AI 改了程序，都会记下一个版本。之后可以比较：先前试过、行不通的做法，和最后行得通的做法。',
    'chat.sheet.export': '导出全部版本（JSON）',

    'chat.about.what': '这是什么',
    'chat.about.body1': 'Wonder Lab Studio 原型：左边是完整的积木编辑器（积木、造型、声音、绘图编辑器、舞台、角色），右边是 AI 学伴。你可以自己拖积木，也可以说出想法，由 AI 把想法变成积木。',
    'chat.about.body2': '每一次对话都会附带你自己搭的程序和上一次运行的结果，所以 AI 会根据你自己的做法回应。',
    'chat.about.legal': '版权及源代码',
    'chat.about.legalBody': '本页以 GNU Affero General Public License v3.0 发布。编辑器部分来自开源的 scratch-editor 15.2.0（AGPL-3.0-only）及 scratch-blocks 2.1.19（Apache-2.0）。',
    'chat.about.noticeLink': '版权声明及源代码',
    'chat.about.sourceLink': '下载本页源代码',
    'chat.about.trademark': '本产品与 Scratch Foundation 或麻省理工学院没有关系，亦未获其赞助或认可。',

    'chat.greeting': '你好！我是 AI 学伴。你可以自己拖积木，也可以告诉我你的想法，我会把它变成积木放进左边的程序区。',
    'chat.fab': 'AI 学伴',
    'chat.source.stub': '原型 · 模拟回复',
    'chat.source.model': '真实模型',
    'chat.bootFailed': '编辑器加载失败',

    'chat.ctx.prefix': '发送时会附带：',
    'chat.ctx.program': '你的程序：{scripts} 段、{blocks} 个积木',
    'chat.ctx.hand': '你自己改了 {n} 段',
    'chat.ctx.run': '上次运行的结果',
    'chat.ctx.unsupported': '（有 {n} 段用了 AI 未支持的积木）',
    'chat.ctx.join': '、',

    'chat.versions.blocks': '{n} 个积木',
    'chat.versions.unsupported': '（另有 AI 看不懂的积木）',
    'chat.versions.ran': ' · 已运行 {secs} 秒',
    'chat.versions.restore': '还原这个版本',
    'chat.versions.restored': '还原了第 {n} 版',
    'chat.versions.restoreFailed': '还原失败：',
    'chat.versions.source.start': '开始',
    'chat.versions.source.hand': '自己改',
    'chat.versions.source.ai': 'AI 改',
    'chat.versions.source.load': '加载',
    'chat.versions.source.restore': '还原',

    'assist.unavailable': 'AI 学伴暂时未能回答。',
    'assist.unsupportedBlocks': '有一段程序用了 AI 看不懂的积木，AI 的版本放在旁边，你原本的程序没有改动。',
    'assist.skipped': '有 {n} 个改动未能应用。',
    'assist.applyFailed': '应用积木时出错。',
    'assist.network': '连接出问题，请再试一次。',

    'models.label': '模型',
    'models.quota': '剩 {left} / {max}',
    'models.quotaToday': '今日剩 {left} / {max}',
    'models.showReasoning': '显示推理过程',
    'models.session': '本次 {n} tokens',
    'models.reset': '重置统计',
    'models.resetConfirm': '重置本次对话统计？这会清除 token 用量和费用记录。',
    'models.loadFailed': '无法加载模型配置',
    'models.networkFailed': '连接出问题',
    'models.desc.deepseek-chat': '快速响应，适合一般对话',
    'models.desc.deepseek-reasoner': '深度推理，可显示思考过程'
  }, 1);
}(typeof window !== 'undefined' ? window : this));
