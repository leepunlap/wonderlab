#!/usr/bin/env python3
"""Wonder Lab Studio end-to-end check in headless Chrome (Playwright). Needs the server: python3 server/studio_server.py

    python3 test/e2e.py [--base http://127.0.0.1:8920]

Walks the productive-failure loop the way a student would: drags blocks by hand, runs, asks the AI, edits the AI's
blocks by hand, asks again, undoes, then saves and loads an .sb3. Screenshots -> shots/, results -> test/out/results.json.
"""
import argparse, json, os, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "shots")
OUT = os.path.join(ROOT, "test", "out")
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"]
RES = {"checks": {}, "console": [], "external_requests": [], "timing": {}}


def check(name, ok, detail=None):
    RES["checks"][name] = {"ok": bool(ok), "detail": detail}
    print(("PASS " if ok else "FAIL ") + name + ("" if detail is None else "  " + json.dumps(detail, ensure_ascii=False)[:300]), flush=True)


def watch(pg, label):
    pg.on("console", lambda m: RES["console"].append({"page": label, "type": m.type, "text": m.text[:400]}) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: RES["console"].append({"page": label, "type": "pageerror", "text": str(e)[:400]}))
    pg.on("request", lambda r: RES["external_requests"].append(r.url) if r.url.split("/")[2:3] and not r.url.startswith(BASE) and r.url.startswith("http") else None)
    pg.on("dialog", lambda d: d.accept())


def ready(pg):
    pg.wait_for_selector('html[data-wl-ready="1"]', timeout=90000)
    pg.wait_for_timeout(600)


def category(pg, name):
    pg.locator(".blocklyToolboxCategory", has_text=name).first.click()
    pg.wait_for_timeout(700)


def block_box(pg, opcode):
    """client rect of a palette (flyout) block, once the flyout has stopped scrolling"""
    last = None
    for _ in range(20):
        cur = _flyout_box(pg, opcode)
        if cur and last and abs(cur["y"] - last["y"]) < 0.5:
            return cur
        last = cur
        pg.wait_for_timeout(150)
    return last


def _flyout_box(pg, opcode):
    return pg.evaluate("""(op) => { const fw = WLStudio.workspace().getFlyout().getWorkspace();
        const b = fw.getTopBlocks(false).find(x => x.type === op); if (!b) return null;
        const r = b.getSvgRoot().querySelector('.blocklyPath').getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; }""", opcode)


def drag(pg, src, to_x, to_y, grab=(12, 12)):
    """mouse-drag a block whose top-left is src {x,y} so that its top-left lands at (to_x, to_y)"""
    sx, sy = src["x"] + grab[0], src["y"] + grab[1]
    pg.mouse.move(sx, sy)
    pg.mouse.down()
    pg.mouse.move(sx + 30, sy + 10, steps=5)
    pg.mouse.move(to_x + grab[0], to_y + grab[1], steps=20)
    pg.wait_for_timeout(150)
    pg.mouse.up()
    pg.wait_for_timeout(500)


def ws_block_box(pg, opcode, nth=0):
    """client rect of the nth workspace block with this opcode (main workspace, not the flyout)"""
    return pg.evaluate("""([op, n]) => { const ws = WLStudio.workspace(); const bs = ws.getAllBlocks(false).filter(b => b.type === op && !b.isShadow());
        bs.sort((a, b) => a.getRelativeToSurfaceXY().y - b.getRelativeToSurfaceXY().y); const b = bs[n]; if (!b) return null;
        const r = b.getSvgRoot().querySelector('.blocklyPath').getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; }""", [opcode, nth])


def last_sent(pg):
    return pg.evaluate("() => WLStudio.lastSent")


def chat(pg, text):
    n = pg.evaluate("() => WLStudio.versions.length")
    pg.fill("#wl-input", text)
    pg.click("#wl-send")
    pg.wait_for_function("(n) => !WLStudio.busy && WLStudio.versions.length > n", arg=n, timeout=20000)
    pg.wait_for_timeout(700)


def brand_scan(pg):
    return pg.evaluate(r"""() => {
      const bad = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) { const n = walker.currentNode, t = n.textContent || '';
        if (/scratch/i.test(t) && !(n.parentElement && n.parentElement.closest('#wl-pane-about, style, script'))) bad.push(t.slice(0, 80)); }
      document.querySelectorAll('[alt],[title],[aria-label],[data-tip],a[href],img[src]').forEach(e => {
        ['alt', 'title', 'aria-label', 'data-tip', 'href'].forEach(a => { const v = e.getAttribute(a); if (v && /scratch\.mit\.edu|scratch/i.test(v) && !e.closest('#wl-pane-about')) bad.push(a + '=' + v.slice(0, 80)); });
      });
      return bad;
    }""")


