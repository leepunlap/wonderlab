# Porting the lesson lab onto the shell

**Status: all 16 gaps are closed.** This file started as a measured gap list; it is kept as the
record of what the port actually required, because the next person will assume what I did.

The shell (`studio-app.js`) boots the editor, the AI turn, the animation, the UC-Make blocks
and the controller connection, and every one of those is switchable. What is *not* yet true is
the last clause of the architecture: that production becomes a configuration swap. It becomes
one when the gaps below are closed — and only then.

## What the shell already has

| the lesson skin | the shell |
|---|---|
| `S.boot` | `S.boot` |
| `S.vm`, `S.ready`, `S.trace` | `S.vm`, `S.ready`, `S.trace` |
| `S.workspace`, `S.root`, `S.blocks` | `S.workspace` |
| `S.apply` | `S.applyReply` / `S.applyInstant` (with the animate hook) |
| `S.setAnim` | `cfg.animate` and `?animate=0` |
| `S.ucmakeBlocks` | `S.ucmakeBlocks` |
| `S.controller` + the connect flow | `S.connect` / `S.disconnect` / `S.listPorts` |
| `S.program` | `S.snapshot` / `S.context` |
| the version history | `S.versions` / `S.recordVersion` / `S.restoreVersion` / `S.exportVersions` |
| the locale + DOM patches | `studio-core.js` |
| `S.place` | `core.place` |

## What is missing, and what each one costs

Five behaviours exist only in `studio-lab.js`. Each is a real feature, not a rename.

**1 · ~~The asset library~~ — DONE.** Ported, and the local server now serves `/lab-library/`
(`WL_LIBRARY`), which it never did — so the library had never been testable at 8920 at all.
Verified: 340 sprites, 85 backdrops, a sprite added and a backdrop switched.
The original note, kept because the failure mode it describes is why `reportMissingLibAssets`
is worth its length:: the AI cannot build a sprite that is not
already on the stage without it. It is not a one-liner — `library.json` is fetched and cached,
entries are looked up by name, and `md5parts` converts an `md5ext` into `assetId`/`dataFormat`
for the VM. It also carries `reportMissingLibAssets`, which HEADs each asset first because the
VM swallows a failed costume fetch and builds the target anyway with a placeholder: a 404
costume comes back as a valid PNG with different bytes, the import resolves, and the student
gets a blank costume with no message. That verification is worth keeping, not porting around.

**2 · The edit lock — `S.lock`, `S.isLocked`.**
While an AI turn is in flight the student's hand edits are held back. The shell has `applying`
for its own bookkeeping but exposes nothing, so a lesson page cannot ask.

**3 · ~~Session state~~ — DONE.** Ported with the asset carrying it needs. Verified: 2 -> 3 targets, 5 assets carried, restored.

The original note:
Serialize and restore the editor's state across a reload. The lesson page uses it; the
prototype does not, which is why it was never missed at 8920.

**4 · Trace passthroughs — `S.report`, `S.ran`, `S.sig`, `S.turnDone`, `S.diff`.**
Thin wrappers, but the lesson page calls them directly. Trivial to add; listed so the count is
honest.

**5 · VM control — `S.stop`, `S.running`.**
Stop all threads; is anything running. Small.

**Not a gap: `lessonProject`.** It translates a lesson definition into project JSON and is
covered by `test/studio_lesson_project.mjs`. It belongs to the lesson page, not the shell — the
shell should not know what a lesson is. Keep it where the lesson is.

## The order I would do it in

1. **Trace passthroughs and VM control** — an hour, no design decisions.
2. **The edit lock** — small, and the lesson page depends on it for correctness.
3. **The library** — the real work. Port `reportMissingLibAssets` with it, or the failure mode
   it exists to catch comes back silently.
4. **Session state** — last, because it is the least understood and the least exercised.

Then `lab-frame.html` loads `studio-app.js` with `library: false`, the lesson api and its
callbacks, and `studio-lab.js` is deleted. Only after that is production a configuration swap.

## The check that proves it

`test/module_matrix.py` already proves no helper is load-bearing at 8920. The equivalent for
the lesson surface is a second matrix over `lab-frame.html`: every switch, plus a lesson load
and one AI turn, asserting the editor comes up each time. It should be written **before** the
port, so the port has something to fail against rather than something to be judged by eye.

## What the shell must not grow

Two temptations, both wrong:

- **Teaching the shell about lessons.** `lessonProject`, the lab GET, the caps, the wrap-up and
  the wording of a failure are the lesson page's. The shell takes configuration and callbacks;
  it should never learn what a lesson is.
- **Making a helper load-bearing again.** The matrix exists because `trace.onRun` was unguarded
  and turned `?trace=0` into a dead editor. Any addition must keep the matrix green.

## The playground is a second package, not the lesson shell

The teachers' portal used to mount `lab-frame.html` — the **lesson** shell — and call it a
playground, handing it a throwaway lesson. Everything that makes the standalone page a teaching
surface (the 指南 tab, `studio-guide*.js` and its 示範 driver, the voice, the chat pane, the model
pill) lives in `src/index.html` and was never part of that build, so the portal's playground had no
tutorial at all. The work existed; the mount did not.

Two packages now come out of this repo, and they are not interchangeable:

| command | page | what it is |
|---|---|---|
| `npm run build` | `dist/studio-<hex>/lab-frame.html` | the lesson shell: mounted inside an L4 lesson by `lab.js` |
| `npm run build:playground` | `dist-playground/playground-<hex>/index.html` | the standalone playground, mounted by the teachers' portal in an iframe |

Deployment: copy `playground-<hex>/` next to the other lab folders
(`classfiles/L4/lessons/assets/lab/`) and add `"playground": "playground-<hex>/"` to
`assets/lab/manifest.json` (plus its `.gz`). The portal reads that key exactly as it reads
`"studio"`; nothing in the portal knows a path. Production nginx must treat
`playground-<hex>/` as immutable, the same one-year rule the `studio-` folders already get.

The endpoint is not compiled in. The page reads `?api=` and falls back to `/api/ai/lab/studio`
(the development server). The portal passes `?api=/api/ai/lab/playground`, because a playground
turn and a lesson turn are different routes in the same service.

Keep the previous `playground-<hex>/` for one deploy: a tab left open in a classroom still asks
for the folder it booted from.
