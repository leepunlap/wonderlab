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
    'chat.tabs': '学伴分页',
    'chat.tab.chat': '对话',
    'chat.tab.guide': '指南',
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

    /* ---- 指南: the second tab (see studio-guide-topics.js for the structure) ---- */
    'guide.intro': '这里有四个短主题，逐步教你用这个编辑器。每一步都可以按「示范」，由编辑器自己动手做一次给你看。示范会暂时借用画布，按「返回我的作品」就会还原。',
    'guide.stepCount': '{n} 步',
    'guide.back': '全部主题',
    'guide.steps': '步骤',
    'guide.stepN': '第 {n} 步',
    'guide.stepOf': '第 {n} 步 · 共 {total} 步',
    'guide.demo': '示范',
    'guide.replay': '再看一次',
    'guide.running': '示范中…',
    'guide.starting': '准备中…',
    'guide.progress': '第 {done} / {total} 个动作',
    'guide.failed': '这一步未能示范。',
    'guide.notReady': '编辑器还在载入，请稍等。',
    'guide.practice': '跟着做一次，就会记住。',
    'guide.prev': '上一步',
    'guide.next': '下一步',
    'guide.nextTopic': '下一个主题',
    'guide.demoHolding': '示范借用画布中',
    'guide.stop': '停止',
    'guide.restore': '返回我的作品',

    'guide.point.flag': '绿旗',
    'guide.point.stage': '舞台',
    'guide.point.sprites': '角色区',
    'guide.point.palette': '积木区',

    'guide.sprite.pico': '小光',
    'guide.sprite.lumo': '小飞',
    'guide.say.hello': '你好！',
    'guide.say.hi': '你按了我！',

    'guide.motion.title': '动起来',
    'guide.motion.intro': '从最简单的一步开始：按绿旗，角色向前走。三个步骤之后，它会自己一直走，碰到边缘还会反弹。',
    'guide.motion.a1.title': '绿旗与「移动」',
    'guide.motion.a1.body': '把「当绿旗被点击」和「移动 10 步」叠在一起，就是第一个程序。按绿旗，角色向前走一小步。',
    'guide.motion.a2.title': '用「重复执行」让它不停走',
    'guide.motion.a2.body': '只走一次不够。把「重复执行」套在外面，里面的积木就会不断重做，直到你按停止。',
    'guide.motion.a3.title': '碰到边缘就反弹',
    'guide.motion.a3.body': '在重复里面加「碰到边缘就反弹」，角色就不会走出舞台。',

    'guide.keys.title': '用键盘控制',
    'guide.keys.intro': '除了绿旗，还可以由按键和鼠标触发。这两个步骤教你换一个「开始」的方式。',
    'guide.keys.k1.title': '左右方向键，左右移动',
    'guide.keys.k1.body': '两段程序：一段听右方向键，一段听左方向键。示范之后，自己按按看。',
    'guide.keys.k2.title': '点一下角色',
    'guide.keys.k2.body': '「当角色被点击」是另一种开始方式。搭好之后，用鼠标点一下舞台上的角色，它就会说话。',

    'guide.looks.title': '说话与造型',
    'guide.looks.intro': '角色不只能移动：它可以说话、换造型、变大变小。',
    'guide.looks.l1.title': '让角色说话',
    'guide.looks.l1.body': '「说… 2 秒」会在角色旁边显示对话框，两秒之后自动消失。',
    'guide.looks.l2.title': '换造型、变大小',
    'guide.looks.l2.body': '把「下一个造型」和「大小改变」放进「重复执行 4 次」，角色就一边换造型一边长大。',

    'guide.actors.title': '角色与舞台',
    'guide.actors.intro': '一个舞台可以有多个角色，各自有自己的程序。',
    'guide.actors.t1.title': '加入第二个角色',
    'guide.actors.t1.body': '右边的角色区可以加角色。示范会把两个角色放到舞台上：左边的小光，右边的小飞。',
    'guide.actors.t2.title': '两个角色，各自行动',
    'guide.actors.t2.body': '选中哪个角色，积木区就是它的程序。这段程序只属于小飞：它会一边转一边走。',

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
