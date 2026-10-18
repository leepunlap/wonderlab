/**
 * Wonder Lab Wrapper - Scratch 3 Compiler
 * Compiles compact AI-editable program model into full Scratch 3 project.json
 *
 * Extracted from wonderlab.js (lines 43-153)
 */

import type { Program, Block } from '@wonderlab/program-model';
import type {
  Scratch3Project,
  Scratch3Block,
  BlockInput,
  PrimitiveValue,
  Lesson,
  OpcodeSpec,
  Target,
  Monitor,
  Costume,
  Sound,
} from './types.js';

const PRIM = { num: 4, pos: 5, whole: 6, int: 7, angle: 8, color: 9, text: 10 };

const MENU_DEFAULT: Record<string, string> = {
  obj_rm: '_random_',
  obj_m: '_mouse_',
  obj_me: '_edge_',
  clone: '_myself_',
  key: 'space',
  color_param: 'color',
};

// Pen extension messages (from scratch-l10n 6.1.130 zh-tw, AGPL-3.0-only)
export const PEN_ZH = {
  'pen.categoryName': '畫筆',
  'pen.clear': '筆跡全部清除',
  'pen.stamp': '蓋章',
  'pen.penDown': '下筆',
  'pen.penUp': '停筆',
  'pen.setColor': '筆跡顏色設為 [COLOR]',
  'pen.changeColorParam': '筆跡 [COLOR_PARAM] 改變 [VALUE]',
  'pen.setColorParam': '筆跡 [COLOR_PARAM] 設為 [VALUE]',
  'pen.changeSize': '筆跡寬度改變 [SIZE]',
  'pen.setSize': '筆跡寬度設為 [SIZE]',
  'pen.colorMenu.color': '顏色',
  'pen.colorMenu.saturation': '彩度',
  'pen.colorMenu.brightness': '亮度',
  'pen.colorMenu.transparency': '透明度',
  'pen.changeHue': '筆跡顏色改變 [HUE]',
  'pen.setHue': '筆跡顏色設為 [HUE]',
  'pen.changeShade': '筆跡亮度改變 [SHADE]',
  'pen.setShade': '筆跡亮度設為 [SHADE]',
};

/**
 * Compile Wonder Lab program model to Scratch 3 project JSON
 */
