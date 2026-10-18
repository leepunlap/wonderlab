#!/usr/bin/env python3
"""WLAnim inside the production frame (lab-frame.html + studio-lab.js of package FE), headless Chrome.

    python3 server/studio_server.py --port 8925 &
    python3 test/anim_labframe.py [--base http://127.0.0.1:8925]

lab-frame.html is served as published by FE except that its <!--wl-anim--> placeholder gets
<script src="studio-anim.js"></script> (what the build does), so studio-anim.js loads before studio-lab.js, as in production.
The frame is booted standalone (WLStudio.boot with a two-sprite lesson whose costumes are served by a route). Checks, through
FE's own WLStudio.lock + WLStudio.apply: animated, no fallback, end state == today's instant apply (run on a saved copy in
the same page); the 跳過動畫 button works under FE's lock (its window capture blocker swallows trusted clicks over the
editor); a student's real drag during the animation changes nothing; no page errors. -> test/out/anim_labframe.json
Copyright (C) 2026 IITS. AGPL-3.0-only.
"""
import argparse, json, os, sys, time
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
import anim_cases as A   # noqa: E402  (shared in-page helpers and blocks)

ROOT = A.ROOT
SPRITE_SVG = open(os.path.join(ROOT, "src", "assets", "sprite-a.svg"), "rb").read()
BACK_SVG = open(os.path.join(ROOT, "src", "assets", "backdrop.svg"), "rb").read()
LESSON = {"stage": {"backdrops": [{"assetId": "15f37ae440b58748a8169885bd5123d0", "name": "背景1", "ext": "svg", "cx": 240, "cy": 180}]},
          "sprites": [{"name": "角色1", "x": -60, "y": 0, "costumes": [{"assetId": "daa0565aa66cfdfa4ddf0e4054092968", "name": "造型1", "ext": "svg", "cx": 42, "cy": 50}]},
                      {"name": "角色2", "x": 80, "y": 0, "costumes": [{"assetId": "daa0565aa66cfdfa4ddf0e4054092968", "name": "造型1", "ext": "svg", "cx": 42, "cy": 50}]}]}
