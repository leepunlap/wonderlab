/**
 * @wonderlab/program-model
 *
 * Shared types and validation for Wonder Lab Studio program model.
 * This is the canonical schema used by all components (frontend, server, AI).
 */

/**
 * Block input value types
 */
export type BlockInputValue =
  | number
  | string
  | boolean
  | null
  | { var: string }
  | { list: string }
  | { broadcast: string }
  | Block;

/**
 * Block field value (typically enums or references)
 */
export type BlockFieldValue = string | { var: string } | { list: string };

/**
 * A single block in a script
 */
export interface Block {
  /** Opcode from lab_opcodes.json */
  op: string;

  /** Input fields (UPPERCASE keys) */
  [key: string]: BlockInputValue | BlockFieldValue | Block[] | undefined;

  /** Substacks for control structures */
  SUBSTACK?: Block[];
  SUBSTACK2?: Block[];

  /** Condition for if/until blocks */
  CONDITION?: Block;
}

/**
 * A script is an array of blocks
 */
export type Script = Block[];

/**
 * Scripts are keyed by script ID (e.g., "s1", "s2")
 */
export interface Scripts {
  [scriptId: string]: Script;
}

/**
 * A sprite's program content
 */
export interface SpriteProgram {
  scripts: Scripts;
}

/**
 * Complete program model
 */
export interface Program {
  sprites: {
    [spriteName: string]: SpriteProgram;
  };
  stage: SpriteProgram;
}

/**
 * Empty program template
 */
export const EMPTY_PROGRAM: Program = {
  sprites: {},
  stage: { scripts: {} }
};

/**
 * Operation types
 */
export type OpType = "set_script" | "delete_script";

/**
 * A program modification operation
 */
export interface Operation {
  do: OpType;
  sprite: string;
  id: string;
  blocks?: Block[];
  /** Block count (added by server after validation) */
  n?: number;
}

/**
 * Sprite execution trace
 */
export interface SpriteTrace {
  start: [number, number] | null;
  end: [number, number] | null;
  x_range?: [number, number];
  y_range?: [number, number];
  dir?: number;
  size?: number;
  visible_at_end?: boolean;
  was_hidden?: boolean;
  reached_edge?: boolean;
  said?: string[];
  touched?: Record<string, string>;
  touched_colors?: Record<string, string>;
  costume?: string;
  costume_changes?: number;
  max_clones?: number;
  moves?: number;
  pen_moves?: number;
}

/**
 * Execution run report
 */
export interface RunReport {
  secs: number;
  still_running: boolean;
  ended_by_itself?: boolean;
  hat_wait?: boolean;
  keys?: string[];
  answers?: string[];
  backdrop?: string;
  sprites: Record<string, SpriteTrace>;
  vars: Record<string, number | string | boolean>;
  lists: Record<string, { length: number; first: any[] }>;
}

/**
 * Studio-specific data (full editor mode)
 */
export interface StudioData {
  targets: any[];
  editing?: string;
  hand_edits?: Array<{
    sprite: string;
    id: string;
    change: "added" | "changed" | "removed";
  }>;
  unsupported?: string[];
  text?: Record<string, Record<string, string>>;
  focus?: string;
}

/**
 * Lab turn request
 */
export interface LabTurnRequest {
  text: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  program: Program;
  run?: RunReport;
  note?: string;
  signals?: { runs: number; stops: number; undo: number };
  device?: "touch" | "mouse";
  mode?: "ai" | "self";
  kind?: "review" | "consol";
  studio?: StudioData;
}

/**
 * Lab turn response
 */
export interface LabTurnResponse {
  ok: boolean;
  say?: string;
  question?: string;
  ops?: Operation[];
  errors?: string[];
  program?: Program;
  focus?: string | Array<{ sprite: string; id: string }>;
  mode?: "ai" | "self";
  intent?: "build" | "observe" | "ask" | "stuck" | "agree";
  left?: number;
  in_class?: boolean;
  masked?: boolean;
  ms?: number;
  checks?: string[];
  source?: "stub" | "deepseek";
}

/**
 * Lab state (GET response)
 */
export interface LabState {
  ok: boolean;
  program?: Program | null;
  studio?: boolean;
  modes?: string[];
  consol?: {
    state: "pending" | "off" | "step1" | "step2";
    pending?: boolean;
  };
}

/**
 * Lab status (caps check)
 */
export interface LabStatus {
  ok: boolean;
  open: boolean;
  left?: number;
  max_chars?: number;
  reason?: string;
}
