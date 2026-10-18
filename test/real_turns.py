#!/usr/bin/env python3
"""Two REAL model turns through lab_core.lab_turn (DeepSeek), to check that the Studio's request shape works with the
real turn logic. Start a second server first, with the key in an environment variable only:

    (set -a; . ~/.deepseek; set +a; WL_REAL=1 WL_REAL_MAX=2 python3 server/studio_server.py --port 8921)
    python3 test/real_turns.py --base http://127.0.0.1:8921

The student drags 「當綠旗被點擊」+「移動 10 點」 by hand, runs it, then talks to the AI twice. -> test/out/real_turns.json
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e  # noqa: E402  (drag helpers)
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8921")
    a = ap.parse_args()
    e2e.BASE = a.base
    out = {"turns": []}
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=e2e.ARGS)
        pg = br.new_page(viewport={"width": 1440, "height": 900})
        e2e.watch(pg, "real")
        pg.goto(a.base + "/")
        e2e.ready(pg)
        e2e.category(pg, "事件")
        e2e.drag(pg, e2e.block_box(pg, "event_whenflagclicked"), 420, 170)
        pg.wait_for_timeout(1400)
        e2e.category(pg, "動作")
        hat = e2e.ws_block_box(pg, "event_whenflagclicked")
        e2e.drag(pg, e2e.block_box(pg, "motion_movesteps"), hat["x"], hat["y"] + hat["h"] - 2)
        pg.wait_for_timeout(1500)
        pg.click('[aria-label="開始執行"]')
        pg.wait_for_timeout(1500)
        pg.click('[aria-label="停止執行"]')
        for text in ("我想佢一直行", "佢行出咗舞台"):
            n = pg.evaluate("() => WLStudio.versions.length")
            pg.fill("#wl-input", text)
            pg.click("#wl-send")
            pg.wait_for_timeout(200)
            pg.wait_for_function("() => !WLStudio.busy", timeout=90000)
            pg.wait_for_timeout(800)
            v = pg.evaluate("() => { const v = WLStudio.versions[WLStudio.versions.length - 1]; return {source: v.source, noChange: !!v.noChange, ops: v.ops || [], program: WLStudio.snapshotNow().program}; }")
            msgs = pg.evaluate("() => [...document.querySelectorAll('.wl-msg')].slice(-3).map(m => m.className.replace('wl-msg ', '') + ': ' + m.textContent)")
            out["turns"].append({"student": text, "sent_program": pg.evaluate("() => WLStudio.lastSent.program"),
                                 "sent_run": pg.evaluate("() => WLStudio.lastSent.run"), "reply_msgs": msgs, "applied_ops": v["ops"],
                                 "program_after": v["program"]})
            print(json.dumps(out["turns"][-1], ensure_ascii=False)[:900], flush=True)
        pg.screenshot(path=os.path.join(ROOT, "shots", "10-real-model-turns-1440x900.png"))
        br.close()
    out["console_errors"] = [c for c in e2e.RES["console"] if c["type"] in ("error", "pageerror")]
    with open(os.path.join(ROOT, "test", "out", "real_turns.json"), "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
