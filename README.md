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
- **the page integration** (`src/lab-*.js`, `src/lab.css`): the 「課堂教材｜Wonder Lab」 toggle in the AI pane, the lab pane
  with run / stop / undo, an on-screen arrow pad for tablets, and the lab conversation. It is a module graph, not one
  file — see **Modules** below;
- **the Studio host** (`src/lab-host.js`): the one place that mounts the full editor — it resolves `manifest.json`
  (no-cache), builds the iframe from the content-hashed `studio-<hex>/` folder, waits for it to be ready, calls
  `WLStudio.boot()`, and carries the studio's events and the AI turn's transport. The lesson lab uses it, and so does
  the teachers' portal playground (`portals/teachers/index.html`). The build concatenates it into `dist/lab.js` — a
  lesson page still needs only its one `<script>` tag — and also emits it on its own as `dist/lab-host.js`, which is
  what the playground asks for first (it falls back to the `lab.js` bundle while a deploy does not carry it);
- **the whitelist** (`src/opcodes.json`): the block types the tutor may use, with their inputs, fields, menus and limits.
  The server validates every AI turn against the same file;
- **the standalone entry** (`src/standalone.js`, `src/standalone.css`): one tag on a page that is not a lesson page.

The AI service, its prompts, the lesson content (sprites, backdrops, lesson notes) and student data are separate
programs and data. They are not part of this repository.

## Modules

The lab is **one classic script** on every deployed L4 lesson page, and that tag may not change:

```html
<script src="../assets/lab/lab.js?v=…" defer></script>
```

So the module graph is resolved at build time, not at run time: `tools/build.mjs` concatenates the files below, in
this fixed order, inside a single IIFE. There is no loader and no new `window.*`; each module registers itself with
`WLR.define(name, factory)` (`src/lab-registry.js`) and takes the lab instance and its collaborators from there.

