# Wonder Lab (front-end)

Wonder Lab is the vibe-coding mode of the IITS (工信學堂（香港）) lesson pages for secondary students (L4, G7–G9).

The student describes an idea in words. An AI tutor turns that idea, **mistakes included**, into a block program. The
student runs it on a stage, sees what happens, and the tutor asks a question that helps the student notice and fix the
problem (productive failure). The tutor never hands over the solution.

This repository is the **browser part** that runs on the lesson page:

- **the runtime** (`src/wonderlab.js`): compiles the program model to a Scratch-3-format `project.json`, runs it in the VM
  on a stage, shows it as read-only blocks (Traditional Chinese), and records a short "run report" for the tutor;
- **the audio engine** (`src/audio-entry.mjs` -> `dist/engine-<hash>/scratch-audio.js`): `scratch-audio` 2.0.268, which the
  upstream `scratch-vm` web bundle does not include — the host has to attach it, or 播放音效 is silent;
- **the page integration** (`src/lab.js`, `src/lab.css`): the 「課堂教材｜Wonder Lab」 toggle in the AI pane, the lab pane
  with run / stop / undo, an on-screen arrow pad for tablets, and the lab conversation;
- **the Studio host** (`src/lab-host.js`): the one place that mounts the full editor — it resolves `manifest.json`
  (no-cache), builds the iframe from the content-hashed `studio-<hex>/` folder, waits for it to be ready, calls
  `WLStudio.boot()`, and carries the studio's events and the AI turn's transport. The lesson lab uses it, and so does
  the teachers' portal playground (`portals/teachers/index.html`). The build concatenates it into `dist/lab.js` — a
  lesson page still needs only its one `<script>` tag — and also emits it on its own as `dist/lab-host.js`, which is
  what the playground asks for first (it falls back to the `lab.js` bundle while a deploy does not carry it);
- **the whitelist** (`src/opcodes.json`): the block types the tutor may use, with their inputs, fields, menus and limits.
  The server validates every AI turn against the same file.

The AI service, its prompts, the lesson content (sprites, backdrops, lesson notes) and student data are separate
programs and data. They are not part of this repository.

## Licence

**GNU Affero General Public License v3.0 only.** See `LICENSE` and `NOTICE.md`.

The built page combines this code with `@scratch/scratch-vm`, `@scratch/scratch-render` and `@scratch/scratch-storage`
15.2.0 (AGPL-3.0-only), plus `scratch-blocks` 2.1.19 and Blockly (Apache-2.0).

Wonder Lab is not affiliated with, sponsored by or endorsed by the Scratch Foundation, MIT or the Raspberry Pi
Foundation. It does not use their names, logos or characters.

## Build

```bash
npm ci            # scratch-blocks 2.1.19 (+ Blockly) and esbuild, pinned in package-lock.json
npm run build     # -> dist/
```

`tools/build.mjs`:
1. fetches the exact upstream tarballs with `npm pack` into `vendor/` (listed in `vendor/SHA512SUMS`);
2. takes their prebuilt `dist/web` bundles. Its only change to them replaces webpack's fixed public path `"/"` with the
   folder of the loading script, so the code-split chunks load next to it;
3. bundles scratch-blocks into one IIFE with esbuild (`src/blocks-entry.mjs`);
4. writes `dist/engine-<hash>/` (immutable), `dist/lab.js` (`src/lab-host.js` + `src/lab.js`), `dist/lab-host.js`,
   `dist/lab.css`, `dist/engine.json`, licences and `.gz` copies.
   Each patched bundle starts with a one-line notice of the change, and its upstream `<bundle>.LICENSE.txt` is copied next
   to it and into `LICENSES/`.

The site copies `dist/` to `<lesson site>/L4/assets/lab/` and adds a `manifest.json`. The manifest lists each lesson's
status (`ready`, `soon`, `hw`), its stage file and the asset folder. A lesson page then needs only:

```html
<script src="../assets/lab/lab.js?v=…" defer></script>
```

## Try the runtime without the AI

```bash
npm run build && python3 -m http.server 8000
# open http://localhost:8000/examples/demo/  (paste a program, 執行 / 停止)
```

## Tests

```bash
python3 test/run_tests.py     # Playwright + Chrome: every whitelisted opcode loads and renders; the demo program runs
node test/browser_test_labhost.mjs   # Chrome over CDP, no dependencies: both surfaces mount the Studio through
                              # src/lab-host.js. Needs `npm run build` and a classfiles tree with a studio-<hash>/
                              # folder (LABDEV_CLASSFILES=…); modes: lesson | lab-ro | playground | bad-studio
```

## The program model and the AI protocol

The tutor never sends a whole project. Each turn the server receives `{text, history, program, run}` and returns
`{say, question, ops, program}`.

An op replaces one whole script, `{"do": "set_script", "sprite": "…", "id": "s1", "blocks": [...]}`, or deletes one.
A block uses real Scratch 3 opcodes and input names, for example:

```json
{"op": "control_repeat", "TIMES": 10, "SUBSTACK": [{"op": "motion_turnright", "DEGREES": 36}]}
```

The server merges the validated ops into the program; the browser only compiles and runs it. With the student's next
message the browser sends a short run report: where each sprite went, what it said, which sprites and lesson colours it
touched (and when), the keys pressed, variables and lists, and whether the program waits for a key or a click. Extensions that call
outside services (text-to-speech, translate, music, video) are never allowed. Only `pen` is.
