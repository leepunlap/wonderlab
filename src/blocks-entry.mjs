// esbuild entry: scratch-blocks 2.x (ESM, on Blockly 12) -> one IIFE exposing window.ScratchBlocks
// Copyright (C) 2026 IITS. AGPL-3.0 (see LICENSE). scratch-blocks and Blockly are Apache-2.0.
import * as SB from 'scratch-blocks';
import { ScratchMsgs as M2 } from '../node_modules/scratch-blocks/msg/scratch_msgs.js';
const M = (SB.ScratchMsgs && SB.ScratchMsgs.locales && SB.ScratchMsgs.locales['zh-tw']) ? SB.ScratchMsgs : M2;
window.ScratchBlocks = Object.assign({}, SB, { ScratchMsgs: M });
