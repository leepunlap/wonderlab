/**
 * Validation utilities for Wonder Lab Studio program model
 */

import type { Program, Block, Script, Operation } from './types.js';

/**
 * Validation limits (should match lab_opcodes.json)
 */
export const LIMITS = {
  blocks_per_script: 50,
  scripts_per_sprite: 6,
  blocks_total: 200,
  depth: 8,
  vars: 12,
  lists: 3,
  broadcasts: 8,
  text_len: 80,
  num_abs_max: 9999,
  wait_max: 60,
  repeat_max: 999,
} as const;

/**
 * Validation context for accumulating errors
 */
export class ValidationContext {
  errors: string[] = [];
  blockCount = 0;
  depth = 0;
  vars = new Set<string>();
  lists = new Set<string>();
  broadcasts = new Set<string>();

  err(message: string): void {
    this.errors.push(message);
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  getErrors(): string[] {
    return [...this.errors];
  }
}

/**
 * Count blocks in a script (recursive)
 */
export function countBlocks(blocks: Block[]): number {
  let count = 0;
  for (const block of blocks) {
    count++;
    if (block.SUBSTACK) count += countBlocks(block.SUBSTACK);
    if (block.SUBSTACK2) count += countBlocks(block.SUBSTACK2);
    if (block.CONDITION && typeof block.CONDITION === 'object') {
      count += countBlocks([block.CONDITION]);
    }
  }
  return count;
}

/**
 * Get max nesting depth in a script
 */
export function getDepth(blocks: Block[], currentDepth = 0): number {
  let maxDepth = currentDepth;
  for (const block of blocks) {
    const d = currentDepth + 1;
    maxDepth = Math.max(maxDepth, d);
    if (block.SUBSTACK) {
      maxDepth = Math.max(maxDepth, getDepth(block.SUBSTACK, d));
    }
    if (block.SUBSTACK2) {
      maxDepth = Math.max(maxDepth, getDepth(block.SUBSTACK2, d));
    }
    if (block.CONDITION && typeof block.CONDITION === 'object') {
      maxDepth = Math.max(maxDepth, getDepth([block.CONDITION], d));
    }
  }
  return maxDepth;
}

/**
 * Extract variable references from a block tree
 */
export function extractVars(blocks: Block[]): Set<string> {
  const vars = new Set<string>();

  function walk(block: Block) {
    for (const [key, value] of Object.entries(block)) {
      if (key === 'op') continue;

      if (value && typeof value === 'object') {
        if ('var' in value && typeof value.var === 'string') {
          vars.add(value.var);
        } else if ('list' in value && typeof value.list === 'string') {
          // Lists tracked separately
        } else if (Array.isArray(value)) {
          value.forEach(walk);
        } else if ('op' in value) {
          walk(value as Block);
        }
      }
    }

    if (block.SUBSTACK) block.SUBSTACK.forEach(walk);
    if (block.SUBSTACK2) block.SUBSTACK2.forEach(walk);
    if (block.CONDITION && typeof block.CONDITION === 'object') {
      walk(block.CONDITION);
    }
  }

  blocks.forEach(walk);
  return vars;
}

/**
 * Extract list references from a block tree
 */
export function extractLists(blocks: Block[]): Set<string> {
  const lists = new Set<string>();

  function walk(block: Block) {
    for (const [key, value] of Object.entries(block)) {
      if (key === 'op') continue;

      if (value && typeof value === 'object') {
        if ('list' in value && typeof value.list === 'string') {
          lists.add(value.list);
        } else if (Array.isArray(value)) {
          value.forEach(walk);
        } else if ('op' in value) {
          walk(value as Block);
        }
      }
    }

    if (block.SUBSTACK) block.SUBSTACK.forEach(walk);
    if (block.SUBSTACK2) block.SUBSTACK2.forEach(walk);
    if (block.CONDITION && typeof block.CONDITION === 'object') {
      walk(block.CONDITION);
    }
  }

  blocks.forEach(walk);
  return lists;
}

/**
 * Validate a script
 */
export function validateScript(
  script: Script,
  ctx: ValidationContext
): boolean {
  if (!Array.isArray(script)) {
    ctx.err('Script must be an array');
    return false;
  }

  const blockCount = countBlocks(script);
  if (blockCount > LIMITS.blocks_per_script) {
    ctx.err(
      `Script has ${blockCount} blocks, max ${LIMITS.blocks_per_script}`
    );
    return false;
  }

  const depth = getDepth(script);
  if (depth > LIMITS.depth) {
    ctx.err(`Script depth ${depth} exceeds max ${LIMITS.depth}`);
    return false;
  }

  ctx.blockCount += blockCount;

  // Extract refs
  extractVars(script).forEach(v => ctx.vars.add(v));
  extractLists(script).forEach(l => ctx.lists.add(l));

  return !ctx.hasErrors();
}

/**
 * Validate a program
 */
export function validateProgram(program: Program): ValidationContext {
  const ctx = new ValidationContext();

  if (!program || typeof program !== 'object') {
    ctx.err('Program must be an object');
    return ctx;
  }

  if (!program.sprites || typeof program.sprites !== 'object') {
    ctx.err('Program.sprites must be an object');
    return ctx;
  }

  if (!program.stage || typeof program.stage !== 'object') {
    ctx.err('Program.stage must be an object');
    return ctx;
  }

  // Validate stage
  if (program.stage.scripts) {
    const scriptCount = Object.keys(program.stage.scripts).length;
    if (scriptCount > LIMITS.scripts_per_sprite) {
      ctx.err(
        `Stage has ${scriptCount} scripts, max ${LIMITS.scripts_per_sprite}`
      );
    }

    for (const [sid, script] of Object.entries(program.stage.scripts)) {
      if (!validateScript(script, ctx)) {
        ctx.err(`Stage script ${sid} is invalid`);
      }
    }
  }

  // Validate sprites
  for (const [spriteName, sprite] of Object.entries(program.sprites)) {
    if (!sprite || typeof sprite !== 'object') {
      ctx.err(`Sprite ${spriteName} must be an object`);
      continue;
    }

    if (!sprite.scripts || typeof sprite.scripts !== 'object') {
      ctx.err(`Sprite ${spriteName}.scripts must be an object`);
      continue;
    }

    const scriptCount = Object.keys(sprite.scripts).length;
    if (scriptCount > LIMITS.scripts_per_sprite) {
      ctx.err(
        `Sprite ${spriteName} has ${scriptCount} scripts, max ${LIMITS.scripts_per_sprite}`
      );
    }

    for (const [sid, script] of Object.entries(sprite.scripts)) {
      if (!validateScript(script, ctx)) {
        ctx.err(`Sprite ${spriteName} script ${sid} is invalid`);
      }
    }
  }

  // Check totals
  if (ctx.blockCount > LIMITS.blocks_total) {
    ctx.err(
      `Total blocks ${ctx.blockCount} exceeds ${LIMITS.blocks_total}`
    );
  }

  if (ctx.vars.size > LIMITS.vars) {
    ctx.err(`Total vars ${ctx.vars.size} exceeds ${LIMITS.vars}`);
  }

  if (ctx.lists.size > LIMITS.lists) {
    ctx.err(`Total lists ${ctx.lists.size} exceeds ${LIMITS.lists}`);
  }

  return ctx;
}

/**
 * Validate an operation
 */
export function validateOperation(op: Operation): string[] {
  const errors: string[] = [];

  if (!op || typeof op !== 'object') {
    errors.push('Operation must be an object');
    return errors;
  }

  if (op.do !== 'set_script' && op.do !== 'delete_script') {
    errors.push(`Invalid operation type: ${op.do}`);
  }

  if (!op.sprite || typeof op.sprite !== 'string') {
    errors.push('Operation must have sprite name');
  }

  if (!op.id || typeof op.id !== 'string') {
    errors.push('Operation must have script id');
  }

  // Validate script ID format (alphanumeric + dash, max 12 chars)
  if (op.id && !/^[\w-]{1,12}$/.test(op.id)) {
    errors.push(`Invalid script id: ${op.id}`);
  }

  if (op.do === 'set_script') {
    if (!op.blocks || !Array.isArray(op.blocks)) {
      errors.push('set_script must have blocks array');
    } else {
      const ctx = new ValidationContext();
      validateScript(op.blocks, ctx);
      errors.push(...ctx.getErrors());
    }
  }

  return errors;
}

/**
 * Apply operations to a program (immutable)
 */
export function applyOperations(
  program: Program,
  ops: Operation[]
): { program: Program; applied: Operation[]; errors: string[] } {
  const errors: string[] = [];
  const applied: Operation[] = [];
  let newProgram = JSON.parse(JSON.stringify(program)) as Program;

  for (const op of ops) {
    const opErrors = validateOperation(op);
    if (opErrors.length > 0) {
      errors.push(...opErrors);
      continue;
    }

    const target =
      op.sprite === '舞台' ? newProgram.stage : newProgram.sprites[op.sprite];

    if (!target) {
      errors.push(`Sprite not found: ${op.sprite}`);
      continue;
    }

    if (op.do === 'set_script') {
      // Check script limit
      const scriptCount = Object.keys(target.scripts).length;
      if (!(op.id in target.scripts) && scriptCount >= LIMITS.scripts_per_sprite) {
        errors.push(
          `Cannot add script ${op.id}: ${op.sprite} already has ${scriptCount} scripts`
        );
        continue;
      }

      target.scripts[op.id] = op.blocks!;
      applied.push({ ...op, n: countBlocks(op.blocks!) });
    } else if (op.do === 'delete_script') {
      if (op.id in target.scripts) {
        delete target.scripts[op.id];
        applied.push(op);
      }
    }
  }

  // Validate final program
  const ctx = validateProgram(newProgram);
  if (ctx.hasErrors()) {
    errors.push(...ctx.getErrors());
    return { program, applied: [], errors };
  }

  return { program: newProgram, applied, errors };
}
