#!/usr/bin/env python3
"""Browser tests of the built front-end (no AI, no server): every whitelisted opcode compiles, loads in the VM and renders
as a block; the demo program runs. Needs `npm run build` first and Playwright for Python + Google Chrome (or set CHROME).
usage: python3 test/run_tests.py            AGPL-3.0 (see LICENSE)"""
import functools, http.server, json, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
FIELD = {"var": "v", "list": "L", "broadcast": "m1", "key": "space", "backdrop": "草地"}


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Quiet, directory=ROOT)
    s = socketserver.ThreadingTCPServer(("127.0.0.1", 0), h); s.daemon_threads = True
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, s.server_address[1]


def program(op, d):
    b = {"op": op}
    for f, ft in (d.get("fields") or {}).items():
        b[f] = ft[0] if isinstance(ft, list) else FIELD.get(ft, "x")
    if d["shape"] == "reporter": blocks = [{"op": "event_whenflagclicked"}, {"op": "looks_say", "MESSAGE": b}]
    elif d["shape"] == "boolean": blocks = [{"op": "event_whenflagclicked"}, {"op": "control_if", "CONDITION": b, "SUBSTACK": []}]
    elif d["shape"] == "hat": blocks = [b]
    else: blocks = [{"op": "event_whenflagclicked"}, b]
    return {"sprites": {"小球": {"scripts": {"t": blocks}}}, "stage": {"scripts": {}}}


def sprite_prog(scripts, sprite="小球", stage=None):
    return {"sprites": {sprite: {"scripts": scripts}}, "stage": {"scripts": stage or {}}}


def runtime_checks(pg, fails):
    """Run report, monitors, block text and keyboard behaviour on the demo lesson (original demo art only)."""
    def ok(name, cond, info=""):
        print(("PASS" if cond else "FAIL"), name, f"({info})" if info else "")
        if not cond: fails.append(name)
    def load(prog):
        pg.evaluate("p => WL.applyTurn({program: p, ops: []})", prog); pg.wait_for_timeout(300)
    flag = {"op": "event_whenflagclicked"}
    # variable + list monitors, list contents in the report
    load(sprite_prog({"v": [flag, {"op": "data_setvariableto", "VARIABLE": "分數", "VALUE": 5}, {"op": "data_showvariable", "VARIABLE": "分數"},
                            {"op": "data_addtolist", "ITEM": "蘋果", "LIST": "L"}]}))
    pg.evaluate("WL.run()"); pg.wait_for_timeout(800)
    mons = pg.evaluate("document.getElementById('mons').innerText")
    rep = pg.evaluate("WL.report()")
    ok("variable monitor shows on the stage", "分數" in mons and "5" in mons, mons.replace("\n", " ")[:60])
    ok("list monitor shows on the stage", "L" in mons and "蘋果" in mons and pg.evaluate("!!document.querySelector('#mons .wl-list')"))
    ok("run report lists", (rep.get("lists") or {}).get("L", {}).get("length") == 1, json.dumps(rep.get("lists"), ensure_ascii=False))
    # a variable in a menu input compiles to a variable reporter over the menu shadow
    pj = pg.evaluate("p => WL.compile(p)", sprite_prog({"m": [flag, {"op": "looks_switchbackdropto", "BACKDROP": {"var": "背景名"}}]}))
    blk = [b for t in pj["targets"] for b in t["blocks"].values() if b["opcode"] == "looks_switchbackdropto"][0]
    ok("{var} in a menu input", blk["inputs"]["BACKDROP"][0] == 3 and blk["inputs"]["BACKDROP"][1][0] == 12, json.dumps(blk["inputs"], ensure_ascii=False))
    # pen blocks speak Chinese
    load(sprite_prog({"p": [flag, {"op": "pen_penDown"}, {"op": "control_repeat", "TIMES": 20, "SUBSTACK": [{"op": "motion_movesteps", "STEPS": 5},
        {"op": "control_wait", "DURATION": 0.05}]}, {"op": "pen_penUp"}]}))
    pg.wait_for_timeout(300)
    txt = pg.evaluate("document.getElementById('blocks').textContent")
    ok("pen blocks in Traditional Chinese", "下筆" in txt and "停筆" in txt, txt[:60])
    pg.evaluate("WL.run()"); pg.wait_for_timeout(1600)
    pm = pg.evaluate("WL.report().sprites['小球'].pen_moves")
    ok("run report pen_moves", (pm or 0) >= 3, f"pen_moves={pm}")
    pg.evaluate("WL.stop()")
    # a program that waits for a key: hat_wait, not "ended by itself", secs = wall clock until stop / next turn
    load(sprite_prog({"k": [{"op": "event_whenkeypressed", "KEY_OPTION": "right arrow"}, {"op": "motion_changexby", "DX": 10}]}, sprite="籃子"))
    pg.evaluate("WL.run()"); pg.wait_for_timeout(3200)
    rep = pg.evaluate("WL.report()")
    ok("key-only program: hat_wait, not ended, secs >= 3", rep.get("hat_wait") is True and rep.get("ended_by_itself") is False and rep.get("secs", 0) >= 3,
       f"hat_wait={rep.get('hat_wait')} ended={rep.get('ended_by_itself')} secs={rep.get('secs')}")
    # touched colours: a lesson colour from the demo backdrop (grass), sampled while the ball rests on it
    pg.evaluate("WL.lesson.colors = ['#5cb85c']; WL._colors = null")
    load(sprite_prog({"f": [flag, {"op": "control_forever", "SUBSTACK": [{"op": "motion_changeyby", "DY": -10}]}]}))
    pg.evaluate("WL.run()"); pg.wait_for_timeout(2000)
    tc = pg.evaluate("WL.report().sprites['小球'].touched_colors")
    ok("touched_colors (sampled lesson colour)", "#5cb85c" in (tc or {}), json.dumps(tc))
    mv = pg.evaluate("WL.report().sprites['小球'].moves")
    ok("run report moves (samples at a new position)", (mv or 0) >= 3, f"moves={mv}")
    # ... and a colour that the program itself checks, even if the sprite bounces straight back
    pg.evaluate("WL.lesson.colors = []; WL._colors = null")
    load(sprite_prog({"b": [flag, {"op": "control_forever", "SUBSTACK": [{"op": "motion_changeyby", "DY": -10},
        {"op": "control_if", "CONDITION": {"op": "sensing_touchingcolor", "COLOR": "#5cb85c"}, "SUBSTACK": [{"op": "motion_changeyby", "DY": 40}]}]}]}))
    pg.evaluate("WL.run()"); pg.wait_for_timeout(2500)
    tc = pg.evaluate("WL.report().sprites['小球'].touched_colors")
    ok("touched_colors (the program's own colour check)", "#5cb85c" in (tc or {}), json.dumps(tc))
    pg.evaluate("WL.stop()")
    # keyboard: Space on a focused button presses the button, it is not a key for the program
    load(sprite_prog({"k": [{"op": "event_whenkeypressed", "KEY_OPTION": "space"}, {"op": "motion_changexby", "DX": 10}]}, sprite="籃子"))
    pg.evaluate("WL.run()")
    pg.evaluate("document.getElementById('stop').dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}))")
    k1 = pg.evaluate("WL.trace.keys.slice()")
    pg.evaluate("document.body.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true})); document.body.dispatchEvent(new KeyboardEvent('keyup', {key: ' ', bubbles: true}))")
    k2 = pg.evaluate("WL.trace.keys.slice()")
    ok("keys on a focused button stay with the button; keys on the page reach the program", k1 == [] and k2 == ["space"], f"{k1} / {k2}")
    pg.evaluate("WL.stop()")


