/*!
 * Wonder Lab Studio — one lesson at a time, from nothing, as data.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * WHAT THIS IS
 * The ten L4 lessons that are built in Wonder Lab, each as a walk a student can follow without a
 * teacher: an empty stage, the actors brought in, the background put behind them, then the blocks
 * task by task. The lesson pages show the same work as screenshots; this is the work as steps, so it
 * can be said out loud, pointed at, and performed on the real editor.
 *
 * WHY IT STARTS FROM NOTHING
 * The lesson files arrive with their actors and backdrop already on the stage, which is why a child
 * who opens a blank project cannot start: nothing in the material ever says where 小老鼠 came from.
 * Every lesson here begins with three steps that are true of every project — new project, bring the
 * actors in, put a background behind them — and those are the `basic` ones a reader in 熟手 mode
 * never sees.
 *
 * THE ACTORS ARE STAND-INS, THE SCRIPTS ARE NOT
 * The lesson's own artwork belongs to the lesson file and is not in the shared library, so a
 * demonstration imports the closest library actor and names it what the lesson calls it. The blocks
 * address 小老鼠 and 長頸鹿 by name exactly as the lesson does — only the drawing differs, and the
 * copy says so once.
 *
 * WHAT A LESSON CANNOT SHOW
 * 自製積木 (procedures) are not in the studio's block whitelist, so the lessons that use them
 * (植樹問題, 質數與合數, 繩子算法) walk the idea — the loop, the condition, the remainder — and say
 * plainly that the block itself has to be built in UC-Mind. Promising a demonstration that cannot
 * run is worse than admitting one.
 *
 * ES5, like the rest of the studio's own code: this ships to old browsers.
 */