SHIM = "window.WLStudio.snapshotNow = function () { return { program: window.WLStudio.program() }; };"
F, mv, tr, say, key, forever, BOUNCE = A.FLAG, A.mv, A.tr, A.say, A.key, A.forever, A.BOUNCE
CASES = [
    {"name": "lab_new_script", "init": {}, "set": {"角色1": {"s1": [F, mv(10), tr(15)]}}},
    {"name": "lab_wrap_and_add", "init": {"角色1": {"s1": [F, mv(10), BOUNCE]}},
     "set": {"角色1": {"s1": [F, forever(mv(10), BOUNCE)], "s2": [key("space"), {"op": "control_stop", "STOP_OPTION": "all"}]}}},
    {"name": "lab_other_sprite", "init": {"角色1": {"s1": [F, mv(10)]}}, "set": {"角色2": {"s1": [F, say("你好", 1)]}}},
    {"name": "lab_missing_inputs", "init": {}, "set": {"角色1": {"s1": [F, {"op": "motion_movesteps"}, {"op": "looks_say"}]}}},
    {"name": "lab_side_by_side", "init": {}, "foreign": [("角色1", [F, mv(10)])], "set": {"角色1": {"$fx": [F, mv(20)]}}},
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8925")
    a = ap.parse_args()
    base = a.base.rstrip("/")
    os.makedirs(A.OUT, exist_ok=True)
    report = {"cases": [], "errors": []}
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=A.ARGS)
        ctx = br.new_context(viewport={"width": 1100, "height": 800})
        pg = ctx.new_page()
        phase = ["boot"]
        pg.on("pageerror", lambda e: report["errors"].append({"type": "pageerror", "text": str(e)[:300], "phase": phase[0]}))
        pg.on("console", lambda m: report["errors"].append({"type": "console", "text": m.text[:300], "phase": phase[0]}) if m.type == "error" else None)

        def frame_html(route):
            r = route.fetch()
            html = r.text()
            if "<!--wl-anim-->" not in html:
                report["errors"].append({"type": "setup", "text": "lab-frame.html has no <!--wl-anim--> placeholder"})
            route.fulfill(response=r, body=html.replace("<!--wl-anim-->", '<script src="studio-anim.js"></script>'))
        pg.route("**/lab-frame.html", frame_html)
        pg.route("**/lesson-assets/**", lambda route: route.fulfill(status=200, content_type="image/svg+xml",
                                                                     body=BACK_SVG if "15f37" in route.request.url else SPRITE_SVG))
        pg.goto(base + "/lab-frame.html")
        boot = pg.evaluate("(L) => WLStudio.boot({lesson: L, assetBase: location.origin + '/lesson-assets/', program: {sprites: {}, stage: {scripts: {}}}})", LESSON)
        pg.evaluate(SHIM)
        pg.evaluate(A.HELPERS)
        pg.evaluate("() => __T.init()")
        report["boot_ms"] = boot.get("ms")
        pg.wait_for_timeout(1500)
        phase[0] = "cases"
        # keep WLAnim's own result even when the page then falls back (FE's result drops it)
        pg.evaluate("() => { const o = WLAnim.play; WLAnim.play = function (x) { return o(x).then(r => { window.__lastAnim = r; return r; }); }; }")
        report["anim_loaded_first"] = pg.evaluate("() => { const s = [...document.scripts].map(x => x.getAttribute('src')); return s.indexOf('studio-anim.js') >= 0 && s.indexOf('studio-anim.js') < s.indexOf('studio-lab.js'); }")
        print("boot", boot, "studio-anim.js before studio-lab.js:", report["anim_loaded_first"])
        for c in CASES + [{"name": "lab_skip_button_under_lock", "skip": 1.0, "init": {},
                           "set": {"角色1": {"s1": [F, mv(10), tr(15), say("完成", 1)], "s2": [key("a"), mv(5)], "s3": [key("b"), mv(-5)]}}},
                          {"name": "lab_student_drag_under_lock", "drag": 0.8, "init": {"角色1": {"s1": [F, mv(10), say("你好", 2)]}},
                           "set": {"角色1": {"s1": [F, mv(10), tr(15), say("你好", 2)]}}},
                          # a short turn with a 4.5 s safety timer, then a longer turn right after it: the first timer must not skip the second
                          {"name": "lab_short_turn_4500ms_timer", "maxMs": 4500, "init": {}, "set": {"角色1": {"s1": [F, mv(10)]}}},
                          {"name": "lab_next_turn_not_skipped", "maxMs": 20000, "init": {"角色1": {"s1": [F, mv(10)]}},
                           "set": {"角色1": {"s1": [F, forever(mv(10), BOUNCE)], "s2": [key("a"), say("早晨", 1)]}}}]:
            pg.evaluate("([i, h, f]) => __T.setup(i, h, f, null, null)", [c.get("init") or {}, [], c.get("foreign") or []])
            pg.wait_for_timeout(500)
            before = pg.evaluate("() => WLStudio.program()")
            after, ops = A.make_reply(c, before)
            ref = pg.evaluate("([b, a, o]) => __T.reference(b, a, o)", [before, after, ops])
            pg.wait_for_timeout(300)
            pg.evaluate("""([a, o, mx]) => { window.__lab = null; window.__lastAnim = null; window.__seen = {ptr: false, skip: false};
                const iv = setInterval(() => { if (document.querySelector('.wl-anim-ptr.on')) __seen.ptr = true; if (document.querySelector('.wl-anim-skip')) __seen.skip = true; }, 60);
                WLStudio.lock(true);
                WLStudio.apply({ops: o, program: a}, {maxMs: mx}).then(r => { clearInterval(iv); WLStudio.lock(false); window.__lab = r; }); }""", [after, ops, c.get("maxMs", 600000)])
            t0 = time.time()
            clicked = dragged = out_box = None
            while not pg.evaluate("() => !!window.__lab"):
                el = time.time() - t0
                if c.get("skip") and clicked is None and el >= c["skip"]:
                    box = pg.evaluate("() => { const b = document.querySelector('.wl-anim-skip'); if (!b) return null; const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return {x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, hit: top ? (top.className || top.tagName) + '' : null}; }")
                    if box:
                        out_box = box
                        pg.screenshot(path=os.path.join(ROOT, "shots", "anim", "labframe-skip-button.png"))
                        pg.mouse.click(box["x"], box["y"]); clicked = time.time()
                if c.get("drag") and dragged is None and el >= c["drag"]:
                    box = pg.evaluate("() => { const b = WLStudio.workspace().getTopBlocks(false)[0]; const r = b.getSvgRoot().getBoundingClientRect(); return {x: r.left + 20, y: r.top + 20}; }")
                    pg.mouse.move(box["x"], box["y"]); pg.mouse.down(); pg.mouse.move(box["x"] + 140, box["y"] + 180, steps=8); pg.mouse.up()
                    dragged = time.time()
                if el > 40:
                    break
                pg.wait_for_timeout(40)
            wall = time.time() - t0
            r = pg.evaluate("() => window.__lab")
            seen = pg.evaluate("() => window.__seen")
            live = pg.evaluate("() => WLStudio.program()")
            la = pg.evaluate("() => window.__lastAnim && {ok: __lastAnim.ok, fallback: __lastAnim.fallback, skipped: __lastAnim.skipped, animated: __lastAnim.animated, ms: __lastAnim.ms, diffs: __lastAnim.diffs}")
            out = {"name": c["name"], "result": {k: v for k, v in (r or {}).items() if k != "anim"}, "anim": la,
                   "equal_reference": live == ref["prog"], "wall_s": round(wall, 2), "pointer_seen": seen["ptr"], "skip_seen": seen["skip"]}
            if clicked:
                out["skip_to_done_s"] = round(wall - (clicked - t0), 2)
                out["skip_box"] = out_box
            bad, fe = [], []
            if not la or not la.get("ok") or la.get("fallback") or la.get("diffs"): bad.append("WLAnim result not exact")
            if not out["equal_reference"]: fe.append("page end state != instant apply")
            if (r or {}).get("fallback"): fe.append("page fell back to the instant apply")
            if not seen["ptr"]: bad.append("no pointer")
            if c.get("skip") and (not clicked or out.get("skip_to_done_s", 99) > 1.5 or not (la or {}).get("skipped")): bad.append("skip button did not work under the lock")
            if not c.get("skip") and (la or {}).get("skipped"): fe.append("animation skipped by something else (the page's safety timer of an earlier turn)")
            if c.get("drag") and not out["equal_reference"]: bad.append("student drag changed the result")
            out["bad"], out["page_issues"] = bad, fe
            if not out["equal_reference"]:
                out["live"], out["reference"] = live, ref["prog"]
            report["cases"].append(out)
            print(("PASS " if not bad else "FAIL ") + c["name"].ljust(30) + " wall %5.2fs  WLAnim %s  | page: %s" % (
                wall, json.dumps(la, ensure_ascii=False)[:150], ", ".join(fe) or "ok") + ("  FAIL: " + ", ".join(bad) if bad else ""), flush=True)
        br.close()
    with open(os.path.join(A.OUT, "anim_labframe.json"), "w") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    errs = [e for e in report["errors"] if e["type"] in ("pageerror", "console", "setup") and e.get("phase") != "boot"]
    report["boot_errors"] = [e for e in report["errors"] if e.get("phase") == "boot"]
    print("errors while booting the frame (not WLAnim):", len(report["boot_errors"]), json.dumps(report["boot_errors"], ensure_ascii=False)[:300])
    failed = [c["name"] for c in report["cases"] if c["bad"]]
    print("page errors:", len(errs), json.dumps(errs, ensure_ascii=False)[:600])
    issues = [(c["name"], c["page_issues"]) for c in report["cases"] if c["page_issues"]]
    print("page-side issues (package FE):", json.dumps(issues, ensure_ascii=False))
    print("SUMMARY: %d/%d lab-frame cases pass for WLAnim; failed: %s" % (len(report["cases"]) - len(failed), len(report["cases"]), failed or "none"))
    sys.exit(1 if failed or errs else 0)


if __name__ == "__main__":
    main()
