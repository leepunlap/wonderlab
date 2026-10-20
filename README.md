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
npm run check:pace          # Every step can be shown before the voice moves on
npm run check               # both of the above
```

`check:guide` reads `src/studio-guide-topics.js` as data and checks it against the
rest of the repo before any browser is involved: unique topic/step ids, every
opcode present in the editor's block list, every `@sprite` and every `{ k: ... }`
word resolvable, every `focus` pointing at a region the driver knows, every mark
using one of the three shapes and an anchor that exists, and the three locale
files carrying the same key set. Editing a topic is the common way to break the
guide, and this catches it without a page load.

`check:pace` is covered under [Timing](#timing) below.

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
`en-GB-SoniaNeural`. `-5%` is the teaching pace they are baked at; a line whose
step needs longer is baked slower, down to `-22%` — see [Timing](#timing-can-the-hand-keep-up).

Each clip carries its own cue track, generated from Edge's word timings, so the
subtitle is the timing the voice actually used rather than an estimate. A line
with no clip — a step edited but not rebuilt, a language added in a hurry — is
read by the browser instead, preferring an Edge natural voice; with no voice at
all, the cues still run on a timer. Subtitles never depend on the audio working.

`src/studio-guide-voice.js` owns the playback and the strip; the guide only says
which keys to speak, and the speaker button in its header is a mute that is
remembered across reloads.

## The hand

Importing an actor is the one thing a lesson never writes down, so the guide does
it the way a child would: the plus, the library, the tile, the press. A ring says
where; `src/studio-guide-cursor.js` says *press* — an arrow that travels to the
target, compresses against it, leaves a ripple, and clicks.

The green flag is pressed the same way. The copy says 按一下綠旗 and the hand goes
there and presses it, with the project starting under the ripple; the flag used to
be rung and then started by the guide on the child's behalf, which is the one
thing the rest of this avoids. Nothing is pressed on a scene change: the stage is
rebuilt by the guide, and a hand on a picture that nobody chose would be theatre.

Which also settles what a step may be. The lessons used to open on an empty stage,
with a ring around it and nothing to press; that step is gone. A demonstration is
already a new project, so the step could only point at nothing — and a first step
that points at nothing teaches the child that the rings mean nothing.

The click is synthesised rather than sampled: a band-passed noise burst for the
tick and a fast-falling triangle for the body, both gone in under a tenth of a
second. It follows the narration's mute — a child who turned the voice off asked
for quiet, and the clicks are part of the telling. `probe()` renders the very same
graph into an `OfflineAudioContext` and measures its peak, because a click that
makes no sound is exactly the kind of bug no screenshot can show.

## The order of a step, and the shapes

A step is said and then done. The narration starts the moment 示範 is pressed,
the stage is readied underneath it, and the editor is not allowed to move until
the last line has been spoken (plus a beat). A demonstration that drags blocks
while the voice is still on the heading is two explanations at once and the
student follows neither, so the animation only ever shows what has just been
described — and the last narrated line stays over the stage while it happens.

`src/studio-guide-marks.js` draws the pointing while the talking is going on:
a circle round the thing to click, a square round the thing to drag or type in.
A mark is declared in the topic data (`annotate`), not in the driver, so adding
one is a data change:

```js
annotate: [
  { shape: 'square', at: 'flyout:first', label: 'guide.act.drag' },
  { shape: 'circle', at: 'flag', label: 'guide.act.click' },
  { shape: 'square', at: 'field:motion_movesteps/STEPS',
    label: 'guide.act.type', when: 'built' }   // a number can only be ringed once it exists
]
```

There is no arrow. A ring is either on its target or absent; an arrow claiming
"from here to there" outlives the dialog it pointed into and goes on claiming a
place that is no longer there.

Anchors are regions (`flag`, `stage`, `sprites`, `palette`, `flyout`, `workspace`),
`flyout:first` for the block the palette is showing, `field:<opcode>/<INPUT>` for
an input or a dropdown, or any CSS selector as a last resort. A mark whose target
is not on screen is skipped rather than drawn in the wrong place: a missing mark
is a lost hint, but a mark round the wrong thing is a lesson in the wrong thing.

## Timing: can the hand keep up?

A step is only a demonstration if the action finishes while the sentence about it
is still being spoken. That is a budget, not a matter of taste, and it is checked
as one.

Every narrated step has a **cost** (`tools/pace.mjs`) and a **window**. The cost
is the action's parts added up — the beat before the plus, the press, the modal,
the walk to the tile, the hold on the tile, the close, the actor landing, the
breath after — each with a fixed floor and a compressible part. The window comes
from the clip's own cue track: from the first word plus a lead to the last word
about the last action. The question `check:pace` asks of all seven topics, every
step, in all three languages is simply whether cost fits in window.

There are two levers, and the tools use both:

- **The voice slows down.** Each line is baked at its own rate, solved from the
  step's cost and the copy's length (between `-5%` and `-22%`). The rate is
  written into `manifest.json` and is part of the filename hash, so re-running
  `build:voice` re-synthesises only the lines that needed to change.
- **The pauses compress.** The driver measures how much room is left when the
  step starts (`squeezeOf` in `src/studio-guide-drive.js`) and shortens the
  compressible parts down to 45% if it must. Standing still is the one thing it
  will not cut below.

When neither is enough, the answer is **more words, not slower speech**: a clip
already at `-22%` that still cannot cover its step is reported as "this step needs
a sentence", never as "say it slower still". That is the case `check:pace` fails
on, and it is the only failure mode it has that text cannot fix immediately.

```bash
npm run check:pace      # → the tightest twelve steps, or the failures
```

The arithmetic is checked without a browser; `src/_pace-check.html` (part of
`npm run check:pages`) then plays three real steps under the real narration and
real hand and reports the gap between the last action and the last word. A stall
there is labelled as the library being slow to decode, not as bad pacing.

## The copy is spoken Cantonese

The `zh-Hant` guide strings are written to be *heard*, not read: 佢, 嘅, 咗, 緊,
埋, 畀, 睇 — the words a teacher standing at the board would use. Do not "correct"
them into written Chinese; that is what the voice would then sound like.

One exception, learned the hard way: 撳 is the right Cantonese word for pressing a
button and Edge's Hong Kong voice mispronounces it, so the copy says 按 throughout.
If a character is read wrongly, change the word — the audio is regenerated from the
text, and `npm run build:voice` will notice.

## Attribution

Based on Scratch, developed by the Lifelong Kindergarten Group at the MIT Media Lab. See https://scratch.mit.edu
