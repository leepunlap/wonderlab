/**
 * Wonder Lab Wrapper - Types
 * Extracted from wonderlab.js for modularization
 */

import type { Program, Block } from '@wonderlab/program-model';

/**
 * Scratch 3 project.json format
 */
export interface Scratch3Project {
  targets: Target[];
  monitors: Monitor[];
  extensions: string[];
  meta: {
    semver: string;
    vm: string;
    agent: string;
  };
}

export interface Target {
  isStage: boolean;
  name: string;
  variables: Record<string, [string, number | string]>;
  lists: Record<string, [string, Array<number | string>]>;
  broadcasts: Record<string, string>;
  blocks: Record<string, Scratch3Block>;
  comments: Record<string, any>;
  currentCostume: number;
  costumes: Costume[];
  sounds: Sound[];
  volume: number;
  layerOrder: number;

  // Sprite-specific (isStage === false)
  visible?: boolean;
  x?: number;
  y?: number;
  size?: number;
  direction?: number;
  draggable?: boolean;
  rotationStyle?: 'all around' | 'left-right' | "don't rotate";

  // Stage-specific (isStage === true)
  tempo?: number;
  videoTransparency?: number;
  videoState?: 'on' | 'off' | 'on-flipped';
  textToSpeechLanguage?: string | null;
}

export interface Scratch3Block {
  opcode: string;
  next: string | null;
  parent: string | null;
  inputs: Record<string, BlockInput>;
  fields: Record<string, [string, string | null]>;
  shadow: boolean;
  topLevel: boolean;
  x?: number;
  y?: number;
  mutation?: {
    tagName: string;
    children: any[];
    hasnext?: string;
  };
}

export type BlockInput =
  | [1, string | PrimitiveValue]                // Shadow primitive or shadow block ID
  | [2, string]                                   // Block ID (no shadow)
  | [3, string | PrimitiveValue, string | PrimitiveValue]; // Block/var/list + shadow

export type PrimitiveValue =
  | [4, string]   // num
  | [5, string]   // pos
  | [6, string]   // whole
  | [7, string]   // int
  | [8, string]   // angle
  | [9, string]   // color
  | [10, string]  // text
  | [11, string, string]  // broadcast (name, id)
  | [12, string, string]  // variable (name, id)
  | [13, string, string]; // list (name, id)

export interface Costume {
  assetId: string;
  name: string;
  md5ext: string;
  dataFormat: string;
  rotationCenterX: number;
  rotationCenterY: number;
  bitmapResolution?: number;
}

export interface Sound {
  name: string;
  assetId: string;
  md5ext: string;
  dataFormat: string;
  rate: number;
  sampleCount: number;
  format?: string | null;
}

export interface Monitor {
  id: string;
  mode: 'default' | 'large' | 'slider' | 'list';
  opcode: string;
  params: Record<string, string>;
  spriteName: string | null;
  value: number | string | any[];
  width: number;
  height: number;
  x: number;
  y: number;
  visible: boolean;
  sliderMin?: number;
  sliderMax?: number;
  isDiscrete?: boolean;
}

/**
 * Lesson manifest format (from build_wonder_lab.py)
 */
export interface Lesson {
  stage: {
    backdrops: LessonCostume[];
    sounds?: LessonSound[];
  };
  sprites: Array<{
    name: string;
    costumes: LessonCostume[];
    sounds?: LessonSound[];
    visible?: boolean;
    x?: number;
    y?: number;
    size?: number;
    direction?: number;
    rotationStyle?: 'all around' | 'left-right' | "don't rotate";
  }>;
}

export interface LessonCostume {
  assetId: string;
  name: string;
  ext: string;
  cx: number;
  cy: number;
  res?: number;
}

export interface LessonSound {
  name: string;
  assetId: string;
  md5ext?: string;
  ext?: string;
  dataFormat?: string;
  rate?: number;
  sampleCount?: number;
  format?: string | null;
}

/**
 * Opcode spec format (from opcodes.json)
 */
export interface OpcodeSpec {
  opcodes: Record<string, OpcodeDef>;
}

export interface OpcodeDef {
  inputs?: Record<string, InputType>;
  fields?: Record<string, FieldType>;
  ext?: string; // Extension name (e.g., "pen")
}

export type InputType =
  | 'stack'
  | 'bool'
  | 'broadcast'
  | 'num'
  | 'pos'
  | 'whole'
  | 'int'
  | 'angle'
  | 'color'
  | 'text'
  | `menu:${string}:${string}:${string}`; // menu:<opcode>:<field>:<default_key>

export type FieldType =
  | 'var'
  | 'list'
  | 'broadcast'
  | 'key'
  | string[]  // Enum values
  | string;   // Fixed field
