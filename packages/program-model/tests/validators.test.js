/**
 * Tests for @wonderlab/program-model
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  EMPTY_PROGRAM,
  countBlocks,
  getDepth,
  validateProgram,
  validateOperation,
  applyOperations,
  LIMITS,
} from '../dist/index.js';

test('EMPTY_PROGRAM has correct structure', () => {
  assert.deepStrictEqual(EMPTY_PROGRAM, {
    sprites: {},
    stage: { scripts: {} },
  });
});

test('countBlocks counts simple script', () => {
  const blocks = [
    { op: 'event_whenflagclicked' },
    { op: 'motion_movesteps', STEPS: 10 },
  ];
  assert.strictEqual(countBlocks(blocks), 2);
});

test('countBlocks counts nested blocks', () => {
  const blocks = [
    {
      op: 'control_forever',
      SUBSTACK: [
        { op: 'motion_movesteps', STEPS: 10 },
        { op: 'looks_say', MESSAGE: 'hello' },
      ],
    },
  ];
  assert.strictEqual(countBlocks(blocks), 3); // forever + 2 inside
});

test('getDepth measures nesting', () => {
  const blocks = [
    { op: 'event_whenflagclicked' },
    {
      op: 'control_forever',
      SUBSTACK: [
        {
          op: 'control_if',
          CONDITION: { op: 'sensing_touchingobject', TOUCHINGOBJECTMENU: 'edge' },
          SUBSTACK: [{ op: 'motion_turnright', DEGREES: 15 }],
        },
      ],
    },
  ];
  // Depth: event=1, forever=2, if=3 (condition is inline, turnright is also 3)
  assert.strictEqual(getDepth(blocks), 3);
});

test('validateProgram accepts valid program', () => {
  const program = {
    sprites: {
      '小貓': {
        scripts: {
          s1: [
            { op: 'event_whenflagclicked' },
            { op: 'motion_movesteps', STEPS: 10 },
          ],
        },
      },
    },
    stage: { scripts: {} },
  };

  const ctx = validateProgram(program);
  assert.strictEqual(ctx.hasErrors(), false);
});

test('validateProgram rejects too many blocks per script', () => {
  const blocks = [];
  for (let i = 0; i < LIMITS.blocks_per_script + 1; i++) {
    blocks.push({ op: 'motion_movesteps', STEPS: 10 });
  }

  const program = {
    sprites: { '小貓': { scripts: { s1: blocks } } },
    stage: { scripts: {} },
  };

  const ctx = validateProgram(program);
  assert.strictEqual(ctx.hasErrors(), true);
  assert.ok(ctx.getErrors().some(e => e.includes('blocks')));
});

test('validateProgram rejects too many scripts per sprite', () => {
  const scripts = {};
  for (let i = 0; i < LIMITS.scripts_per_sprite + 1; i++) {
    scripts[`s${i}`] = [{ op: 'event_whenflagclicked' }];
  }

  const program = {
    sprites: { '小貓': { scripts } },
    stage: { scripts: {} },
  };

  const ctx = validateProgram(program);
  assert.strictEqual(ctx.hasErrors(), true);
  assert.ok(ctx.getErrors().some(e => e.includes('scripts')));
});

test('validateOperation accepts valid set_script', () => {
  const op = {
    do: 'set_script',
    sprite: '小貓',
    id: 's1',
    blocks: [{ op: 'event_whenflagclicked' }],
  };

  const errors = validateOperation(op);
  assert.strictEqual(errors.length, 0);
});

test('validateOperation rejects invalid script id', () => {
  const op = {
    do: 'set_script',
    sprite: '小貓',
    id: 'invalid/id/with/slashes',
    blocks: [{ op: 'event_whenflagclicked' }],
  };

  const errors = validateOperation(op);
  assert.ok(errors.some(e => e.includes('script id')));
});

test('validateOperation accepts valid delete_script', () => {
  const op = {
    do: 'delete_script',
    sprite: '小貓',
    id: 's1',
  };

  const errors = validateOperation(op);
  assert.strictEqual(errors.length, 0);
});

test('applyOperations applies set_script', () => {
  const program = {
    sprites: { '小貓': { scripts: {} } },
    stage: { scripts: {} },
  };

  const ops = [
    {
      do: 'set_script',
      sprite: '小貓',
      id: 's1',
      blocks: [{ op: 'event_whenflagclicked' }],
    },
  ];

  const { program: newProgram, applied, errors } = applyOperations(program, ops);

  assert.strictEqual(errors.length, 0);
  assert.strictEqual(applied.length, 1);
  assert.ok(newProgram.sprites['小貓'].scripts.s1);
  assert.strictEqual(applied[0].n, 1); // block count added
});

test('applyOperations applies delete_script', () => {
  const program = {
    sprites: {
      '小貓': {
        scripts: {
          s1: [{ op: 'event_whenflagclicked' }],
        },
      },
    },
    stage: { scripts: {} },
  };

  const ops = [
    {
      do: 'delete_script',
      sprite: '小貓',
      id: 's1',
    },
  ];

  const { program: newProgram, applied, errors } = applyOperations(program, ops);

  assert.strictEqual(errors.length, 0);
  assert.strictEqual(applied.length, 1);
  assert.strictEqual(newProgram.sprites['小貓'].scripts.s1, undefined);
});

test('applyOperations is immutable', () => {
  const program = {
    sprites: { '小貓': { scripts: {} } },
    stage: { scripts: {} },
  };

  const ops = [
    {
      do: 'set_script',
      sprite: '小貓',
      id: 's1',
      blocks: [{ op: 'event_whenflagclicked' }],
    },
  ];

  const { program: newProgram } = applyOperations(program, ops);

  // Original unchanged
  assert.strictEqual(Object.keys(program.sprites['小貓'].scripts).length, 0);
  // New has the script
  assert.strictEqual(Object.keys(newProgram.sprites['小貓'].scripts).length, 1);
});

test('applyOperations rejects operations exceeding limits', () => {
  const program = {
    sprites: { '小貓': { scripts: {} } },
    stage: { scripts: {} },
  };

  // Add max scripts
  for (let i = 0; i < LIMITS.scripts_per_sprite; i++) {
    program.sprites['小貓'].scripts[`s${i}`] = [{ op: 'event_whenflagclicked' }];
  }

  // Try to add one more
  const ops = [
    {
      do: 'set_script',
      sprite: '小貓',
      id: 's99',
      blocks: [{ op: 'event_whenflagclicked' }],
    },
  ];

  const { applied, errors } = applyOperations(program, ops);

  assert.strictEqual(applied.length, 0);
  assert.ok(errors.some(e => e.includes('already has')));
});
