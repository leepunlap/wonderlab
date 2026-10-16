/*!
 * Wonder Lab — the registry: define(name, factory) / require(name, lab).
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 (see LICENSE).
 *
 * The lab is ONE classic script on purpose (a deployed L4 lesson page loads only assets/lab/lab.js and nothing about
 * that tag may change), so its module graph cannot be ES modules: tools/build.mjs concatenates these files, in a
 * fixed order, inside a single IIFE. This file is what makes that a graph instead of a pile:
 *
 *   WLR.define('ro', function (L, req) { …; return { boot: boot, turn: turn }; });
 *   var ro = WLR.require('ro', L);      // the same instance every time, for this lab
 *
 * `L` is the lab instance (src/lab-main.js create()): the two runtimes, the state they share and every module bound
 * to it. A module takes the collaborators it needs from `req()` at factory time and calls the others through `L` at
 * run time, so the files stay acyclic and nothing has to be declared twice.
 *
 * There is no window.* here and there must never be: test/check_bundle.mjs fails the build if a module assigns one
 * (the lab publishes exactly four globals, and they belong to the runtime and the host, not to this registry).
 *
 * ES5 on purpose: this ships inside the L4 bundle, which runs on every lesson page, also on old browsers that cannot
 * run the lab itself.
 */
var WLR = (function () {
  'use strict';
  var defs = {}, made = {};
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function define(name, factory) {
    if (typeof name !== 'string' || !name || typeof factory !== 'function') throw new Error('WLR.define: a name and a factory are required');
    if (own(defs, name)) throw new Error('WLR.define: ' + name + ' is already registered');
    defs[name] = factory;
  }
  function has(name) { return own(defs, name); }
  function names() { return Object.keys(defs); }

  function require(name, lab) {
    if (own(made, name)) return made[name];
    if (!has(name)) throw new Error('WLR.require: no module named ' + name);
    var m = defs[name](lab, function (n) { return require(n, lab); });
    if (!m || typeof m !== 'object') throw new Error('WLR.require: ' + name + ' returned nothing');
    made[name] = m;
    return m;
  }

  return { define: define, require: require, has: has, names: names };
}());
