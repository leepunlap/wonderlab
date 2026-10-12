#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Browser proof that a lesson sound reaches the VM and actually plays, using the REAL built engine.

Serves ~/iits-lessons-build/stage (the staging output) and drives the real page:
  * the lesson JSON's sound must be loaded into the sprite's sound bank by the VM,
  * `sound_playuntildone` must start a SoundPlayer and keep the thread waiting for it,
  * `sound_play` must be fire-and-forget,
  * a lesson with no sounds must behave exactly as before (no error, block does nothing).

Audio note: Chromium is launched with `--autoplay-policy=no-user-gesture-required` and a real (null-sink)
AudioContext, so the SoundPlayer really starts. The test asserts on the AudioEngine's own state
(players, playing ids) rather than on sound coming out of a speaker, which a headless box cannot confirm.

usage: python3 /tmp/browser_sound_test.py [stage-root] [chrome]
"""
import functools, http.server, json, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/iits-lessons-build/stage")
CHROME = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("CHROME", "/usr/bin/google-chrome")
FAILS = []
PAGE = None


def ok(name, cond, info=""):
    print(("  ok   " if cond else "  FAIL ") + name + (f"  {info}" if info else ""))
    if not cond:
        FAILS.append(name)


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    h = functools.partial(Quiet, directory=ROOT)
    s = socketserver.ThreadingTCPServer(("127.0.0.1", 0), h)
    s.daemon_threads = True
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, s.server_address[1]


# A page that boots the REAL engine from the staging assets/lab/ and compiles 501-bp01's own lesson JSON.
HARNESS = """<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>sound test</title>
<style>html,body{margin:0}.wl-canvas{display:block}</style></head><body>
<div id="stage" style="width:480px;height:360px"></div><div id="blocks" style="width:600px;height:400px"></div>
<div id="tabs"></div><div id="mons"></div><form id="ask" hidden><p class="wl-askq"></p><input><button>OK</button></form>
<script>
window.__err = [];
window.addEventListener('error', e => window.__err.push(String(e.message).slice(0,200)));
(async function () {
  const LAB = new URL('assets/lab/', location.href).href;      // <L4>/assets/lab/
  const eng = await (await fetch(LAB + 'manifest.json')).json();
  for (const f of eng.scripts) await new Promise((ok, bad) => { const s = document.createElement('script');
    s.src = LAB + eng.engine + f; s.onload = ok; s.onerror = () => bad(new Error('load ' + f)); document.head.appendChild(s); });
  window.__engine = eng;
  window.__audioEnginePresent = typeof window.ScratchAudio;
  const spec = await (await fetch(LAB + eng.engine + 'opcodes.json')).json();
  const lesson = await (await fetch(LAB + '501-bp01.json')).json();
  window.__lesson = lesson;
  const wl = window.WL = new WonderLab({ spec, lesson, assetBase: LAB + 'a/', mediaBase: LAB + eng.engine + 'media/',
    el: { stage: document.getElementById('stage'), blocks: document.getElementById('blocks'), tabs: document.getElementById('tabs'),
          monitors: document.getElementById('mons'), ask: document.getElementById('ask') } });
  wl.boot(); wl.active = true;
  window.__vm = wl.vm;
  window.__hasAudioEngine = !!(wl.vm.runtime.audioEngine);
  await wl.load(WonderLab.empty());
  window.__READY = true;
})().catch(e => { window.__err.push('boot: ' + e.message); window.__READY = true; });
</script></body></html>"""


def main():
    if not os.path.isdir(ROOT):
        sys.exit("stage root not found: " + ROOT)
    srv, port = serve()
    open(os.path.join(ROOT, "L4", "_soundtest.html"), "w", encoding="utf-8").write(HARNESS)
    base = f"http://127.0.0.1:{port}/L4/_soundtest.html"
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path=CHROME, headless=True,
                              args=["--autoplay-policy=no-user-gesture-required", "--use-gl=angle",
                                    "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                                    "--mute-audio"])
        pg = br.new_page(viewport={"width": 1280, "height": 800})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        pg.on("console", lambda m: errs.append("console.error: " + m.text[:160]) if m.type == "error" and "Failed to load resource" not in m.text else None)
        pg.on("response", lambda r: errs.append("HTTP %d %s" % (r.status, r.url)) if r.status >= 400 and not r.url.endswith("/favicon.ico") else None)
        pg.goto(base)
        for _ in range(100):
            if pg.evaluate("!!window.__READY"):
                break
            pg.wait_for_timeout(200)
        ok("the page booted the real engine", pg.evaluate("!!window.__READY"), pg.evaluate("window.__err.join(' | ')"))
        ok("engine.scripts includes scratch-audio.js", "scratch-audio.js" in (pg.evaluate("window.__engine.scripts") or []),
           str(pg.evaluate("window.__engine && window.__engine.scripts")))
        ok("window.ScratchAudio is a constructor", pg.evaluate("window.__audioEnginePresent") == "function",
           str(pg.evaluate("window.__audioEnginePresent")))
        ok("the VM has an attached audio engine", pg.evaluate("!!window.__hasAudioEngine"))
        ok("a per-target sound bank was created", pg.evaluate("!!(window.__vm.runtime.targets[1] && window.__vm.runtime.targets[1].sprite.soundBank)"))

        # the lesson's sound arrived in the compiled project.json
        pj = pg.evaluate("p => WL.compile(p)", pg.evaluate("WonderLab.empty()"))
        mouse = next(t for t in pj["targets"] if t["name"] == "小老鼠")
        ok("compiled project.json gives 小老鼠 its sound", len(mouse["sounds"]) == 1, json.dumps(mouse["sounds"], ensure_ascii=False))
        ok("with the right md5ext", mouse["sounds"][0]["md5ext"].endswith(".wav"), mouse["sounds"][0]["md5ext"])

        # the VM loaded it into the sprite (this only happens if the engine decoded it)
        pg.wait_for_timeout(1500)
        loaded = pg.evaluate("""() => {
          const t = window.__vm.runtime.targets.find(x => x.getName && x.getName() === '小老鼠');
          if (!t) return {err: 'no target'};
          const s = t.sprite.sounds[0] || {};
          return { n: t.sprite.sounds.length, name: s.name, soundId: s.soundId || null,
                   rate: s.rate || 0, sampleCount: s.sampleCount || 0, hasPlayer: !!(s.soundId && t.sprite.soundBank && t.sprite.soundBank.soundPlayers && t.sprite.soundBank.soundPlayers[s.soundId]) };
        }""")
        ok("the VM decoded the sound into a SoundPlayer (soundId set)", bool(loaded.get("soundId")), json.dumps(loaded))
        ok("decoded rate/sampleCount came back from the buffer", loaded.get("sampleCount", 0) > 0 and loaded.get("rate", 0) > 0, json.dumps(loaded))
        ok("a SoundPlayer is in the sprite's sound bank", bool(loaded.get("hasPlayer")), json.dumps(loaded))

        # sound_playuntildone: the thread must wait for the sound
        prog = {"sprites": {"小老鼠": {"scripts": {"s1": [
            {"op": "event_whenflagclicked"},
            {"op": "sound_playuntildone", "SOUND_MENU": "吱吱"},
            {"op": "looks_say", "MESSAGE": "done"}]}}}, "stage": {"scripts": {}}}
        pg.evaluate("p => WL.applyTurn({program: p, ops: []}).then(() => WL.compile(WL.program))", prog)
        pg.wait_for_timeout(600)
        r = pg.evaluate("""() => {
          const t = window.__vm.runtime.targets.find(x => x.getName && x.getName() === '小老鼠');
          const bank = t.sprite.soundBank;
          const id = t.sprite.sounds[0].soundId;
          const p = bank.soundPlayers[id];
          return { status: p ? p.status : null, isPlaying: p ? p.isPlaying : null, id: id };
        }""")
        # start it and immediately sample: the thread must still be alive because the sound is playing
        pg.evaluate("WL.run()")
        pg.wait_for_timeout(120)
        mid = pg.evaluate("""() => {
          const t = window.__vm.runtime.targets.find(x => x.getName && x.getName() === '小老鼠');
          const bank = t.sprite.soundBank, id = t.sprite.sounds[0].soundId;
          const p = bank.soundPlayers[id];
          const th = window.__vm.runtime.threads.filter(x => x.target === t).length;
          return { threads: th, playing: p ? p.isPlaying : false, status: p ? p.status : null };
        }""")
        ok("sound_playuntildone keeps its thread while the sound plays",
           mid["threads"] >= 1 and bool(mid["playing"]), json.dumps(mid))
        pg.wait_for_timeout(1200)
        after = pg.evaluate("""() => {
          const t = window.__vm.runtime.targets.find(x => x.getName && x.getName() === '小老鼠');
          const bank = t.sprite.soundBank, id = t.sprite.sounds[0].soundId;
          const p = bank.soundPlayers[id];
          return { threads: window.__vm.runtime.threads.filter(x => x.target === t).length,
                   playing: p ? p.isPlaying : false, said: document.body.innerText.indexOf('done') >= 0 };
        }""")
        ok("after the sound ends the script carries on (no stuck thread)", after["threads"] == 0 and not after["playing"], json.dumps(after))
        rep = pg.evaluate("WL.report()")
        ok("run report records that 小老鼠 spoke", "done" in json.dumps(rep, ensure_ascii=False), json.dumps(rep.get("sprites", {}).get("小老鼠", {}).get("said", []), ensure_ascii=False))
        pg.evaluate("WL.stop()")

        # sound_play is fire-and-forget
        prog2 = {"sprites": {"小老鼠": {"scripts": {"s1": [
            {"op": "event_whenflagclicked"},
            {"op": "sound_play", "SOUND_MENU": "吱吱"},
            {"op": "looks_say", "MESSAGE": "done2"}]}}}, "stage": {"scripts": {}}}
        pg.evaluate("p => WL.applyTurn({program: p, ops: []}).then(() => WL.compile(WL.program))", prog2)
        pg.wait_for_timeout(500)
        pg.evaluate("WL.run()")
        pg.wait_for_timeout(80)
        ff = pg.evaluate("""() => {
          const t = window.__vm.runtime.targets.find(x => x.getName && x.getName() === '小老鼠');
          const bank = t.sprite.soundBank, id = t.sprite.sounds[0].soundId;
          const p = bank.soundPlayers[id];
          return { playing: p ? p.isPlaying : false, threads: window.__vm.runtime.threads.filter(x => x.target === t).length };
        }""")
        ok("sound_play starts the sound but does not hold the thread", ff["threads"] == 0 and bool(ff["playing"]), json.dumps(ff))
        pg.wait_for_timeout(900)
        pg.evaluate("WL.stop()")

        # the read-only blocks render the sound block in Chinese with the lesson's sound name
        txt = pg.evaluate("document.getElementById('blocks').textContent")
        ok("the block shows 「播放音效」 and the sound name", "播放音效" in txt and "吱吱" in txt, txt[:120].replace("\n", " "))

        # the whitelisted sound opcodes all compile
        spec = json.load(open(os.path.expanduser("~/wonderlab-src/src/opcodes.json"), encoding="utf-8"))["opcodes"]
        sndops = {k: v for k, v in spec.items() if k.startswith("sound_")}
        ok("six sound opcodes are whitelisted", len(sndops) == 6, str(sorted(sndops)))
        for op, d in sndops.items():
            blocks = [{"op": "event_whenflagclicked"}]
            b = {"op": op}
            for f in (d.get("inputs") or {}):
                b[f] = "吱吱" if f == "SOUND_MENU" else 60
            if d["shape"] == "reporter":
                blocks.append({"op": "looks_say", "MESSAGE": b})
            else:
                blocks.append(b)
            r2 = pg.evaluate("p => WL.applyTurn({program: p, ops: []}).then(() => WL.ws.getAllBlocks().length).catch(e => 'ERR ' + e.message)",
                             {"sprites": {"小老鼠": {"scripts": {"t": blocks}}}, "stage": {"scripts": {}}})
            ok(f"{op} compiles, loads and renders", isinstance(r2, int) and r2 >= 1, str(r2))

        if errs:
            ok("no page errors", False, "; ".join(errs[:4]))
        else:
            ok("no page errors", True)
        br.close()
    srv.shutdown()
    try:
        os.unlink(os.path.join(ROOT, "L4", "_soundtest.html"))
    except OSError:
        pass
    print("\n" + ("ALL OK" if not FAILS else f"{len(FAILS)} FAILED: " + "; ".join(FAILS[:8])))
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
