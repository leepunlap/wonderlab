/*!
 * Wonder Lab — the lesson page's own model.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 only.
 *
 * A lesson definition in, a scratch-vm project out. Pure: no DOM, no VM, no network, which is why it
 * is asserted in Node (test/studio_lesson_project.mjs) rather than in a browser.
 *
 * WHY IT IS HERE and not in the shell: the shell mounts the editor and is handed a project. It must
 * never learn what a lesson is. This file is the lesson page's, and it is the only place that knows.
 *
 * MOVED VERBATIM from studio-lab.js when that skin was replaced by studio-app.js.
 */
(function (root) {
  'use strict';

function costume(c) {
    // Lesson costumes carry assetId + ext; library items and the blank costume behind 繪畫 carry
    // md5ext instead. Deriving md5ext from a missing assetId produced "undefined.undefined", and the
    // paint action then silently did nothing because its sprite could never be built.
    var id = c.assetId, ext = c.ext;
    if ((!id || !ext) && c.md5ext) {
      var i = String(c.md5ext).lastIndexOf('.');
      if (i > 0) { id = String(c.md5ext).slice(0, i); ext = String(c.md5ext).slice(i + 1); }
    }
    var o = { assetId: id, name: c.name, md5ext: id + '.' + ext, dataFormat: ext,
              rotationCenterX: c.cx, rotationCenterY: c.cy };
    if (ext !== 'svg') o.bitmapResolution = c.res || 1;
    return o;
  }

function sound(s) {
    return { name: s.name, assetId: s.assetId, md5ext: s.md5ext || (s.assetId + '.' + (s.ext || 'wav')),
             dataFormat: s.dataFormat || s.ext || 'wav', rate: s.rate || 0, sampleCount: s.sampleCount || 0,
             format: s.format || null };
  }

function soundsOf(t) { return ((t && t.sounds) || []).map(sound); }
  /** Which costume / backdrop the lesson opens on. Only an index the lesson actually has is honoured, so a typo
      keeps today's behaviour (the first one) instead of showing nothing at all. */
  function costumeIndex(t, list) {
    var i = Math.floor(+(t || {}).currentCostume), n = (list || []).length;
    return isFinite(i) && i > 0 && i < n ? i : 0;
  }

function costumeIndex(t, list) {
    var i = Math.floor(+(t || {}).currentCostume), n = (list || []).length;
    return isFinite(i) && i > 0 && i < n ? i : 0;
  }

function num(v, dflt) { var n = +(v); return (v == null || v === '' || !isFinite(n)) ? dflt : n; }
  var VIDEO_STATES = { on: 1, off: 1, 'on-flipped': 1 };
  function lessonProject(L) {
    var st = L.stage || {};
    var stage = { isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
      currentCostume: costumeIndex(st, st.backdrops), costumes: (st.backdrops || []).map(costume), sounds: soundsOf(st),
      volume: num(st.volume, 100), layerOrder: 0, tempo: num(st.tempo, 60), videoTransparency: 50,
      videoState: VIDEO_STATES[st.videoState] ? st.videoState : 'off', textToSpeechLanguage: null };
    var sprites = (L.sprites || []).map(function (s, i) {
      return { isStage: false, name: s.name, variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
        currentCostume: costumeIndex(s, s.costumes), costumes: (s.costumes || []).map(costume), sounds: soundsOf(s),
        volume: 100, layerOrder: i + 1, visible: s.visible !== false,
        x: s.x || 0, y: s.y || 0, size: s.size || 100, direction: s.direction == null ? 90 : s.direction, draggable: false,
        rotationStyle: s.rotationStyle || 'all around' };
    });
    return { targets: [stage].concat(sprites), monitors: [], extensions: [], meta: { semver: '3.0.0', vm: '15.2.0', agent: 'WonderLab' } };
  }

var VIDEO_STATES = { on: 1, off: 1, 'on-flipped': 1 };
  function lessonProject(L) {
    var st = L.stage || {};
    var stage = { isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
      currentCostume: costumeIndex(st, st.backdrops), costumes: (st.backdrops || []).map(costume), sounds: soundsOf(st),
      volume: num(st.volume, 100), layerOrder: 0, tempo: num(st.tempo, 60), videoTransparency: 50,
      videoState: VIDEO_STATES[st.videoState] ? st.videoState : 'off', textToSpeechLanguage: null };
    var sprites = (L.sprites || []).map(function (s, i) {
      return { isStage: false, name: s.name, variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
        currentCostume: costumeIndex(s, s.costumes), costumes: (s.costumes || []).map(costume), sounds: soundsOf(s),
        volume: 100, layerOrder: i + 1, visible: s.visible !== false,
        x: s.x || 0, y: s.y || 0, size: s.size || 100, direction: s.direction == null ? 90 : s.direction, draggable: false,
        rotationStyle: s.rotationStyle || 'all around' };
    });
    return { targets: [stage].concat(sprites), monitors: [], extensions: [], meta: { semver: '3.0.0', vm: '15.2.0', agent: 'WonderLab' } };
  }

function lessonProject(L) {
    var st = L.stage || {};
    var stage = { isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
      currentCostume: costumeIndex(st, st.backdrops), costumes: (st.backdrops || []).map(costume), sounds: soundsOf(st),
      volume: num(st.volume, 100), layerOrder: 0, tempo: num(st.tempo, 60), videoTransparency: 50,
      videoState: VIDEO_STATES[st.videoState] ? st.videoState : 'off', textToSpeechLanguage: null };
    var sprites = (L.sprites || []).map(function (s, i) {
      return { isStage: false, name: s.name, variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
        currentCostume: costumeIndex(s, s.costumes), costumes: (s.costumes || []).map(costume), sounds: soundsOf(s),
        volume: 100, layerOrder: i + 1, visible: s.visible !== false,
        x: s.x || 0, y: s.y || 0, size: s.size || 100, direction: s.direction == null ? 90 : s.direction, draggable: false,
        rotationStyle: s.rotationStyle || 'all around' };
    });
    return { targets: [stage].concat(sprites), monitors: [], extensions: [], meta: { semver: '3.0.0', vm: '15.2.0', agent: 'WonderLab' } };
  }

  root.LessonPage = { project: lessonProject, costumeIndex: costumeIndex,
                      soundsOf: soundsOf, num: num, costume: costume };
  // also reachable where the lesson skin used to put it, so the existing Node test can load this
  // file with no edit to the assertions
  root.WLStudio = root.WLStudio || {};
  root.WLStudio.lessonProject = lessonProject;
}(typeof window !== 'undefined' ? window : this));