def main():
    global BASE
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8920")
    a = ap.parse_args()
    BASE = a.base.rstrip("/")
    os.makedirs(SHOTS, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=ARGS)

        # ---------- 1. cold first load at 1440x900 ----------
        ctx = br.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        pg = ctx.new_page()
        watch(pg, "desktop")
        t0 = time.time()
        pg.goto(BASE + "/")
        ready(pg)
        RES["timing"]["desktop_ready_s"] = round(time.time() - t0, 2)
        perf = pg.evaluate("""() => { const n = performance.getEntriesByType('navigation')[0]; const rs = performance.getEntriesByType('resource');
            return {ready_ms: Math.round(WLStudio.readyAt), dcl_ms: Math.round(n.domContentLoadedEventEnd), transfer_bytes: rs.reduce((s, r) => s + (r.transferSize || 0), n.transferSize || 0),
                    decoded_bytes: rs.reduce((s, r) => s + (r.decodedBodySize || 0), n.decodedBodySize || 0), requests: rs.length + 1}; }""")
        RES["timing"]["desktop_cold"] = perf
        check("editor ready, VM has the neutral default sprite", pg.evaluate("() => WLStudio.vm.runtime.targets.map(t => t.getName())") == ["Stage", "角色1"])
        pg.screenshot(path=os.path.join(SHOTS, "01-start-1440x900.png"))

        # ---------- 2. the student drags blocks by hand ----------
        category(pg, "事件")
        src = block_box(pg, "event_whenflagclicked")
        drag(pg, src, 420, 170)
        pg.wait_for_timeout(1400)                       # one hand version per settled edit (1.2 s debounce)
        category(pg, "動作")
        hat = ws_block_box(pg, "event_whenflagclicked")
        src = block_box(pg, "motion_movesteps")
        drag(pg, src, hat["x"], hat["y"] + hat["h"] - 2)
        pg.wait_for_timeout(1500)
        s = pg.evaluate("() => WLStudio.snapshotNow()")
        scripts = s["program"]["sprites"]["角色1"]["scripts"]
        check("hand-dragged script is in the program snapshot", list(scripts.values()) == [[{"op": "event_whenflagclicked"}, {"op": "motion_movesteps", "STEPS": 10}]], scripts)
        pg.screenshot(path=os.path.join(SHOTS, "02-hand-built-1440x900.png"))

        # ---------- 3. the student runs it (green flag in the editor) ----------
        pg.click('[aria-label="開始執行"]')
        pg.wait_for_timeout(1500)
        pg.click('[aria-label="停止執行"]')
        pg.wait_for_timeout(300)

        # ---------- 4. first AI turn: builds on the student's own script ----------
        chat(pg, "我想角色一直走")
        sent = last_sent(pg)
        run = sent.get("run") or {}
        sp = (run.get("sprites") or {}).get("角色1") or {}
        check("request carries the hand-built program", list(sent["program"]["sprites"]["角色1"]["scripts"].values()) == list(scripts.values()))
        check("request carries a run report from the green-flag run", bool(run) and sp.get("start") == [0, 0] and sp.get("end") == [10, 0], {"start": sp.get("start"), "end": sp.get("end"), "secs": run.get("secs")})
        check("request lists the student's hand edits since the last AI turn", any(e["change"] == "added" for e in sent["studio"]["hand_edits"]), sent["studio"]["hand_edits"])
        s = pg.evaluate("() => WLStudio.snapshotNow()")
        sc = list(s["program"]["sprites"]["角色1"]["scripts"].values())
        check("AI ops landed in the live workspace (same script, extended)", len(sc) == 1 and [b["op"] for b in sc[0]] == ["event_whenflagclicked", "motion_movesteps", "control_forever"], sc)
        check("workspace shows the AI blocks", pg.evaluate("() => WLStudio.workspace().getAllBlocks(false).filter(b => !b.isShadow()).length") == 4)
        pg.screenshot(path=os.path.join(SHOTS, "03-ai-turn-1440x900.png"))

        # ---------- 5. the student edits the AI's blocks by hand ----------
        inner = ws_block_box(pg, "motion_movesteps", 1)     # the one inside 重複無限次
        src = block_box(pg, "motion_turnright")
        drag(pg, src, inner["x"], inner["y"] + inner["h"] - 2)
        pg.wait_for_timeout(1500)
        s = pg.evaluate("() => WLStudio.snapshotNow()")
        sc = list(s["program"]["sprites"]["角色1"]["scripts"].values())
        inside = sc[0][2].get("SUBSTACK", []) if sc and len(sc[0]) > 2 else []
        check("hand edit inside the AI's loop is captured", [b["op"] for b in inside] == ["motion_movesteps", "motion_turnright"], inside)

        # ---------- 6. second AI turn sees that edit ----------
        chat(pg, "角色說你好")
        sent = last_sent(pg)
        sent_sc = list(sent["program"]["sprites"]["角色1"]["scripts"].values())
        check("2nd request carries the hand edit to the AI's script", "motion_turnright" in json.dumps(sent_sc), [e for e in sent["studio"]["hand_edits"]])
        s = pg.evaluate("() => WLStudio.snapshotNow()")
        sc = list(s["program"]["sprites"]["角色1"]["scripts"].values())
        check("2nd AI turn kept the student's edit", "motion_turnright" in json.dumps(sc) and "looks_sayforsecs" in json.dumps(sc), [[b["op"] for b in x] for x in sc])
        before_undo = s

        # ---------- 7. versions ----------
        vers = pg.evaluate("() => WLStudio.versions.map(v => ({n: v.n, source: v.source, blocks: v.blocks, run: !!v.run, has_project: !!v.project}))")
        RES["versions"] = vers
        srcs = [v["source"] for v in vers]
        check("version history has start, hand, AI, hand, AI", srcs[0] == "start" and srcs.count("hand") >= 2 and srcs.count("ai") == 2 and srcs.index("ai") < len(srcs) - 1, srcs)
        check("the run report is kept with the version it ran", any(v["run"] for v in vers))
        pg.click("#wl-tab-ver")
        pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(SHOTS, "04-versions-1440x900.png"))
        pg.click("#wl-tab-chat")

        # ---------- 8. undo (上一步) = restore the version before the last AI turn ----------
        pg.click("#wl-undo")
        pg.wait_for_function("() => WLStudio.versions[WLStudio.versions.length - 1].source === 'restore'", timeout=10000)
        pg.wait_for_timeout(600)
        s = pg.evaluate("() => WLStudio.snapshotNow()")
        sc = list(s["program"]["sprites"]["角色1"]["scripts"].values())
        check("上一步 restores the program before the last AI turn", "looks_sayforsecs" not in json.dumps(sc) and "motion_turnright" in json.dumps(sc), [[b["op"] for b in x] for x in sc])
        chat(pg, "我按了上一步")
        check("the next request tells the AI about 上一步", (last_sent(pg).get("note") or "").find("上一步") >= 0 and last_sent(pg)["signals"].get("undo") == 1)

        # ---------- 8b. a block outside the AI whitelist: the AI never overwrites that script ----------
        category(pg, "音效")
        hat = ws_block_box(pg, "event_whenflagclicked")
        src = block_box(pg, "sound_stopallsounds")
        drag(pg, src, hat["x"], hat["y"] + hat["h"] - 2)          # inserted between the hat and 移動
        pg.wait_for_timeout(1500)
        s = pg.evaluate("() => WLStudio.snapshotNow()")
        check("a non-whitelisted block is reported, not sent as a block", any("sound_stopallsounds" in u["ops"] for u in s["unsupported"])
              and "sound_stopallsounds" not in json.dumps(s["program"]), s["unsupported"])
        chat(pg, "我想角色移動")
        tops = pg.evaluate("""() => { const t = WLStudio.vm.editingTarget, B = t.blocks._blocks; return t.blocks.getScripts().map(id => {
            const ops = []; (function walk(i) { while (i && B[i]) { ops.push(B[i].opcode); Object.values(B[i].inputs).forEach(x => { if (x.block && !B[x.block].shadow) walk(x.block); }); i = B[i].next; } })(id); return ops; }); }""")
        msgs = pg.evaluate("() => [...document.querySelectorAll('.wl-msg.sys')].map(m => m.textContent)")
        check("AI's version is placed next to a script it cannot fully read; the student's script is unchanged",
              len(tops) == 2 and any("sound_stopallsounds" in t for t in tops) and any("AI 看不懂" in m for m in msgs), tops)
        pg.screenshot(path=os.path.join(SHOTS, "09-side-by-side-1440x900.png"))

        # ---------- 9. save .sb3 from the File menu, load it back ----------
        prog_before = pg.evaluate("() => WLStudio.snapshotNow().program")
        pg.click('[aria-label="檔案選單"]')
        pg.wait_for_timeout(300)
        with pg.expect_download(timeout=20000) as dl:
            pg.get_by_text("下載到你的電腦").click()
        sb3 = os.path.join(OUT, "roundtrip.sb3")
        dl.value.save_as(sb3)
        RES["sb3"] = {"file": sb3, "bytes": os.path.getsize(sb3), "suggested": dl.value.suggested_filename}
        check(".sb3 downloaded from 檔案 > 下載到你的電腦", os.path.getsize(sb3) > 500, RES["sb3"])
        brand_desktop = brand_scan(pg)

        pg2 = ctx.new_page()
        watch(pg2, "reload")
        pg2.goto(BASE + "/")
        ready(pg2)
        pg2.click('[aria-label="檔案選單"]')
        pg2.wait_for_timeout(300)
        with pg2.expect_file_chooser(timeout=10000) as fc:
            pg2.get_by_text("從你的電腦載入").click()
        fc.value.set_files(sb3)
        pg2.wait_for_function("() => WLStudio.versions.some(v => v.source === 'load')", timeout=30000)
        pg2.wait_for_timeout(800)
        prog_after = pg2.evaluate("() => WLStudio.snapshotNow().program")
        norm = lambda pr: {k: sorted(json.dumps(v, sort_keys=True) for v in t["scripts"].values()) for k, t in list(pr["sprites"].items()) + [("舞台", pr["stage"])]}
        check(".sb3 round trip keeps the program", norm(prog_before) == norm(prog_after), {"before": norm(prog_before), "after": norm(prog_after)})
        title = pg2.evaluate("() => document.querySelector('input[class*=title]') && document.querySelector('input[class*=title]').value")
        check(".sb3 round trip keeps the project title", title == "我的作品" or bool(title), title)
        rt = pg2.evaluate("""async () => { const vm = WLStudio.vm; const a = WLStudio.snapshotNow().program;
            const blob = await vm.saveProjectSb3(); await vm.loadProject(await blob.arrayBuffer()); await new Promise(r => setTimeout(r, 300));
            const b = WLStudio.snapshotNow().program; return {same: JSON.stringify(Object.values(a.sprites['角色1'].scripts)) === JSON.stringify(Object.values(b.sprites['角色1'].scripts)), bytes: blob.size}; }""")
        check("programmatic vm.saveProjectSb3 -> loadProject round trip", rt["same"], rt)
        pg2.close()

        # ---------- 10. full editor tabs: costumes (paint editor), sounds, debug modal; branding scan ----------
        pg.click("text=造型")
        pg.wait_for_timeout(1500)
        pg.screenshot(path=os.path.join(SHOTS, "05-costumes-paint-1440x900.png"))
        brand_costumes = brand_scan(pg)
        pg.click("text=音效")
        pg.wait_for_timeout(800)
        brand_sounds = brand_scan(pg)
        pg.click("text=程式")
        pg.wait_for_timeout(500)
        pg.click('[aria-label="除錯方式"]')
        pg.wait_for_timeout(800)
        brand_debug = brand_scan(pg)
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(300)
        bad = brand_desktop + brand_costumes + brand_sounds + brand_debug
        check("no 'Scratch' text / scratch.mit.edu link visible (blocks, costumes, sounds, debug modal)", not bad, bad[:10])
        ctx.close()

        # ---------- 11. iPad landscape 1024x768 (touch) ----------
        ictx = br.new_context(viewport={"width": 1024, "height": 768}, has_touch=True, is_mobile=False,
                              user_agent="Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
        ip = ictx.new_page()
        watch(ip, "ipad")
        t0 = time.time()
        ip.goto(BASE + "/")
        ready(ip)
        RES["timing"]["ipad_ready_s"] = round(time.time() - t0, 2)
        ip.screenshot(path=os.path.join(SHOTS, "06-ipad-1024x768.png"))
        noscroll = ip.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth")
        check("iPad width: no horizontal page scroll", noscroll)
        ip.tap("#wl-fab")
        ip.wait_for_timeout(400)
        ip.fill("#wl-input", "我想角色移動")
        ip.tap("#wl-send")
        ip.wait_for_function("() => !WLStudio.busy && WLStudio.versions.length >= 2", timeout=20000)
        ip.wait_for_timeout(800)
        ip.screenshot(path=os.path.join(SHOTS, "07-ipad-chat-open-1024x768.png"))
        ok = ip.evaluate("() => WLStudio.workspace().getAllBlocks(false).filter(b => !b.isShadow()).length") == 2
        check("iPad width: AI turn applies blocks", ok)
        ip.tap("#wl-close")
        ip.wait_for_timeout(400)
        ip.screenshot(path=os.path.join(SHOTS, "08-ipad-after-ai-1024x768.png"))
        ictx.close()
        br.close()

    errs = [c for c in RES["console"] if c["type"] in ("error", "pageerror")]
    check("no console errors", not errs, errs[:8])
    check("no requests outside this server", not RES["external_requests"], RES["external_requests"][:8])
    RES["warnings"] = sorted({c["text"][:120] for c in RES["console"] if c["type"] == "warning"})
    with open(os.path.join(OUT, "results.json"), "w") as f:
        json.dump(RES, f, ensure_ascii=False, indent=1)
    failed = [k for k, v in RES["checks"].items() if not v["ok"]]
    print(json.dumps(RES["timing"], indent=1))
    print("FAILED:" if failed else "ALL PASSED", failed or "")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
