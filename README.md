# Wonder Lab Studio

Full Scratch editor integration for Wonder Lab.

Based on [Scratch](https://scratch.mit.edu/) by MIT Media Lab.

## License

AGPL-3.0-only

This is a derivative work of Scratch GUI (AGPL-3.0). See NOTICE for details.

## What's Included

- Scratch GUI fork
- Dual mode support (AI builds / Student builds)
- Teaching assistant interface
- Test server for local development
- Integration tests

## What's NOT Included

- AI teaching logic (imports from separate iits-repo)
- Lesson content (proprietary)
- Pedagogy guards (proprietary)

## Build

```bash
npm install
npm run build
# Output: dist/studio-<hash>/
```

## Test Server

```bash
# Prototype server (uses iits-repo pedagogy)
python3 server/studio_server.py --port 8920
```

**Note**: Requires `iits-repo` in parallel directory for pedagogy import.

## Production Deployment

Production uses:
- This repo for UI (Scratch GUI)
- Separate backend service for pedagogy (not in this repo)
- Nginx to serve static files

## Testing

```bash
cd test
python3 e2e.py              # End-to-end tests
python3 dual_e2e.py         # Dual mode tests
python3 module_matrix.py    # Module isolation

npm run check:guide         # The guide's topics, opcodes and words line up
```

`check:guide` reads `src/studio-guide-topics.js` as data and checks it against the
rest of the repo before any browser is involved: unique topic/step ids, every
opcode present in the editor's block list, every `@sprite` and every `{ k: ... }`
word resolvable, every `focus` pointing at a region the driver knows, and the
three locale files carrying the same key set. Editing a topic is the common way
to break the guide, and this catches it without a page load.

Two pages exist for looking at the pane by hand: `src/_i18n-check.html` walks the
shell in all three languages and ends with `ALL PASS`, `src/_i18n-layout.html`
measures the header for overflow and clipping.

## The guide's voice

The help tab narrates a step and shows the line it is speaking over the stage.
The audio is baked ahead of time, not fetched from a speech service:

```bash
pip install edge-tts
npm run build:voice           # -> src/assets/voice/*.mp3 + manifest.json
```

Baked files are the only form that survives a school network with no outside
access, and the static production deploy has no application server to proxy a
speech call anyway. Re-running is cheap and idempotent: each clip is named after
a hash of voice + text, unchanged lines are kept, and `VOICE_JOBS` sets how many
synthesise at once. `EDGE_TTS` overrides the binary if it is not on `PATH`.

Voices, per language: `zh-HK-HiuMaanNeural` (Cantonese — the copy is Hong Kong
Chinese, so a Mandarin voice would be reading a translation), `zh-CN-XiaoxiaoNeural`,
`en-GB-SoniaNeural`, all at `-5%` for a teaching pace.

Each clip carries its own cue track, generated from Edge's word timings, so the
subtitle is the timing the voice actually used rather than an estimate. A line
with no clip — a step edited but not rebuilt, a language added in a hurry — is
read by the browser instead, preferring an Edge natural voice; with no voice at
all, the cues still run on a timer. Subtitles never depend on the audio working.

`src/studio-guide-voice.js` owns the playback and the strip; the guide only says
which keys to speak, and the speaker button in its header is a mute that is
remembered across reloads.

## Attribution

Based on Scratch, developed by the Lifelong Kindergarten Group at the MIT Media Lab. See https://scratch.mit.edu
