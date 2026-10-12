// esbuild entry: scratch-audio 2.0.268 -> one IIFE exposing window.ScratchAudio (the AudioEngine class).
// Copyright (C) 2026 IITS. AGPL-3.0-only (see LICENSE). scratch-audio is AGPL-3.0-only (Scratch Foundation).
//
// Why this is here at all: the upstream @scratch/scratch-vm web bundle does NOT contain scratch-audio — the host
// application supplies the audio engine (scratch-gui does `vm.attachAudioEngine(new AudioEngine())`). Without it
// runtime.audioEngine is null, `loadSound()` returns the sound unloaded, and every 播放音效 block is silent.
// Bundled from src/ (not the prebuilt dist.js, which leaves minilog/startaudiocontext/audio-context as externals
// that a browser cannot resolve).
import AudioEngine from 'scratch-audio';
window.ScratchAudio = AudioEngine;
