#!/usr/bin/env python3
"""The modularity matrix: one shell, every module switchable, the editor always usable.

This is the test that makes the architecture's central claim checkable rather than
remembered. The claim is:

    no helper is load-bearing. Switching any one off leaves a working editor.

And ?stock=1 - every helper off - must still render verbatim scratch-gui.

It found a real bug the first time it ran: ?trace=0 left a dead editor, because
`trace.onRun = ...` ran unguarded inside onVmInit and a throw there means the
project never loads. That is exactly the failure the claim says cannot happen, so
this file earns its place.

    python3 test/module_matrix.py                 # against a running studio_server
    python3 test/module_matrix.py --port 8920
    python3 test/module_matrix.py --turn          # also drive one real AI turn

It needs the server already serving (server/studio_server.py) and a Chrome with a
remote debugging port, because it drives a real browser: the thing being tested is
whether the gui comes up, which no unit test can answer.
"""
import argparse
import asyncio
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.expanduser("~/src/iits/iits-local/tools"))
from cdp import CDP, page_ws  # noqa: E402

# name, url suffix, and what must be true afterwards.
# `off` names a module that must be absent; anything not named must be present.
CASES = [
    ("baseline",      "",                     {"ready": True, "assist": True,  "trace": True,  "blocks": 19, "cats": 11}),
    ("no assist",     "?assist=0",            {"ready": True, "assist": False, "trace": True,  "blocks": 19, "cats": 11}),
    ("no trace",      "?trace=0",             {"ready": True, "assist": True,  "trace": False, "blocks": 19, "cats": 11}),
    ("no ucmake",     "?ucmake=0",            {"ready": True, "assist": True,  "trace": True,  "blocks": 0,  "cats": 10}),
    ("no versions",   "?versions=0",          {"ready": True, "assist": True,  "trace": True,  "blocks": 19, "cats": 11}),
    ("no animate",    "?animate=0",           {"ready": True, "assist": True,  "trace": True,  "blocks": 19, "cats": 11}),
    ("only trace",    "?only=trace",          {"ready": True, "assist": False, "trace": True,  "blocks": 0,  "cats": 10}),
    ("stock",         "?stock=1",             {"ready": True, "assist": False, "trace": False, "blocks": None, "cats": 10}),
]


def server_up(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=8) as r:
            return r.status == 200
    except Exception:
        return False


async def measure(c, base):
    """Read the one number each assertion depends on. Kept in its own function so a case that
    hangs is a case that fails, not a case that silently passes."""
    out = {}
    out["ready"] = await c.js("String(!!(window.WLStudio && WLStudio.ready))") == "true"
    out["assist"] = await c.js("String(!!(window.WLStudio && WLStudio.assist))") == "true"
    out["trace"] = await c.js("String(!!(window.WLStudio && WLStudio.trace))") == "true"
    blocks = await c.js("String(window.WLStudio ? WLStudio.ucmakeBlocks : 'none')")
    # stock mode never assigns ucmakeBlocks (the hook returns before it), so "undefined" is a
    # legitimate answer and must not be parsed as a number
    out["blocks"] = None if blocks in ("none", "undefined", "") else int(blocks)
    out["cats"] = int(await c.js("String(document.querySelectorAll('.blocklyToolboxCategoryContainer').length)") or 0)
    return out


async def run(port, do_turn, timeout_s):
    async with CDP(page_ws()) as c:
        await c.cmd("Network.setCacheDisabled", cacheDisabled=True)
        await c.viewport(1600, 1000, 2)
        rows, failed = [], 0
        for i, (name, suffix, want) in enumerate(CASES):
            # A unique URL per case, not Page.reload: a reload races the readiness poll - the OLD
            # document still has WLStudio.ready=true from the previous case, the poll returns
            # immediately, and the measurement is taken against a document that is still loading.
            # That is exactly what this file did on its first run, and why it reported 7 failures
            # against a working build. A distinct URL forces a real navigation every time.
            sep = "&" if suffix else "?"
            url = f"http://127.0.0.1:{port}/{suffix}{sep}case={i}"
            # One retry before failing. The first run of this file after a cold Chrome reported
            # ?trace=0 as a dead editor; two subsequent runs passed 8/8, and a probe of that exact
            # URL came up clean. It was the 17 MB gui bundle still warming, not a regression - and a
            # test that calls that a product failure is worse than no test, because it teaches you
            # to ignore it.
            got = None
            for attempt in (1, 2):
                await c.goto(url, wait=8, settle=4)
                ok = False
                for _ in range(timeout_s // 3):
                    if await c.js("window.WLStudio && WLStudio.ready"):
                        ok = True
                        break
                    await asyncio.sleep(3)
                # Assert we are actually ON the document we asked for. A case can come back
                # ready=true while being the PREVIOUS case's page, which passes the readiness check
                # and then measures the wrong configuration - that is how ?only=trace was reported as
                # "everything on". The URL is the only reliable witness.
                here = await c.js("String(location.search)")
                on_right_page = f"case={i}" in (here or "")
                got = await measure(c, url)
                if ok and got["ready"] and on_right_page:
                    break
                if attempt == 1:
                    print(f"  ..   {name:<13} not ready on the first try; reloading")
            bad = [k for k, v in want.items() if got.get(k) != v]
            rows.append((name, got, bad))
            failed += bool(bad)
            mark = "ok  " if not bad else "FAIL"
            print(f"  {mark} {name:<13} ready={got['ready']!s:<5} assist={got['assist']!s:<5} "
                  f"trace={got['trace']!s:<5} blocks={got['blocks']!s:<5} cats={got['cats']}"
                  + ("" if not bad else "   <- " + ", ".join(
                      f"{k} expected {want[k]} got {got.get(k)}" for k in bad)))

        if do_turn:
            await c.goto(f"http://127.0.0.1:{port}/?case=turn", wait=8, settle=4)
            for _ in range(timeout_s // 3):
                if await c.js("window.WLStudio && WLStudio.ready"):
                    break
                await asyncio.sleep(3)
            await asyncio.sleep(4)
            await c.js("""(function(){var i=document.getElementById('wl-input');
                if(!i) return 0; i.value='按下空白鍵時角色說你好';
                var b=document.getElementById('wl-send'); if(b) b.click(); return 1;})()""")
            n = 0
            for _ in range(20):
                n = int(await c.js("(function(){var w=WLStudio.workspace();return w?w.getAllBlocks(false).length:0;})()") or 0)
                if n:
                    break
                await asyncio.sleep(2)
            print(f"\n  AI turn: {n} block(s) built")
            if n < 2:
                failed += 1
                print("  FAIL the assistant did not build anything")

        return failed, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8920)
    ap.add_argument("--turn", action="store_true", help="also drive one AI turn")
    ap.add_argument("--timeout", type=int, default=90)
    a = ap.parse_args()

    if not server_up(a.port):
        print(f"  no server on {a.port} - start server/studio_server.py first", file=sys.stderr)
        return 2
    print(f"  module matrix against http://127.0.0.1:{a.port}/")
    failed, rows = asyncio.run(run(a.port, a.turn, a.timeout))
    print()
    if failed:
        print(f"  {failed} case(s) failed")
        return 1
    print(f"  all {len(rows)} cases passed - no helper is load-bearing")
    return 0


if __name__ == "__main__":
    sys.exit(main())