| file | owns |
| --- | --- |
| `src/lab-registry.js` | `define` / `require` — the only thing that makes the concatenation a graph |
| `src/lab-host.js` | the Studio mount: manifest → content-hashed `studio-<hex>/` frame → ready → `WLStudio.boot()`. Shared with the teachers' playground, which loads it alone as `dist/lab-host.js` |
| `src/lab-core.js` | primitives (`el`, `ic`, media queries, browser support) and every sentence the lab says |
| `src/lab-page.js` | the parent-page DOM contract (`#chat[data-ep]`, `.chhead`, `#chbody`, `#chform`, `#chin`, `#chsend`, `#chcaps`, `.chfab`, `.chclose`, `.lessonbar`, `main.wrap`) — and the shell it can build for a page that has none |
| `src/lab-api.js` | the one transport (the host's `send`) and this page's reading of a reply |
| `src/lab-chat.js` | the lab conversation (`#wlbody`), its chips, and the capture-phase form wiring |
| `src/lab-ui.js` | the toggle, the note, the lab pane's markup, the toolbar status line, drawer / zoom geometry |
| `src/lab-ro.js` | the read-only runtime: engine prefetch and boot, empty state, arrow pad, run / stop / undo, one turn |
| `src/lab-studio.js` | everything the lab knows about the full editor: may it open, its prefetch and pane, the two sub-modes, one turn with it, 上一步 |
| `src/lab-mode.js` | the lab's session: the lab GET, the material / Wonder Lab switch, caps, sessionStorage, the wrap-up |
| `src/lab-main.js` | the composer: page contract → manifest → the wiring order (`setup()`); decides nothing itself |
| `src/lab-entry.js` | the lesson entry: `WLLab.boot()` |
| `src/standalone.js` | the standalone entry: its own container + shell, then the same composer and manifest |

`test/check_bundle.mjs` reads the module list back out of `tools/build.mjs` and fails if a module reaches for a
global, if a cross-module call names something a module does not export, if a second POST transport appears in the
bundle, or if one module grows back past 400 lines. It needs no browser.

## Standalone: the lab on a page that is not a lesson page

`dist/lab.js` is deliberately inert anywhere but an L4 lesson page (no `#chat`, or `data-ep` outside
`/(^|\/)L4\/lessons\//`) — the teachers' playground relies on that. `dist/lab-standalone.js` is the other entry:

```html
<script src="…/lab-standalone.js" data-wl-base="…" data-wl-lesson="demo" data-wl-gate="open" defer></script>
```

It builds its own container and the page contract (linking `lab-standalone.css` for the chrome a lesson site
supplies), reads `<base>/manifest.json`, mounts the Studio through the same host when the manifest names a
`studio-<hex>/` **and** a lesson data file, and falls back to the read-only runtime otherwise — including when the
studio folder is not deployed. `examples/standalone/index.html` is that page.

Options (the lesson bundle reads the same `data-wl-*` attributes off its own tag):

| attribute | meaning | default |
| --- | --- | --- |
| `data-wl-mount` | `lesson` (only L4 lesson pages) or `always` | `lesson` |
| `data-wl-lesson` | the lesson id the lab APIs are addressed with | the page's `#chat[data-ep]` |
| `data-wl-base` | the folder holding `manifest.json`, `lab.css` and the engine | the script's own folder |
| `data-wl-manifest` | the manifest itself | `<base>manifest.json` |
| `data-wl-container` | where the standalone entry builds its shell | a new `div` on `<body>` |
| `data-wl-lab-api`, `data-wl-status-api` | `/api/ai/lab/` and `/api/ai/status/` | the same paths on this origin |
| `data-wl-gate` | `service` (the lab GET decides) or `open` (the manifest decides) | `service` |
| `data-wl-start` | `lab` or `material` | whatever this page was left in |

## `manifest.json`

`test/check_bundle.mjs`'s sibling reader is `src/lab-host.js` (and now `src/lab-main.js`): nothing else in this
repository reads the manifest, and the file itself is written by the lesson-site deployer
(`src/iits-lessons-build/build_wonder_lab.py`), which is a different repository. `manifest.example.json` in this
repository's root is the shape; the fields mean:

| field | meaning |
| --- | --- |
| `version` | the engine's content hash; the deployer's check compares it |
| `engine` | `engine-<hash>/` — immutable, holds the engine bundles, `opcodes.json` and `media/` |
| `scripts` | the engine files to load, in order, from `engine/`. The lab prefetches them and counts them in the loading line |
| `css` | the lab's own stylesheet, versioned (`lab.css?v=…`). The toggle stays hidden until it has loaded |
| `lab` | `lab.js?v=…` — informational: the page's tag already carries it |
| `assets` | the lesson-art folder, `a/` by default, resolved against the manifest's folder |
| `source` | the AGPL corresponding-source page, linked from the lab footprint; `SOURCE.html` by default |
| `studio` | **optional**: `studio-<hex>/`, the content-hashed editor folder. Its absence is what makes a page use the read-only runtime. The host refuses any value that is not `studio-<hex>` — a manifest must not be able to name an arbitrary path for the frame |
| `studio_page` | **optional**: the page inside that folder; `lab-frame.html` by default |
| `lessons` | `{ "<slug>": { "status": "ready" \| "soon" \| "hw", "data": "<slug>.json?v=…" } }`. `ready` is the only status that gets a lab; `hw` says the lesson needs the UC-Mind board; `data` is the lesson file the runtime and the editor boot from. A lesson with no `data` cannot open the editor (an SB3 project needs at least one stage costume) and falls back to the read-only runtime |

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
4. writes `dist/engine-<hash>/` (immutable), `dist/lab.js` (the module graph, wrapped: see **Modules**),
   `dist/lab-standalone.js` + `dist/lab-standalone.css`, `dist/lab-host.js`, `dist/lab.css`, `dist/engine.json`,
   licences and `.gz` copies.
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
npm run test:static     # node test/check_bundle.mjs - no browser: the bundle's invariants (see Modules)
npm run test:lab        # node test/browser_test_labhost.mjs - Chrome over CDP, no dependencies: both surfaces that
                        # mount the Studio do it through src/lab-host.js
npm run test:standalone # node test/browser_test_standalone.mjs - a page with no #chat at all mounts the lab
python3 test/run_tests.py   # playwright + Chrome: every whitelisted opcode loads and renders; the demo program runs
```

`test:static` needs only `npm run build`. The two browser suites need Chrome and a classfiles tree with a
`studio-<hash>/` folder (`LABDEV_CLASSFILES=…`). Nothing is written outside the temp dir; the classfiles tree is
only read.

* `test/browser_test_labhost.mjs` — modes: `lesson` | `lab-ro` | `playground` | `bad-studio`;
  `LABDEV_RO=1` makes the lab GET answer `studio:false`, `LABDEV_BADSTUDIO=1` makes the manifest name a folder that
  is not deployed, `LABDEV_NOHOSTJS=1` hides `lab-host.js` (the bundle must carry it), `LABDEV_W`/`LABDEV_H` set the
  viewport.
* `test/browser_test_standalone.mjs` — modes: `readonly` | `studio` | `nolesson`.
* `python3 test/run_tests.py` needs Playwright for Python, which is **not installed in this checkout**: it has not
  been run here. Say so rather than implying otherwise.

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
