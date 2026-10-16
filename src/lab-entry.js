/*!
 * Wonder Lab — the lesson entry point: one call.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 (see LICENSE).
 *
 * This file exists so that the lesson bundle and the standalone bundle differ in exactly one visible place, and so
 * that neither has to guess which one it is:
 *
 *   dist/lab.js             the modules + lab-main.js + THIS      -> an L4 lesson page, one <script> tag
 *   dist/lab-standalone.js  the modules + lab-main.js + standalone.js -> a page that asks for a lab
 *
 * WLLab.boot() reads the options from this script's own tag, and on a page that is not a lesson page it does
 * nothing at all (no #chat, or data-ep outside the lesson path — see src/lab-main.js). ES5 on purpose.
 */
WLLab.boot();
