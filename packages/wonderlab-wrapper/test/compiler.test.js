/**
 * Wonder Lab Wrapper - Compiler Tests
 */

import { compile, PEN_ZH } from '../dist/index.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load test fixtures
const opcodes = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/lab_opcodes.json'), 'utf-8')
);

const lesson = {
  stage: {
    backdrops: [
      { assetId: 'stage1', name: '背景1', ext: 'svg', cx: 240, cy: 180 }
    ]
  },
  sprites: [
    {
      name: '貓',
      x: 0,
      y: 0,
      costumes: [
        { assetId: 'cat1', name: '造型1', ext: 'svg', cx: 48, cy: 50 }
      ]
    }
  ]
};

// Test 1: Empty program
console.log('Test 1: Empty program');
const empty = compile({ sprites: {}, stage: {} }, lesson, opcodes);
console.assert(empty.targets.length === 2, 'Should have stage + 1 sprite');
console.assert(empty.targets[0].isStage === true, 'First target is stage');
console.assert(empty.targets[1].name === '貓', 'Second target is sprite');
console.assert(empty.monitors.length === 0, 'No monitors');
console.assert(empty.extensions.length === 0, 'No extensions');
console.log('✓ Passed');

// Test 2: Simple green flag script
console.log('\nTest 2: Simple green flag script');
const simple = compile({
  sprites: {
    '貓': {
      scripts: {
        s1: [
          { op: 'event_whenflagclicked' },
          { op: 'motion_movesteps', STEPS: 10 }
        ]
      }
    }
  },
  stage: {}
}, lesson, opcodes);

const catBlocks = simple.targets[1].blocks;
const blockIds = Object.keys(catBlocks);
console.assert(blockIds.length === 2, `Should have 2 blocks, got ${blockIds.length}`);

const firstBlock = catBlocks[blockIds[0]];
console.assert(firstBlock.opcode === 'event_whenflagclicked', 'First is green flag');
console.assert(firstBlock.topLevel === true, 'First is top level');
console.assert(firstBlock.next !== null, 'First has next');

const secondBlock = catBlocks[firstBlock.next];
console.assert(secondBlock.opcode === 'motion_movesteps', 'Second is move');
console.assert(secondBlock.inputs.STEPS[0] === 1, 'Has shadow primitive');
console.assert(secondBlock.inputs.STEPS[1][1] === '10', 'Value is 10');
console.log('✓ Passed');

// Test 3: Forever loop with variable
console.log('\nTest 3: Forever loop with variable');
const loopProg = compile({
  sprites: {
    '貓': {
      scripts: {
        s1: [
          { op: 'event_whenflagclicked' },
          {
            op: 'control_forever',
            SUBSTACK: [
              { op: 'motion_changeyby', DY: { var: '分數' } }
            ]
          }
        ]
      }
    }
  },
  stage: {}
}, lesson, opcodes);

const vars = loopProg.targets[0].variables;
console.assert(Object.keys(vars).length === 1, 'Should have 1 variable');
const varId = Object.keys(vars)[0];
console.assert(vars[varId][0] === '分數', 'Variable name is 分數');

const loopBlocks = loopProg.targets[1].blocks;
const foreverBlock = Object.values(loopBlocks).find(b => b.opcode === 'control_forever');
console.assert(foreverBlock !== undefined, 'Has forever block');
console.assert(foreverBlock.inputs.SUBSTACK[0] === 2, 'Has substack');

const moveBlock = loopBlocks[foreverBlock.inputs.SUBSTACK[1]];
console.assert(moveBlock.opcode === 'motion_changeyby', 'Has move block in substack');
console.assert(moveBlock.inputs.DY[0] === 3, 'DY has variable with shadow');
console.assert(moveBlock.inputs.DY[1][0] === 12, 'DY uses variable primitive (12)');
console.assert(moveBlock.inputs.DY[1][1] === '分數', 'DY variable name');
console.log('✓ Passed');

// Test 4: Pen extension
console.log('\nTest 4: Pen extension');
const penProg = compile({
  sprites: {
    '貓': {
      scripts: {
        s1: [
          { op: 'event_whenflagclicked' },
          { op: 'pen_clear' },
          { op: 'pen_penDown' }
        ]
      }
    }
  },
  stage: {}
}, lesson, opcodes);

console.assert(penProg.extensions.includes('pen'), 'Pen extension included');
const penBlocks = penProg.targets[1].blocks;
const penClear = Object.values(penBlocks).find(b => b.opcode === 'pen_clear');
console.assert(penClear !== undefined, 'Has pen_clear block');
console.log('✓ Passed');

// Test 5: Menu with reporter override
console.log('\nTest 5: Menu with reporter override');
const menuProg = compile({
  sprites: {
    '貓': {
      scripts: {
        s1: [
          { op: 'event_whenflagclicked' },
          { op: 'motion_glidesecstoxy', SECS: 1, X: { op: 'sensing_mousex' }, Y: 0 }
        ]
      }
    }
  },
  stage: {}
}, lesson, opcodes);

const menuBlocks = menuProg.targets[1].blocks;
const glideBlock = Object.values(menuBlocks).find(b => b.opcode === 'motion_glidesecstoxy');
console.assert(glideBlock !== undefined, 'Has glide block');
console.assert(glideBlock.inputs.X[0] === 3, 'X has reporter with shadow');
const mouseXId = glideBlock.inputs.X[1];
console.assert(typeof mouseXId === 'string', 'X reporter is block ID');
const mouseXBlock = menuBlocks[mouseXId];
console.assert(mouseXBlock.opcode === 'sensing_mousex', 'Reporter is mouse x');
console.log('✓ Passed');

// Test 6: Monitors for variables
console.log('\nTest 6: Monitors for variables');
const monitorProg = compile({
  sprites: {
    '貓': {
      scripts: {
        s1: [
          { op: 'event_whenflagclicked' },
          { op: 'data_setvariableto', VARIABLE: '生命', VALUE: 3 },
          { op: 'data_changevariableby', VARIABLE: '分數', VALUE: 1 }
        ]
      }
    }
  },
  stage: {}
}, lesson, opcodes);

console.assert(monitorProg.monitors.length === 2, `Should have 2 monitors, got ${monitorProg.monitors.length}`);
const lifeMonitor = monitorProg.monitors.find(m => m.params.VARIABLE === '生命');
const scoreMonitor = monitorProg.monitors.find(m => m.params.VARIABLE === '分數');
console.assert(lifeMonitor !== undefined, 'Has life monitor');
console.assert(scoreMonitor !== undefined, 'Has score monitor');
console.assert(scoreMonitor.y > lifeMonitor.y, 'Monitors stacked vertically');
console.log('✓ Passed');

// Test 7: PEN_ZH localization
console.log('\nTest 7: PEN_ZH localization');
console.assert(PEN_ZH['pen.categoryName'] === '畫筆', 'Has Chinese pen name');
console.assert(PEN_ZH['pen.clear'] === '筆跡全部清除', 'Has Chinese clear command');
console.log('✓ Passed');

console.log('\n✅ All compiler tests passed!');
