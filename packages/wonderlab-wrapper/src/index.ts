/**
 * Wonder Lab Wrapper
 * Scratch 3 runtime wrapper for Wonder Lab AI programming
 *
 * Provides clean TypeScript interface to:
 * - Compile Wonder Lab program model to Scratch 3 JSON
 * - Future: Boot VM/renderer (TBD)
 * - Future: Trace execution (TBD)
 *
 * Part of Wonder Lab Studio modularization.
 */

export { compile, PEN_ZH } from './compiler.js';
export type {
  // Scratch 3 types
  Scratch3Project,
  Scratch3Block,
  BlockInput,
  PrimitiveValue,
  Target,
  Monitor,
  Costume,
  Sound,

  // Lesson types
  Lesson,
  LessonCostume,
  LessonSound,

  // Opcode spec types
  OpcodeSpec,
  OpcodeDef,
  InputType,
  FieldType,
} from './types.js';
