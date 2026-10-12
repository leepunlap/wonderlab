# Notices

**Wonder Lab** front-end. Copyright (C) 2026 IITS (工信學堂（香港）).
Licensed under the **GNU Affero General Public License v3.0 only** (`LICENSE`).

Wonder Lab is **not affiliated with, sponsored by or endorsed by** the Scratch Foundation, the
Massachusetts Institute of Technology (MIT) or the Raspberry Pi Foundation. "Scratch", the Scratch
logo, the Scratch Cat, Gobo, Pico, Nano, Tera and Giga are trademarks of their owners. This project
does not use them.

## Third-party software in the built page

| Component | Version | Licence | Source |
|---|---|---|---|
| @scratch/scratch-vm | 15.2.0 | AGPL-3.0-only | https://github.com/scratchfoundation/scratch-editor (npm `@scratch/scratch-vm`) |
| @scratch/scratch-render | 15.2.0 | AGPL-3.0-only | same monorepo (npm `@scratch/scratch-render`) |
| @scratch/scratch-storage | 15.2.0 | AGPL-3.0-only | same monorepo (npm `@scratch/scratch-storage`) |
| scratch-blocks | 2.1.19 | Apache-2.0 | https://github.com/scratchfoundation/scratch-blocks |
| Blockly (bundled into scratch-blocks.js) | 12.x | Apache-2.0 | https://github.com/RaspberryPiFoundation/blockly |
| @blockly/continuous-toolbox, @blockly/field-colour | see package-lock.json | Apache-2.0 | https://github.com/google/blockly-samples |
| Lucide icons (inline SVG paths in lab.js) | — | ISC | https://lucide.dev |
| scratch-l10n (the zh-tw pen-extension strings copied into wonderlab.js, `PEN_ZH`) | 6.1.130 | AGPL-3.0-only | https://github.com/scratchfoundation/scratch-l10n (`editor/extensions/zh-tw.json`) |
| scratch-audio (bundled into `scratch-audio.js` from its `src/`, exposing `window.ScratchAudio`) | 2.0.268 | AGPL-3.0-only | https://github.com/scratchfoundation/scratch-audio |
| startaudiocontext (bundled into `scratch-audio.js`) | 1.2.1 | MIT | https://github.com/tambien/StartAudioContext |
| audio-context, minilog, events (bundled into `scratch-audio.js`) | see package-lock.json | MIT | npm |

**Why `scratch-audio.js` exists (added 2026-10-09, IITS).** `scratch-audio` is a dependency of
`@scratch/scratch-vm` but it is **not** inside the published `dist/web` VM bundle: the host application
supplies the audio engine (scratch-gui calls `vm.attachAudioEngine(new AudioEngine())`). Without it
`runtime.audioEngine` is null, `loadSound()` resolves with the sound still unloaded, and every 播放音效
block is silent. `tools/build.mjs` therefore bundles `scratch-audio`'s `src/index.js` with esbuild into
`scratch-audio.js`, unmodified apart from minification and the bundling of its own dependencies (its
packaged `dist.js` leaves `minilog`, `startaudiocontext` and `audio-context` as `require()` externals that
a browser cannot resolve). `wonderlab.js` attaches the engine and a per-target sound bank, and
`engine.json`'s `scripts` list loads `scratch-audio.js` before `wonderlab.js`.

**Sounds are the lesson's own.** The audio files are synthesised by `_art_src/make_sounds.py` in the lesson
data (`wonder_lab/_sounds/`) — no Scratch-library media and no third-party samples are shipped. They are
16-bit mono PCM WAV, content-hashed into the lesson's `assets/lab/a/` by `build_wonder_lab.py` exactly like
costumes.

**Changes to the upstream AGPL bundles** (made 2026-10-07, IITS). At build time `tools/build.mjs` makes
one change to each of the prebuilt `dist/web` bundles. It replaces webpack's fixed public path `"/"` with
the folder of the loading script, so the code-split chunks load from the same folder. Each changed bundle
starts with the line `/*! Modified by IITS 2026-10-07: webpack publicPath set to the loading script's
folder (tools/build.mjs). AGPL-3.0-only. */`, and the upstream `<bundle>.LICENSE.txt` that its header
refers to is shipped next to it and in `LICENSES/`.

The exact upstream tarballs are fetched with `npm pack` into `vendor/`. They are listed in
`vendor/SHA512SUMS`, and the service that runs Wonder Lab mirrors them next to the built page.

**Lucide icons:** ISC License. Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022
as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.
Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee
is hereby granted, provided that the above copyright notice and this permission notice appear in all
copies.
