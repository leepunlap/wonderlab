/*!
 * Wonder Lab Studio — English strings.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * Written for the same reader as the Chinese: 12–15 years old, in a lesson, not shopping. Short
 * sentences, plain verbs, no product register ("effortlessly", "seamless" and "empower" do not
 * appear). Labels are Title or sentence case, never ALL CAPS, and never abbreviated — the pane is
 * 360px wide and can afford the word.
 *
 * English is longer than Chinese, which is a layout problem, not a copy problem: the pane's header,
 * chips and composer were all measured in this locale, not translated and hoped for.
 */
(function (root) {
  'use strict';
  if (!root.StudioI18n) return;

  root.StudioI18n.register('en', 'English', {
    'app.editorLabel': 'Block editor',

    'chat.title': 'AI Companion',
    'chat.tabs': 'Companion tabs',
    'chat.tab.chat': 'Chat',
    'chat.tab.guide': 'Guide',
    /* Shorter than the Chinese on purpose: "Prototype · simulated replies" is ~165px in a 44px
       header that also carries a version chip and two buttons at 360px. The detail belongs in the
       About sheet, not in a badge. */
    'chat.badge': 'Prototype',
    'chat.context': 'Sent with: your program',
    'chat.chips': ['Make the sprite move', 'The sprite keeps moving', 'Add a sound'],
    'chat.more': 'More',
    'chat.collapse': 'Hide AI companion',
    'chat.trySaying': 'Try saying',
    'chat.yourIdea': 'Your idea',
    'chat.placeholder': 'What do you want it to do? e.g. jump when I press space',
    'chat.undo': 'Undo',
    'chat.send': 'Send',
    'chat.back': 'Back',
    'chat.thinking': 'Thinking…',
    'chat.showReasoning': 'Show reasoning',
    'chat.hideReasoning': 'Hide reasoning',
    'chat.versionN': 'Version {n}',
    'chat.menu.versions': 'Version history',
    'chat.menu.about': 'About',
    'chat.language': 'Language',
    'chat.editorLocaleFailed': 'The block editor could not switch language. Reload the page and it will.',

    'chat.sheet.versionsHelp': 'Every time you change the program, or the AI does, a version is saved. Later you can compare the approaches that did not work with the one that did.',
    'chat.sheet.export': 'Export all versions (JSON)',

    'chat.about.what': 'What this is',
    'chat.about.body1': 'Wonder Lab Studio prototype: a full block editor on the left (blocks, costumes, sounds, paint editor, stage, sprites) and the AI companion on the right. You can drag blocks yourself, or say what you want and the AI turns it into blocks.',
    'chat.about.body2': 'Every message carries the program you built and the result of the last run, so the AI answers based on what you actually did.',
    'chat.about.legal': 'Licence and source',
    'chat.about.legalBody': 'This page is released under the GNU Affero General Public License v3.0. The editor is built from scratch-editor 15.2.0 (AGPL-3.0-only) and scratch-blocks 2.1.19 (Apache-2.0).',
    'chat.about.noticeLink': 'Licence and source',
    'chat.about.sourceLink': 'Download the source for this page',
    'chat.about.trademark': 'This product is not affiliated with, sponsored or endorsed by the Scratch Foundation or MIT.',

    'chat.greeting': 'Hello — I am your AI companion. Drag blocks yourself, or tell me what you want and I will turn it into blocks in the editor on the left.',
    'chat.fab': 'AI companion',
    'chat.source.stub': 'Prototype',
    'chat.source.model': 'Live model',
    'chat.bootFailed': 'The editor did not load',

    /* ---- Guide: the second tab (see studio-guide-topics.js for the structure) ---- */
    'guide.intro': 'Four short topics, one step at a time. Most steps have a “Show me” button that makes the editor do it in front of you. A demonstration borrows the canvas for a moment; “Back to my project” puts your work back.',
    'guide.stepCount': '{n} steps',
    'guide.back': 'All topics',
    'guide.steps': 'Steps',
    'guide.stepN': 'Step {n}',
    'guide.stepOf': 'Step {n} of {total}',
    'guide.demo': 'Show me',
    'guide.replay': 'Show me again',
    'guide.running': 'Showing…',
    'guide.starting': 'Getting ready…',
    'guide.progress': 'Step {done} of {total}',
    'guide.failed': 'This one could not be shown.',
    'guide.notReady': 'The editor is still loading — one moment.',
    'guide.practice': 'Do it once yourself — that is what makes it stick.',
    'guide.prev': 'Back',
    'guide.next': 'Next',
    'guide.nextTopic': 'Next topic',
    'guide.demoHolding': 'A demonstration is using the canvas',
    'guide.stop': 'Stop',
    'guide.restore': 'Back to my project',
    'guide.voice': 'Narrate',

    'guide.point.flag': 'Green flag',
    'guide.point.stage': 'Stage',
    'guide.point.sprites': 'Sprites',
    'guide.point.palette': 'Blocks',

    'guide.sprite.pico': 'Pico',
    'guide.sprite.lumo': 'Lumo',
    'guide.say.hello': 'Hello!',
    'guide.say.hi': 'You clicked me!',

    'guide.motion.title': 'Make it move',
    'guide.motion.intro': 'Start with the smallest program there is: press the green flag and the sprite moves. Three steps later it walks by itself and bounces off the edges.',
    'guide.motion.a1.title': 'The green flag, and “move”',
    'guide.motion.a1.body': 'Stack “when green flag clicked” with “move 10 steps” and you already have a program. Press the flag: the sprite takes one small step forward.',
    'guide.motion.a2.title': '“Forever” makes it keep going',
    'guide.motion.a2.body': 'Once is not enough. Wrap the move in “forever” and whatever is inside repeats until you press stop.',
    'guide.motion.a3.title': 'Bounce off the edge',
    'guide.motion.a3.body': 'Add “if on edge, bounce” inside the loop and the sprite stops walking off the stage.',

    'guide.keys.title': 'Control it from the keyboard',
    'guide.keys.intro': 'The green flag is not the only way to start a script. Two steps about keys and clicks.',
    'guide.keys.k1.title': 'Arrow keys, left and right',
    'guide.keys.k1.body': 'Two scripts: one listens for the right arrow, one for the left. After the demonstration, try the keys yourself.',
    'guide.keys.k2.title': 'Click the sprite',
    'guide.keys.k2.body': '“When this sprite clicked” is another way in. Once it is built, click the sprite on the stage and it speaks.',

    'guide.looks.title': 'Talking, costumes and size',
    'guide.looks.intro': 'A sprite does more than move: it can talk, change costume, and grow or shrink.',
    'guide.looks.l1.title': 'Let it talk',
    'guide.looks.l1.body': '“Say … for 2 seconds” puts a speech bubble beside the sprite, then takes it away again.',
    'guide.looks.l2.title': 'Costume and size',
    'guide.looks.l2.body': 'Put “next costume” and “change size” inside “repeat 4” and the sprite changes as it grows.',

    'guide.actors.title': 'Sprites and the stage',
    'guide.actors.intro': 'One stage can hold several sprites, each with its own scripts.',
    'guide.actors.t1.title': 'Add a second sprite',
    'guide.actors.t1.body': 'Sprites are added from the sprite pane on the right. This demonstration puts two on the stage: Pico on the left, Lumo on the right.',
    'guide.actors.t2.title': 'Two sprites, each doing its own thing',
    'guide.actors.t2.body': 'Whichever sprite is selected owns the blocks you can see. This script belongs to Lumo alone: it turns as it moves.',

    'chat.ctx.prefix': 'Sent with: ',
    'chat.ctx.program': 'your program: {scripts} scripts, {blocks} blocks',
    'chat.ctx.hand': 'you changed {n} scripts',
    'chat.ctx.run': 'the last run result',
    'chat.ctx.unsupported': '({n} scripts use blocks the AI does not support)',
    'chat.ctx.join': ', ',

    'chat.versions.blocks': '{n} blocks',
    'chat.versions.unsupported': ' (plus blocks the AI cannot read)',
    'chat.versions.ran': ' · ran for {secs}s',
    'chat.versions.restore': 'Restore this version',
    'chat.versions.restored': 'Restored version {n}',
    'chat.versions.restoreFailed': 'Could not restore: ',
    'chat.versions.source.start': 'Start',
    'chat.versions.source.hand': 'Your edit',
    'chat.versions.source.ai': 'AI edit',
    'chat.versions.source.load': 'Loaded',
    'chat.versions.source.restore': 'Restored',

    'assist.unavailable': 'The AI companion could not answer just now.',
    'assist.unsupportedBlocks': 'One script uses blocks the AI cannot read. Its version sits beside your program; yours is untouched.',
    'assist.skipped': '{n} changes could not be applied.',
    'assist.applyFailed': 'Something went wrong while applying the blocks.',
    'assist.network': 'Connection problem — try again.',

    'models.label': 'Model',
    'models.quota': '{left} / {max} left',
    'models.quotaToday': 'Today {left} / {max} left',
    'models.showReasoning': 'Show reasoning',
    'models.session': '{n} tokens this session',
    'models.reset': 'Reset stats',
    'models.resetConfirm': 'Reset the stats for this conversation? This clears the token and cost records.',
    'models.loadFailed': 'Could not load model settings',
    'models.networkFailed': 'Connection problem',
    'models.desc.deepseek-chat': 'Fast replies, fine for most turns',
    'models.desc.deepseek-reasoner': 'Deeper reasoning, can show its thinking'
  }, 2);
}(typeof window !== 'undefined' ? window : this));