def main():
    if not os.path.exists(os.path.join(ROOT, "dist", "engine.json")):
        sys.exit("run `npm run build` first")
    spec = json.load(open(os.path.join(ROOT, "src", "opcodes.json"), encoding="utf-8"))["opcodes"]
    srv, port = serve(); fails = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, headless=True, args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = b.new_page(viewport={"width": 1366, "height": 768}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        pg.goto(f"http://127.0.0.1:{port}/examples/demo/index.html")
        for _ in range(150):
            if pg.evaluate("!!window.DEMO_READY"): break
            pg.wait_for_timeout(200)
        if not pg.evaluate("!!window.DEMO_READY"):
            sys.exit(f"demo did not boot: {errs}")
        pg.evaluate("WL.run()"); pg.wait_for_timeout(1200)
        y = pg.evaluate("WL.report().sprites['小球'].end[1]")
        print(("PASS" if y < 0 else "FAIL"), "demo program runs (ball y =", y, ")"); y < 0 or fails.append("demo run")
        for op, d in spec.items():
            r = pg.evaluate("p => WL.applyTurn({program: p, ops: []}).then(() => WL.ws.getAllBlocks().length).catch(e => 'ERR ' + e.message)", program(op, d))
            if not isinstance(r, int) or r < 1:
                fails.append(f"{op}: {r}")
        print(("PASS" if not [f for f in fails if ':' in f] else "FAIL"), f"{len(spec)} whitelisted opcodes compile, load and render")
        runtime_checks(pg, fails)
        if errs: fails.append("page errors: " + "; ".join(errs[:3]))
        b.close()
    srv.shutdown()
    print("\n" + ("all passed" if not fails else "FAILED: " + "; ".join(fails[:10])))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