export function compile(
  program: Program,
  lesson: Lesson,
  spec: OpcodeSpec
): Scratch3Project {
  const opcodes = spec.opcodes;
  let blockIdCounter = 0;

  // Shared ID maps
  const vars: Record<string, [string, number]> = {};
  const lists: Record<string, [string, any[]]> = {};
  const bcasts: Record<string, string> = {};
  const exts: Record<string, 1> = {};

  function nid(prefix = 'b'): string {
    blockIdCounter += 1;
    return prefix + blockIdCounter.toString(36);
  }

  function idFor(
    map: Record<string, any>,
    prefix: string,
    name: string
  ): string {
    // Check if already exists
    for (const k in map) {
      const val = Array.isArray(map[k]) ? map[k][0] : map[k];
      if (val === name) return k;
    }

    // Create new
    const id = prefix + Object.keys(map).length;
    if (prefix === 'm') {
      map[id] = name; // Broadcast
    } else if (prefix === 'l') {
      map[id] = [name, []]; // List
    } else {
      map[id] = [name, 0]; // Variable
    }
    return id;
  }

  function block(
    b: Block,
    parent: string | null,
    T: Record<string, Scratch3Block>
  ): string {
    const def = opcodes[b.op];
    if (!def) {
      throw new Error(`unknown opcode ${b.op}`);
    }

    if (def.ext) {
      exts[def.ext] = 1;
    }

    const id = nid();
    const blk: Scratch3Block = {
      opcode: b.op,
      next: null,
      parent,
      inputs: {},
      fields: {},
      shadow: false,
      topLevel: false,
    };
    T[id] = blk;

    // Process inputs
    Object.keys(def.inputs || {}).forEach((name) => {
      const type = def.inputs![name];
      const v = (b as any)[name];

      if (type === 'stack') {
        if (Array.isArray(v) && v.length > 0) {
          blk.inputs[name] = [2, stack(v, id, T)];
        }
        return;
      }

      if (type === 'bool') {
        if (v && typeof v === 'object' && 'op' in v) {
          blk.inputs[name] = [2, block(v, id, T)];
        }
        return;
      }

      if (type === 'broadcast') {
        const nm = String(v ?? 'message1');
        blk.inputs[name] = [1, [11, nm, idFor(bcasts, 'm', nm)] as PrimitiveValue];
        return;
      }

      if (type.startsWith('menu:')) {
        const parts = type.split(':');
        const [, menuOpcode, fieldName, defaultKey] = parts;
        const mid = nid('m');

        let mv = MENU_DEFAULT[defaultKey] || '';

        if (v == null || typeof v === 'object') {
          if (defaultKey === 'costume') {
            mv = lesson.sprites[0]?.costumes[0]?.name || '';
          } else if (defaultKey === 'backdrop') {
            mv = lesson.stage.backdrops[0]?.name || '';
          }
        } else {
          mv = String(v);
        }

        // Create shadow menu block
        T[mid] = {
          opcode: menuOpcode,
          next: null,
          parent: id,
          inputs: {},
          fields: { [fieldName]: [mv, null] },
          shadow: true,
          topLevel: false,
        };

        // Handle reporter override
        if (v && typeof v === 'object' && 'op' in v) {
          blk.inputs[name] = [3, block(v, id, T), mid];
        } else if (v && typeof v === 'object' && 'var' in v) {
          const varName = String(v.var);
          blk.inputs[name] = [3, [12, varName, idFor(vars, 'v', varName)], mid];
        } else {
          blk.inputs[name] = [1, mid];
        }
        return;
      }

      // Primitive input
      const code = (PRIM as any)[type] as 4 | 5 | 6 | 7 | 8 | 9 | 10;
      const dflt = type === 'color' ? '#000000' : type === 'text' ? '' : '0';
      const shadowPrim: PrimitiveValue = [code, dflt];

      if (v && typeof v === 'object') {
        if ('var' in v) {
          const varName = String(v.var);
          blk.inputs[name] = [3, [12, varName, idFor(vars, 'v', varName)] as PrimitiveValue, shadowPrim];
        } else if ('list' in v) {
          const listName = String(v.list);
          blk.inputs[name] = [3, [13, listName, idFor(lists, 'l', listName)] as PrimitiveValue, shadowPrim];
        } else if ('op' in v) {
          blk.inputs[name] = [3, block(v, id, T), shadowPrim];
        } else {
          blk.inputs[name] = [1, shadowPrim];
        }
      } else {
        blk.inputs[name] = [1, [code, String(v ?? dflt)] as PrimitiveValue];
      }
    });

    // Process fields
    Object.keys(def.fields || {}).forEach((name) => {
      const ft = def.fields![name];
      const v = (b as any)[name];

      if (ft === 'var') {
        const varName = String(v);
        blk.fields[name] = [varName, idFor(vars, 'v', varName)];
      } else if (ft === 'list') {
        const listName = String(v);
        blk.fields[name] = [listName, idFor(lists, 'l', listName)];
      } else if (ft === 'broadcast') {
        const bcastName = String(v);
        blk.fields[name] = [bcastName, idFor(bcasts, 'm', bcastName)];
      } else {
        const defaultVal = Array.isArray(ft) ? ft[0] : ft === 'key' ? 'space' : '';
        blk.fields[name] = [String(v ?? defaultVal), null];
      }
    });

    // Special: control_stop mutation
    if (b.op === 'control_stop') {
      blk.mutation = {
        tagName: 'mutation',
        children: [],
        hasnext: (b as any).STOP_OPTION === 'other scripts in sprite' ? 'true' : 'false',
      };
    }

    return id;
  }

  function stack(
    arr: Block[],
    parent: string | null,
    T: Record<string, Scratch3Block>
  ): string {
    let first: string | null = null;
    let prev: string | null = null;

    (arr || []).forEach((b) => {
      const id = block(b, prev || parent, T);
      if (prev) {
        T[prev].next = id;
      } else {
        first = id;
      }
      prev = id;
    });

    return first!;
  }

  function scripts(scr: Record<string, Block[]> | undefined): Record<string, Scratch3Block> {
    const T: Record<string, Scratch3Block> = {};
    let y = 20;

    Object.keys(scr || {}).forEach((sid) => {
      const first = stack(scr![sid], null, T);
      if (!first) return;

      T[first].topLevel = true;
      T[first].x = 20;
      T[first].y = y;

      // Estimate height based on block count
      y += 60 + 40 * JSON.stringify(scr![sid]).split('"op"').length;
    });

    return T;
  }

  function costumeToScratch(c: typeof lesson.sprites[0]['costumes'][0]): Costume {
    const o: Costume = {
      assetId: c.assetId,
      name: c.name,
      md5ext: c.assetId + '.' + c.ext,
      dataFormat: c.ext,
      rotationCenterX: c.cx,
      rotationCenterY: c.cy,
    };
    if (c.ext !== 'svg') {
      o.bitmapResolution = c.res || 1;
    }
    return o;
  }

  function soundToScratch(c: any): Sound {
    return {
      name: c.name,
      assetId: c.assetId,
      md5ext: c.md5ext || (c.assetId + '.' + (c.ext || 'wav')),
      dataFormat: c.dataFormat || c.ext || 'wav',
      rate: c.rate || 0,
      sampleCount: c.sampleCount || 0,
      format: c.format || null,
    };
  }

  function soundsOf(t: any): Sound[] {
    return ((t && t.sounds) || []).map(soundToScratch);
  }

  // Build stage
  const stageBlocks = scripts(program.stage?.scripts);

  const stage: Target = {
    isStage: true,
    name: 'Stage',
    variables: vars,
    lists: lists,
    broadcasts: bcasts,
    blocks: stageBlocks,
    comments: {},
    currentCostume: 0,
    costumes: lesson.stage.backdrops.map(costumeToScratch),
    sounds: soundsOf(lesson.stage),
    volume: 100,
    layerOrder: 0,
    tempo: 60,
    videoTransparency: 50,
    videoState: 'off',
    textToSpeechLanguage: null,
  };

  // Build sprites
  const sprites: Target[] = lesson.sprites.map((s, i) => {
    const p = program.sprites?.[s.name] || { scripts: {} };
    return {
      isStage: false,
      name: s.name,
      variables: {},
      lists: {},
      broadcasts: {},
      blocks: scripts(p.scripts),
      comments: {},
      currentCostume: 0,
      costumes: s.costumes.map(costumeToScratch),
      sounds: soundsOf(s),
      volume: 100,
      layerOrder: i + 1,
      visible: s.visible !== false,
      x: s.x || 0,
      y: s.y || 0,
      size: s.size || 100,
      direction: s.direction ?? 90,
      draggable: false,
      rotationStyle: s.rotationStyle || 'all around',
    };
  });

  // Build monitors (one per stage variable/list)
  const monitors: Monitor[] = [];
  let my = 5;

  Object.keys(vars).forEach((id) => {
    monitors.push({
      id,
      mode: 'default',
      opcode: 'data_variable',
      params: { VARIABLE: vars[id][0] },
      spriteName: null,
      value: 0,
      width: 0,
      height: 0,
      x: 5,
      y: my,
      visible: true,
      sliderMin: 0,
      sliderMax: 100,
      isDiscrete: true,
    });
    my += 27;
  });

  Object.keys(lists).forEach((id) => {
    monitors.push({
      id,
      mode: 'list',
      opcode: 'data_listcontents',
      params: { LIST: lists[id][0] },
      spriteName: null,
      value: [],
      width: 0,
      height: 0,
      x: 5,
      y: my,
      visible: true,
    });
    my += 27;
  });

  return {
    targets: [stage, ...sprites],
    monitors,
    extensions: Object.keys(exts),
    meta: {
      semver: '3.0.0',
      vm: '0.2.0',
      agent: 'WonderLab',
    },
  };
}