(function (root) {
  'use strict';

  var flag = { op: 'event_whenflagclicked' };
  var forever = function (sub) { return { op: 'control_forever', SUBSTACK: sub }; };
  var repeat = function (n, sub) { return { op: 'control_repeat', TIMES: n, SUBSTACK: sub }; };
  var wait = function (s) { return { op: 'control_wait', DURATION: s }; };
  var move = function (n) { return { op: 'motion_movesteps', STEPS: n }; };
  var turn = function (n) { return { op: 'motion_turnright', DEGREES: n }; };
  var say = function (key, secs) { return { op: 'looks_sayforsecs', MESSAGE: { k: key }, SECS: secs }; };
  var ifThen = function (cond, sub) { return { op: 'control_if', CONDITION: cond, SUBSTACK: sub }; };
  var touching = function (ref) { return { op: 'sensing_touchingobject', TOUCHINGOBJECTMENU: { k: 'guide.sprite.' + ref } }; };
  var word = function (key) { return { k: key }; };

  /** Every lesson starts here: the stage and nothing on it. */
  var EMPTY = { empty: true };

  /** The three steps no lesson material ever writes down, in the order they happen. */
  function opening(actors, backdrop) {
    return [
      {
        id: 'p0', basic: true,
        demo: { project: EMPTY, point: 'stage' }
      },
      {
        id: 'p1', basic: true,
        demo: {
          project: EMPTY,
          add: actors,
          annotate: [
            { shape: 'circle', at: 'addSprite', label: 'guide.act.click' },
            { shape: 'arrow', from: 'addSprite', to: 'sprites' }
          ]
        }
      },
      {
        id: 'p2', basic: true,
        demo: {
          project: EMPTY,
          add: [{ do: 'add_backdrop', name: backdrop }],
          annotate: [
            { shape: 'circle', at: 'addBackdrop', label: 'guide.act.click' },
            { shape: 'arrow', from: 'addBackdrop', to: 'stage' }
          ]
        }
      }
    ];
  }

  root.StudioGuideLessons = [
    /* ---------------------------------------------------------------- 1 · 是誰吃了我的蘋果 */
    {
      id: '501-bp01',
      kind: 'lesson',
      icon: '<circle cx="12" cy="12" r="7"/><path d="M12 5V2"/><path d="M9 4l3-2 3 2"/>',
      steps: opening([
        { do: 'add_sprite', name: 'Mouse1', sprite: '@mouse' },
        { do: 'add_sprite', name: 'Giraffe', sprite: '@giraffe' },
        { do: 'add_sprite', name: 'Snake', sprite: '@snake' },
        { do: 'add_sprite', name: 'Elephant', sprite: '@elephant' }
      ], 'Forest').concat([
        {
          id: 't1',
          demo: {
            project: EMPTY, focus: '@mouse',
            scripts: [{
              sprite: '@mouse', id: 'l11',
              blocks: [flag, forever([{ op: 'motion_glideto', SECS: 0.3 }])]
            }],
            annotate: [{ shape: 'circle', at: 'stage', label: 'guide.act.watch' }],
            run: 2400
          }
        },
        {
          id: 't2',
          demo: {
            project: EMPTY, focus: '@mouse',
            scripts: [{
              sprite: '@mouse', id: 'l12',
              blocks: [flag, forever([{ op: 'looks_nextcostume' }, wait(0.2)])]
            }],
            run: 2000
          }
        },
        {
          id: 't3',
          demo: {
            project: EMPTY, focus: '@mouse',
            scripts: [{ sprite: '@mouse', id: 'l13', blocks: [flag, { op: 'sound_play', SOUND_MENU: 'Meow' }] }],
            annotate: [{ shape: 'circle', at: 'stage', label: 'guide.act.watch' }],
            run: 1600
          }
        },
        {
          id: 't4',
          demo: {
            project: EMPTY, focus: '@giraffe',
            scripts: [{
              sprite: '@giraffe', id: 'l14',
              blocks: [flag, forever([ifThen(touching('mouse'), [say('guide.l50101.giraffe', 2)])])]
            }],
            annotate: [{ shape: 'circle', at: 'stage', label: 'guide.act.watch' }],
            run: 2600
          }
        }
      ])
    },

    /* ---------------------------------------------------------------- 2 · 穿越迷宮 */
    {
      id: '501-bp02',
      kind: 'lesson',
      icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 3v10"/><path d="M16 21V11"/><path d="M3 16h9"/>',
      steps: opening([
        { do: 'add_sprite', name: 'Ball', sprite: '@slime' },
        { do: 'add_sprite', name: 'Rocks', sprite: '@start' },
        { do: 'add_sprite', name: 'Star', sprite: '@goal' },
        { do: 'add_sprite', name: 'Balloon1', sprite: '@warp' }
      ], 'Canyon').concat([
        {
          id: 't1',
          demo: {
            project: EMPTY, focus: '@slime',
            scripts: [
              { sprite: '@slime', id: 'l21', blocks: [{ op: 'event_whenkeypressed', KEY_OPTION: 'right arrow' }, { op: 'motion_pointindirection', DIRECTION: 90 }, move(6)] },
              { sprite: '@slime', id: 'l22', blocks: [{ op: 'event_whenkeypressed', KEY_OPTION: 'left arrow' }, { op: 'motion_pointindirection', DIRECTION: -90 }, move(6)] }
            ],
            keys: ['ArrowRight', 'ArrowLeft'],
            annotate: [{ shape: 'circle', at: 'stage', label: 'guide.act.watch' }]
          }
        },
        {
          id: 't2',
          demo: {
            project: EMPTY, focus: '@slime',
            scripts: [{
              sprite: '@slime', id: 'l23',
              blocks: [flag, forever([
                move(3),
                ifThen({ op: 'sensing_touchingcolor', COLOR: '#a20000' }, [{ op: 'motion_movesteps', STEPS: -3 }])
              ])]
            }],
            annotate: [
              { shape: 'square', at: 'field:sensing_touchingcolor/COLOR', label: 'guide.act.pick', when: 'built' }
            ],
            run: 2400
          }
        },
        {
          id: 't3',
          demo: {
            project: EMPTY, focus: '@warp',
            scripts: [{
              sprite: '@warp', id: 'l24',
              blocks: [flag, forever([
                wait(2),
                { op: 'motion_glidesecstoxy', SECS: 1,
                  X: { op: 'operator_random', FROM: -180, TO: 180 },
                  Y: { op: 'operator_random', FROM: -140, TO: 140 } }
              ])]
            }],
            run: 3600
          }
        },
        {
          id: 't4',
          demo: {
            project: EMPTY, focus: '@slime',
            scripts: [
              { sprite: '@slime', id: 'l25', blocks: [flag, forever([ifThen(touching('warp'), [{ op: 'motion_gotoxy', X: 0, Y: -165 }])])] },
              { sprite: '@slime', id: 'l26', blocks: [flag, forever([ifThen(touching('goal'), [say('guide.l50102.win', 3)])])] }
            ],
            annotate: [{ shape: 'circle', at: 'stage', label: 'guide.act.watch' }],
            run: 2800
          }
        }
      ])
    },

    /* ---------------------------------------------------------------- 3 · 煙花綻放 */
    {
      id: '501-bp03',
      kind: 'lesson',
      icon: '<path d="M12 3v6"/><path d="m9 6 3-3 3 3"/><path d="M12 9 6 15"/><path d="M12 9l6 6"/><path d="M12 9v6"/>',
      steps: opening([
        { do: 'add_sprite', name: 'Ben', sprite: '@boy' },
        { do: 'add_sprite', name: 'Gift', sprite: '@tube' },
        { do: 'add_sprite', name: 'Star', sprite: '@firework' }
      ], 'Galaxy').concat([
        {
          id: 't1',
          demo: {
            project: EMPTY, focus: '@boy',
            scripts: [{
              sprite: '@boy', id: 'l31',
              blocks: [flag, { op: 'motion_glidesecstoxy', SECS: 2, X: -60, Y: -110 }]
            }],
            annotate: [{ shape: 'circle', at: 'stage', label: 'guide.act.watch' }],
            run: 2600
          }
        },
        {
          id: 't2',
          demo: {
            project: EMPTY, focus: '@firework',
            scripts: [
              { sprite: '@boy', id: 'l32', blocks: [flag, { op: 'motion_glidesecstoxy', SECS: 1.5, X: -60, Y: -110 }, { op: 'event_broadcast', BROADCAST_INPUT: word('guide.l50103.msg') }] },
              { sprite: '@firework', id: 'l33', blocks: [{ op: 'event_whenbroadcastreceived', BROADCAST_OPTION: word('guide.l50103.msg') }, { op: 'looks_show' }, { op: 'motion_gotoxy', X: -60, Y: -110 }] }
            ],
            annotate: [{ shape: 'circle', at: 'stage', label: 'guide.act.watch' }],
            run: 3200
          }
        },
        {
          id: 't3',
          demo: {
            project: EMPTY, focus: '@firework',
            scripts: [{
              sprite: '@firework', id: 'l34',
              blocks: [{ op: 'event_whenbroadcastreceived', BROADCAST_OPTION: word('guide.l50103.msg') },
                { op: 'looks_show' }, { op: 'motion_gotoxy', X: -60, Y: -110 },
                repeat(8, [{ op: 'looks_changesizeby', CHANGE: 10 }, wait(0.08)]),
                wait(0.6), { op: 'looks_hide' }]
            }],
            run: 3600
          }
        },
        {
          id: 't4',
          demo: {
            project: EMPTY, focus: '@tube',
            scripts: [{
              sprite: '@tube', id: 'l35',
              blocks: [flag, wait(1), { op: 'event_broadcast', BROADCAST_INPUT: word('guide.l50103.msg') }, wait(3), { op: 'event_broadcast', BROADCAST_INPUT: word('guide.l50103.msg') }]
            }],
            run: 3200
          }
        }
      ])
    },

    /* ---------------------------------------------------------------- 4 · 位置與坐標 */
    {
      id: '501-bp04',
      kind: 'lesson',
      icon: '<path d="M3 3v18h18"/><circle cx="9" cy="15" r="2"/><path d="m9 15 6-6"/>',
      steps: opening([
        { do: 'add_sprite', name: 'Dove', sprite: '@dove' },
        { do: 'add_sprite', name: 'Gift', sprite: '@gift' }
      ], 'Xy-grid').concat([
        {
          id: 't1',
          demo: {
            project: EMPTY, focus: '@dove',
            scripts: [{ sprite: '@dove', id: 'l41', blocks: [flag, { op: 'motion_gotoxy', X: 0, Y: 0 }] }],
            annotate: [
              { shape: 'square', at: 'field:motion_gotoxy/X', label: 'guide.act.type', when: 'built' }
            ],
            run: 1400
          }
        },
        {
          id: 't2',
          demo: {
            project: EMPTY, focus: '@dove',
            scripts: [{ sprite: '@dove', id: 'l42', blocks: [flag, repeat(4, [{ op: 'motion_changexby', DX: 50 }, wait(0.4)])] }],
            annotate: [{ shape: 'circle', at: 'stage', label: 'guide.act.watch' }],
            run: 2600
          }
        },
        {
          id: 't3',
          demo: {
            project: EMPTY, focus: '@dove',
            scripts: [{ sprite: '@dove', id: 'l43', blocks: [flag, { op: 'motion_glidesecstoxy', SECS: 2, X: 100, Y: -100 }] }],
            annotate: [{ shape: 'circle', at: 'stage', label: 'guide.act.watch' }],
            run: 2800
          }
        },
        {
          id: 't4',
          demo: {
            project: EMPTY, focus: '@gift',
            scripts: [{
              sprite: '@gift', id: 'l44',
              blocks: [flag, forever([ifThen(touching('dove'), [{ op: 'looks_nextcostume' }, say('guide.l50104.open', 2)])])]
            }],
            run: 2600
          }
        }
      ])
    },

    /* ---------------------------------------------------------------- 7 · 美麗的圖形 */
    {
      id: '501-bp07',
      kind: 'lesson',
      icon: '<path d="M12 3l9 16H3z"/><path d="M12 3v16"/>',
      steps: opening([
        { do: 'add_sprite', name: 'Fish', sprite: '@fish' },
        { do: 'add_sprite', name: 'Star', sprite: '@moon' },
        { do: 'add_sprite', name: 'Butterfly 1', sprite: '@butterfly' }
      ], 'Light').concat([
        {
          id: 't1',
          demo: {
            project: EMPTY, focus: '@fish',
            scripts: [{
              sprite: '@fish', id: 'l71',
              blocks: [flag, { op: 'motion_gotoxy', X: -120, Y: 60 }, { op: 'pen_clear' },
                { op: 'pen_stamp' }, { op: 'motion_changexby', DX: 140 }, { op: 'pen_stamp' }]
            }],
            annotate: [{ shape: 'circle', at: 'stage', label: 'guide.act.watch' }],
            run: 2000
          }
        },
        {
          id: 't2',
          demo: {
            project: EMPTY, focus: '@moon',
            scripts: [{
              sprite: '@moon', id: 'l72',
              blocks: [flag, { op: 'motion_gotoxy', X: 90, Y: 20 }, { op: 'pen_clear' },
                repeat(8, [{ op: 'pen_stamp' }, turn(45)])]
            }],
            run: 2600
          }
        },
        {
          id: 't3',
          demo: {
            project: EMPTY, focus: '@fish',
            scripts: [{
              sprite: '@fish', id: 'l73',
              blocks: [flag, { op: 'motion_gotoxy', X: -60, Y: -40 }, { op: 'pen_clear' },
                { op: 'pen_penDown' }, { op: 'pen_setPenSizeTo', SIZE: 3 },
                repeat(4, [move(80), turn(90)]), { op: 'pen_penUp' }]
            }],
            annotate: [
              { shape: 'square', at: 'field:control_repeat/TIMES', label: 'guide.act.type', when: 'built' }
            ],
            run: 2600
          }
        },
        {
          id: 't4',
          demo: {
            project: EMPTY, focus: '@fish',
            scripts: [{
              sprite: '@fish', id: 'l74',
              blocks: [flag, { op: 'motion_gotoxy', X: 20, Y: -40 }, { op: 'pen_clear' },
                { op: 'pen_penDown' },
                repeat(3, [move(90), turn(120)]),
                { op: 'pen_penUp' }]
            }],
            run: 2400
          }
        }
      ])
    },

    /* ---------------------------------------------------------------- 10 · 數字猜大小 */
    {
      id: '501-bp10',
      kind: 'lesson',
      icon: '<path d="M9 8h6"/><path d="M9 16h6"/><path d="M12 8v8"/><path d="M5 12h14"/>',
      steps: opening([
        { do: 'add_sprite', name: 'Elephant', sprite: '@calf' },
        { do: 'add_sprite', name: 'Apple', sprite: '@tens' },
        { do: 'add_sprite', name: 'Ball', sprite: '@ones' }
      ], 'Hall').concat([
        {
          id: 't1',
          demo: {
            project: EMPTY, focus: '@calf',
            scripts: [{
              sprite: '@calf', id: 'l101',
              blocks: [flag, { op: 'data_setvariableto', VARIABLE: word('guide.l50110.num'), VALUE: { op: 'operator_random', FROM: 0, TO: 99 } },
                say('guide.l50110.ready', 2)]
            }],
            annotate: [
              { shape: 'square', at: 'field:data_setvariableto/VALUE', label: 'guide.act.type', when: 'built' }
            ],
            run: 2400
          }
        },
        {
          id: 't2',
          demo: {
            project: EMPTY, focus: '@calf',
            scripts: [{
              sprite: '@calf', id: 'l102',
              blocks: [flag, { op: 'sensing_askandwait', QUESTION: word('guide.l50110.ask') }, say('guide.l50110.answer', 2)]
            }],
            run: 2600
          }
        },
        {
          id: 't3',
          demo: {
            project: EMPTY, focus: '@tens',
            scripts: [{
              sprite: '@tens', id: 'l103',
              blocks: [flag, { op: 'looks_switchcostumeto' }, { op: 'motion_gotoxy', X: 80, Y: 30 }]
            }],
            run: 1600
          }
        },
        {
          id: 't4',
          demo: {
            project: EMPTY, focus: '@ones',
            scripts: [{
              sprite: '@ones', id: 'l104',
              blocks: [flag, { op: 'looks_switchcostumeto' }, { op: 'motion_gotoxy', X: 145, Y: 30 },
                wait(0.6), say('guide.say.done', 2)]
            }],
            run: 2600
          }
        }
      ])
    },

    /* ---------------------------------------------------------------- 13 · 雞兔同籠 */
    {
      id: '501-bp13',
      kind: 'lesson',
      icon: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M4 12h16"/><path d="M8 8V5"/><path d="M16 8V5"/>',
      steps: opening([
        { do: 'add_sprite', name: 'Chick', sprite: '@chick' },
        { do: 'add_sprite', name: 'Rabbit', sprite: '@rabbit' },
        { do: 'add_sprite', name: 'Wizard Girl', sprite: '@girl' }
      ], 'Farm').concat([
        {
          id: 't1',
          demo: {
            project: EMPTY, focus: '@girl',
            scripts: [{
              sprite: '@girl', id: 'l131',
              blocks: [flag,
                { op: 'data_setvariableto', VARIABLE: word('guide.l50113.heads'), VALUE: { op: 'operator_random', FROM: 5, TO: 12 } },
                say('guide.l50113.ask', 3)]
            }],
            run: 3000
          }
        },
        {
          id: 't2',
          demo: {
            project: EMPTY, focus: '@chick',
            scripts: [
              { sprite: '@chick', id: 'l132', blocks: [flag, { op: 'looks_hide' }, repeat(5, [{ op: 'control_create_clone_of', CLONE_OPTION: '_myself_' }])] },
              { sprite: '@chick', id: 'l133', blocks: [{ op: 'control_start_as_clone' }, { op: 'looks_show' }, { op: 'motion_gotoxy', X: { op: 'operator_random', FROM: -180, TO: 0 }, Y: -20 }] }
            ],
            annotate: [{ shape: 'circle', at: 'stage', label: 'guide.act.watch' }],
            run: 2600
          }
        },
        {
          id: 't3',
          demo: {
            project: EMPTY, focus: '@rabbit',
            scripts: [{
              sprite: '@rabbit', id: 'l134',
              blocks: [flag, { op: 'looks_hide' }, repeat(5, [{ op: 'control_create_clone_of', CLONE_OPTION: '_myself_' }]),
                { op: 'control_stop', STOP_OPTION: 'this script' }]
            }],
            run: 2000
          }
        },
        {
          id: 't4',
          demo: {
            project: EMPTY, focus: '@girl',
            scripts: [{
              sprite: '@girl', id: 'l135',
              blocks: [flag,
                { op: 'data_setvariableto', VARIABLE: word('guide.l50113.feet'), VALUE: 26 },
                repeat(6, [
                  { op: 'control_if', CONDITION: { op: 'operator_equals', OPERAND1: { op: 'operator_mod', NUM1: 26, NUM2: 2 }, OPERAND2: 0 },
                    SUBSTACK: [say('guide.l50113.try', 1)] },
                  wait(0.5)
                ]),
                say('guide.say.done', 2)]
            }],
            run: 3600
          }
        }
      ])
    },

    /* ---------------------------------------------------------------- 19 · 植樹問題 */
    {
      id: '502-bp03',
      kind: 'lesson',
      icon: '<path d="M12 21v-6"/><path d="M12 15l-4-4h8z"/><path d="M12 11 8 7h8z"/>',
      steps: opening([
        { do: 'add_sprite', name: 'Tree1', sprite: '@tree' }
      ], 'Pathway').concat([
        {
          id: 't1',
          demo: {
            project: EMPTY, focus: '@tree',
            scripts: [{
              sprite: '@tree', id: 'l31b',
              blocks: [flag, { op: 'looks_sayforsecs', MESSAGE: { op: 'operator_divide', NUM1: 40, NUM2: 2 }, SECS: 3 }]
            }],
            run: 2600
          }
        },
        {
          id: 't2',
          demo: {
            project: EMPTY, focus: '@tree',
            scripts: [{
              sprite: '@tree', id: 'l32b',
              blocks: [flag, { op: 'motion_gotoxy', X: -200, Y: -100 },
                repeat(10, [{ op: 'control_create_clone_of', CLONE_OPTION: '_myself_' }, { op: 'motion_changexby', DX: 40 }])]
            }],
            annotate: [{ shape: 'circle', at: 'stage', label: 'guide.act.watch' }],
            run: 2600
          }
        },
        {
          id: 't3',
          demo: {
            project: EMPTY, focus: '@tree',
            scripts: [{
              sprite: '@tree', id: 'l33b',
              blocks: [flag, { op: 'motion_gotoxy', X: -150, Y: -80 }, { op: 'motion_pointindirection', DIRECTION: 90 },
                repeat(2, [
                  repeat(6, [{ op: 'motion_movesteps', STEPS: 50 }, { op: 'control_create_clone_of', CLONE_OPTION: '_myself_' }]),
                  turn(90),
                  repeat(4, [{ op: 'motion_movesteps', STEPS: 50 }, { op: 'control_create_clone_of', CLONE_OPTION: '_myself_' }]),
                  turn(90)
                ])]
            }],
            run: 3200
          }
        },
        {
          id: 't4',
          demo: {
            project: EMPTY, focus: '@tree',
            scripts: [{
              sprite: '@tree', id: 'l34b',
              blocks: [flag, { op: 'looks_nextbackdrop' }, say('guide.l50203.proc', 3)]
            }],
            run: 2800
          }
        }
      ])
    },

    /* ---------------------------------------------------------------- 22 · 質數與合數 */
    {
      id: '502-bp06',
      kind: 'lesson',
      icon: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h7"/>',
      steps: opening([
        { do: 'add_sprite', name: 'Wizard Girl', sprite: '@girl' },
        { do: 'add_sprite', name: 'Ben', sprite: '@boy' }
      ], 'Chalkboard').concat([
        {
          id: 't1',
          demo: {
            project: EMPTY, focus: '@girl',
            scripts: [{
              sprite: '@girl', id: 'l61',
              blocks: [flag, { op: 'sensing_askandwait', QUESTION: word('guide.l50206.ask') }]
            }],
            run: 2200
          }
        },
        {
          id: 't2',
          demo: {
            project: EMPTY, focus: '@boy',
            scripts: [{
              sprite: '@boy', id: 'l62',
              blocks: [flag, ifThen({ op: 'operator_gt', OPERAND1: { op: 'sensing_answer' }, OPERAND2: '1' },
                [say('guide.l50206.ok', 2)])]
            }],
            run: 2400
          }
        },
        {
          id: 't3',
          demo: {
            project: EMPTY, focus: '@boy',
            scripts: [{
              sprite: '@boy', id: 'l63',
              blocks: [flag, { op: 'looks_sayforsecs', MESSAGE: { op: 'operator_mod', NUM1: 7, NUM2: 2 }, SECS: 3 }]
            }],
            run: 2600
          }
        },
        {
          id: 't4',
          demo: {
            project: EMPTY, focus: '@boy',
            scripts: [{
              sprite: '@boy', id: 'l64',
              blocks: [flag,
                repeat(6, [
                  ifThen({ op: 'operator_equals', OPERAND1: { op: 'operator_mod', NUM1: 15, NUM2: 2 }, OPERAND2: 0 },
                    [say('guide.l50206.even', 1)]),
                  wait(0.6)
                ]),
                say('guide.l50206.proc', 2)]
            }],
            run: 3400
          }
        }
      ])
    },

    /* ---------------------------------------------------------------- 25 · 繩子算法 */
    {
      id: '502-bp09',
      kind: 'lesson',
      icon: '<path d="M3 8c4 0 4 8 8 8s4-8 8-8"/><path d="M3 16c4 0 4-8 8-8"/><path d="M21 8h-3"/><path d="M3 8h3"/>',
      steps: opening([
        { do: 'add_sprite', name: 'Wizard Girl', sprite: '@girl' },
        { do: 'add_sprite', name: 'Ball', sprite: '@ropeA' },
        { do: 'add_sprite', name: 'Balloon1', sprite: '@ropeB' }
      ], 'Room 1').concat([
        {
          id: 't1',
          demo: {
            project: EMPTY, focus: '@ropeA',
            scripts: [
              { sprite: '@ropeA', id: 'l91', blocks: [flag, { op: 'motion_gotoxy', X: -60, Y: 60 }, say('guide.l50209.a', 2)] },
              { sprite: '@ropeB', id: 'l92', blocks: [flag, { op: 'motion_gotoxy', X: -60, Y: 20 }, say('guide.l50209.b', 2)] }
            ],
            run: 2600
          }
        },
        {
          id: 't2',
          demo: {
            project: EMPTY, focus: '@girl',
            scripts: [{
              sprite: '@girl', id: 'l93',
              blocks: [flag, repeat(6, [
                { op: 'looks_sayforsecs', MESSAGE: { op: 'operator_mod', NUM1: 12, NUM2: 2 }, SECS: 0.6 }
              ])]
            }],
            run: 3200
          }
        },
        {
          id: 't3',
          demo: {
            project: EMPTY, focus: '@girl',
            scripts: [{
              sprite: '@girl', id: 'l94',
              blocks: [flag, wait(0.4),
                { op: 'looks_sayforsecs', MESSAGE: { op: 'operator_mod', NUM1: 18, NUM2: 12 }, SECS: 2 },
                { op: 'looks_sayforsecs', MESSAGE: { op: 'operator_mod', NUM1: 12, NUM2: 6 }, SECS: 2 }]
            }],
            run: 3200
          }
        },
        {
          id: 't4',
          demo: {
            project: EMPTY, focus: '@girl',
            scripts: [{ sprite: '@girl', id: 'l95', blocks: [flag, say('guide.l50209.answer', 3)] }],
            run: 2600
          }
        }
      ])
    }
  ];
}(typeof window !== 'undefined' ? window : this));
