# Notices

**Wonder Lab Studio** (prototype). Copyright (C) 2026 IITS (工信學堂（香港）).
Licensed under the **GNU Affero General Public License v3.0 only** (`LICENSE`).

Wonder Lab Studio is **not affiliated with, sponsored by or endorsed by** the Scratch Foundation, the
Massachusetts Institute of Technology (MIT) or the Raspberry Pi Foundation. "Scratch", the Scratch logo, the Scratch
Cat, Gobo, Pico, Nano, Tera and Giga are trademarks of their owners. This page does not show them (see README,
"Trademark items").

The page a student sees carries the same notice in Traditional Chinese: `src/NOTICE.html` (served at `/NOTICE.html`),
with the AGPL source offer `/source.tar.gz` (our files + `package-lock.json`, which pins the exact upstream tarballs).

## Third-party software served to the browser

| Component | Version | Licence | Source |
|---|---|---|---|
| @scratch/scratch-gui (standalone build, served **unmodified** from the npm tarball) | 15.2.0 | AGPL-3.0-only | https://github.com/scratchfoundation/scratch-editor, gitHead `970132883d63286762783448d4d487dcefedabf8`; npm `@scratch/scratch-gui@15.2.0` (`sha512-ZjKknkK6…Pg==`, see package-lock.json) |
| @scratch/scratch-vm, -render, -storage, -paint, -svg-renderer (inside the bundle) | 15.2.0 | AGPL-3.0-only | same monorepo |
| scratch-blocks (inside the bundle; on Blockly 12) | 2.1.19 | Apache-2.0 | https://github.com/scratchfoundation/scratch-blocks |
| scratch-l10n (UI strings) | 6.1.118 | AGPL-3.0-only | https://github.com/scratchfoundation/scratch-l10n |
| scratch-audio | 2.0.268 | AGPL-3.0-only | https://github.com/scratchfoundation/scratch-audio |
| scratch-render-fonts | 1.0.252 | Apache-2.0 (fonts: SIL OFL 1.1) | https://github.com/scratchfoundation/scratch-render-fonts |
| React 18, Redux 4, TensorFlow.js 4.22, MediaPipe face detection, JSZip, … (inside the bundle) | see list | MIT / Apache-2.0 / … | `dist/scratch-gui-standalone.js.LICENSE.txt` (served at `/scratch-gui-standalone.js.LICENSE.txt`) |
| Lucide icons: arrow-up, bot, download, undo-2, x, pencil (inline SVG / `src/assets/icon-paint.svg`) | lucide-static 1.52.0 | ISC | https://lucide.dev |
| `server/lab_core.py`, `server/lab_opcodes.json` = `src/opcodes.json` | copied 2026-10-07 from ycltesthk-portals/lesson-ai and wonderlab-src | AGPL-3.0-only (IITS) | — |

**Changes to upstream:** none to the served upstream files. All changes happen at run time in our own files:
`src/studio-pre.js` (editor width media queries, JS and CSS), `src/studio.js` (default project, strings, logo, hidden
library / extension / tutorial entry points, chat, versions), `src/studio-ops.js` and `src/studio-trace.js`.

**Lucide icons:** ISC License. Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather
(MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022. Permission to use, copy, modify, and/or
distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright
notice and this permission notice appear in all copies.
