#!/usr/bin/env python3
"""First-load measurements for Wonder Lab Studio (headless Chrome via Playwright + CDP throttling).

    python3 test/perf.py [--base http://127.0.0.1:8920] [--runs 3]

"ready" = the editor has loaded the default project and the chat pane is usable (html[data-wl-ready]).
Profiles: local (no throttling), school Wi-Fi (20 Mbit/s, 40 ms RTT), slow device (same network + 4x CPU slowdown),
warm (second visit, HTTP cache). Writes test/out/perf.json; also lists the bytes per file of a cold load.
"""
import argparse, gzip, json, os, statistics, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "test", "out")
DIST = os.path.join(ROOT, "node_modules", "@scratch", "scratch-gui", "dist")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
PROFILES = {
    "local": None,
    "wifi_20mbit_40ms": {"latency": 40, "down": 20e6 / 8, "up": 5e6 / 8, "cpu": 1},
    "wifi_20mbit_cpu4x": {"latency": 40, "down": 20e6 / 8, "up": 5e6 / 8, "cpu": 4},
}


def load_once(br, base, prof, vp=(1440, 900), warm=False):
    ctx = br.new_context(viewport={"width": vp[0], "height": vp[1]})
    pg = ctx.new_page()
    if prof:
        cdp = ctx.new_cdp_session(pg)
        cdp.send("Network.enable")
        cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": prof["latency"],
                 "downloadThroughput": prof["down"], "uploadThroughput": prof["up"]})
        if prof["cpu"] > 1:
            cdp.send("Emulation.setCPUThrottlingRate", {"rate": prof["cpu"]})
    if warm:
        pg.goto(base + "/")
        pg.wait_for_selector('html[data-wl-ready="1"]', timeout=180000)
    t0 = time.time()
    pg.goto(base + "/")
    pg.wait_for_selector('html[data-wl-ready="1"]', timeout=180000)
    wall = time.time() - t0
    m = pg.evaluate("""() => { const n = performance.getEntriesByType('navigation')[0], rs = performance.getEntriesByType('resource');
        return {ready_ms: Math.round(WLStudio.readyAt), dcl_ms: Math.round(n.domContentLoadedEventEnd),
                transfer: rs.reduce((s, r) => s + (r.transferSize || 0), n.transferSize || 0),
                decoded: rs.reduce((s, r) => s + (r.decodedBodySize || 0), n.decodedBodySize || 0), requests: rs.length + 1,
                files: rs.map(r => ({url: r.name.replace(location.origin, ''), transfer: r.transferSize, decoded: r.decodedBodySize, ms: Math.round(r.duration)}))}; }""")
    m["wall_s"] = round(wall, 2)
    ctx.close()
    return m


def gz(path):
    with open(path, "rb") as f:
        raw = f.read()
    return len(raw), len(gzip.compress(raw, 9))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8920")
    ap.add_argument("--runs", type=int, default=3)
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    res = {"profiles": {}, "bundle": {}}
    for name in ("scratch-gui-standalone.js", "extension-worker.js"):
        r, g = gz(os.path.join(DIST, name))
        res["bundle"][name] = {"raw": r, "gzip9": g}
    for name in ("studio-pre.js", "studio.js", "studio-ops.js", "studio-trace.js", "studio.css", "index.html", "opcodes.json"):
        r, g = gz(os.path.join(ROOT, "src", name))
        res["bundle"][name] = {"raw": r, "gzip9": g}
    tot = lambda d: sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(d) for f in fs if not f.endswith(".map"))
    res["bundle"]["dist_total_without_maps"] = tot(DIST)
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=ARGS)
        for name, prof in PROFILES.items():
            runs = [load_once(br, a.base, prof) for _ in range(a.runs)]
            res["profiles"][name] = {"ready_ms_median": statistics.median(r["ready_ms"] for r in runs), "ready_ms": [r["ready_ms"] for r in runs],
                                     "transfer_bytes": runs[0]["transfer"], "decoded_bytes": runs[0]["decoded"], "requests": runs[0]["requests"]}
            if name == "local":
                res["cold_files"] = sorted(runs[0]["files"], key=lambda f: -(f["transfer"] or 0))[:12]
            print(name, res["profiles"][name], flush=True)
        warm = [load_once(br, a.base, PROFILES["wifi_20mbit_40ms"], warm=True) for _ in range(a.runs)]
        res["profiles"]["warm_cache_wifi"] = {"ready_ms_median": statistics.median(r["ready_ms"] for r in warm), "ready_ms": [r["ready_ms"] for r in warm],
                                              "transfer_bytes": warm[0]["transfer"]}
        print("warm_cache_wifi", res["profiles"]["warm_cache_wifi"], flush=True)
        ipad = [load_once(br, a.base, PROFILES["wifi_20mbit_cpu4x"], vp=(1024, 768)) for _ in range(a.runs)]
        res["profiles"]["ipad_1024_wifi_cpu4x"] = {"ready_ms_median": statistics.median(r["ready_ms"] for r in ipad), "ready_ms": [r["ready_ms"] for r in ipad]}
        print("ipad_1024_wifi_cpu4x", res["profiles"]["ipad_1024_wifi_cpu4x"], flush=True)
        br.close()
    with open(os.path.join(OUT, "perf.json"), "w") as f:
        json.dump(res, f, indent=1)
    print(json.dumps(res["bundle"], indent=1))


if __name__ == "__main__":
    main()
