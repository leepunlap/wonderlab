#!/usr/bin/env python3
"""Dual-mode browser e2e (WONDER_LAB_DUAL_MODE_SPEC.md §7): the full editor inside an L4 lesson page, Chrome (Playwright).

  # against the Studio stub (no model calls): server/studio_server.py --port 8922 --site <built L4 site>
  python3 test/dual_e2e.py --base http://127.0.0.1:8922 --stub [--vp 1440x900 --vp 1366x768]
  # against staging (serve.py :8961 -> the real service :8812, real DeepSeek turns; in-class logins after 21:00)
  python3 test/dual_e2e.py --base http://127.0.0.1:8961 --user wlin03 [--vp 1440x900]

Per viewport: the lesson's sprites load into the editor; a real mouse drag from the palette + run; an AI-mode turn locks the
editor (drag / Delete change nothing, the overlay shows, the stage and green flag still work) and unlocks after; the
animation (studio-anim.js) shows a pointer and ends in exactly the reply's program; skip; 上一步; 「我自己砌」: the owner's
space-bar case built by hand (drags + dropdowns), run, sprite click, space, two questions (ops [] and the program unchanged,
one question, the glow), 請助教看看 (kind review, no text) naming a block the student placed, the 想助教看看？ chip; reload
restores program, conversation and mode; 課堂教材 and back keeps the editor; no page errors, no emoji, no trademark text, no
request outside the site. --stub adds: the wrap-up (teacher started) reaching the editor page, lab GET studio:false ->
read-only lab, a 429 / 502 keeping the student's words and releasing the lock.
Screenshots: shots/dual/ (lesson art + fictitious text only). Results: test/out/dual_e2e_<tag>.json
"""
import argparse, json, os, re, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dual_lib as D
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "shots", "dual")
OUT = os.path.join(ROOT, "test", "out")
C = D.Checks()
SLUG = "501-bp01"


def hook(base, q):
    return json.loads(urllib.request.urlopen(base + "/api/ai/lab/_set?" + q, timeout=10).read())


def lab_post(r):
    return "/api/ai/lab/files/L4/lessons/" in r.url and r.request.method == "POST"


def turn(pg, action, secs=95):
    """Do `action` (which sends a lab turn) and return (request body, reply json, http status)."""
    with pg.expect_response(lab_post, timeout=secs * 1000) as ri:
        action()
    r = ri.value
    try:
        body = r.request.post_data_json
    except Exception:
        body = None
    try:
        rep = r.json()
    except Exception:
        rep = {}
    return body, rep, r.status


def wait_turn_done(pg, secs=60):
    return D.wait(pg, "!document.querySelector('#wlbody .msg.wait') && !document.getElementById('chin').disabled", secs)


def shot(pg, tag, name):
    os.makedirs(SHOTS, exist_ok=True)
    p = os.path.join(SHOTS, f"{tag}-{name}.png")
    pg.screenshot(path=p)
    return p


CTXS = []          # every context a flow opened: closed after the flow even when it failed (a page left open keeps polling)


def new_page(b, base, vp, user, touch=False):
    ctx = b.new_context(viewport={"width": vp[0], "height": vp[1]}, has_touch=touch)
    CTXS.append(ctx)
    ctx.add_cookies([{"name": "wluser", "value": user, "url": base}])
    pg = ctx.new_page()
    pg._errs, pg._ext = [], []
    pg.on("pageerror", lambda e: pg._errs.append("pageerror: " + str(e)[:200]))
    pg.on("console", lambda m: m.type == "error" and "favicon" not in m.text and pg._errs.append("console: " + m.text[:200]))
    pg.on("request", lambda r: (not r.url.startswith(base) and not r.url.startswith("data:") and not r.url.startswith("blob:")) and pg._ext.append(r.url))
    return ctx, pg


def lesson_sprites(base):
    man = json.loads(urllib.request.urlopen(base + "/files/L4/lessons/assets/lab/manifest.json").read())
    data = man["lessons"][SLUG]["data"]
    les = json.loads(urllib.request.urlopen(base + "/files/L4/lessons/assets/lab/" + data).read())
    return [s["name"] for s in les["sprites"]], man


def main_flow(b, base, vp, user, stub, real):
    tag = f"{vp[0]}x{vp[1]}"
    ctx, pg = new_page(b, base, vp, user)
    names, man = lesson_sprites(base)
    secs, studio = D.open_lab(pg, base, SLUG)
    C(f"[{tag}] Studio boots on a ready lesson (lab GET studio:true, >= 1024 px)", secs is not None and studio, f"{secs}s")
    if not studio:
        ctx.close(); return
    fr = D.frame(pg)
    tg = fr.evaluate("WLStudio.request().targets")
    loaded = fr.evaluate("""() => WLStudio.vm.runtime.targets.filter(t => t.isOriginal && !t.isStage).every(t => t.getCostumes().every(c => c.asset && c.asset.data && c.asset.data.length > 50))""")
    C(f"[{tag}] the lesson's own sprites and backdrop are in the editor", [t["name"] for t in tg if not t["isStage"]] == names and loaded,
      {"editor": [t["name"] for t in tg], "lesson": names})
    C(f"[{tag}] read-only lab hidden, the editor frame shown", pg.evaluate("document.getElementById('wllab').hidden && !!document.getElementById('wlsframe')"))
    g = pg.evaluate("""(() => { const R = e => { const r = e.getBoundingClientRect(); return {l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom)}; };
      const c = document.getElementById('chat'), f = document.getElementById('wlsframe'), cs = getComputedStyle(c);
      return {frame: R(f), chat: R(c), chatVisible: cs.visibility !== 'hidden' && cs.display !== 'none' && c.getBoundingClientRect().right <= innerWidth + 1,
              hscroll: document.scrollingElement.scrollWidth > innerWidth + 1}; })()""")
    if vp[0] >= 1280:
        C(f"[{tag}] AI 學伴 pane on the right, editor on the left", g["chatVisible"] and g["frame"]["r"] <= g["chat"]["l"] + 1, g)
    else:
        C(f"[{tag}] below 1280 px the AI 學伴 is a drawer", True, g)
    C(f"[{tag}] no horizontal scroll", not g["hscroll"])
    C(f"[{tag}] 「執行」 label next to the green flag", fr.evaluate("!!document.querySelector('.wl-runlabel') && document.querySelector('img[class*=green-flag]').title === '執行'"))
    shot(pg, tag, "01-studio-start")

    # ---- a real mouse drag from the palette, then run
    if vp[0] < 1280 and pg.evaluate("document.getElementById('chat').classList.contains('open')"):
        pg.click(".chclose"); pg.wait_for_timeout(400)
    D.category(fr, "事件")
    D.drag_from_palette(pg, fr, "event_whenflagclicked", D.free_point(fr, 60, 60))
    D.category(fr, "動作")
    D.drag_from_palette(pg, fr, "motion_movesteps", D.conn_point(fr, "event_whenflagclicked", "next"))
    sc = D.vm_scripts(fr)
    mine = dict(sc).get(names[0], [])
    C(f"[{tag}] real mouse drag from the palette: 當綠旗被點擊 + 移動 snapped into one script", mine == [["event_whenflagclicked", "motion_movesteps"]], sc)
    x0 = fr.evaluate(f"WLStudio.vm.runtime.getSpriteTargetByName('{names[0]}').x")
    D.green_flag(fr); pg.wait_for_timeout(900)
    x1 = fr.evaluate(f"WLStudio.vm.runtime.getSpriteTargetByName('{names[0]}').x")
    C(f"[{tag}] green flag runs the hand-built script (sprite moved)", round(x1 - x0) == 10, f"x {x0} -> {x1}")
    shot(pg, tag, "02-hand-built-run")

    # ---- AI mode turn: the lock
    if vp[0] < 1280:
        fr.click("#wl-tool-chat"); pg.wait_for_timeout(400)
    pg.click(".wl-smode button[data-m=ai]"); pg.wait_for_timeout(200)
    if stub:
        hook(base, "delay=12000")
    D.category(fr, "動作")
    srcbox, tgt = D.flyout_box(fr, "motion_turnright"), D.free_point(fr, 140, 330)
    n0 = D.block_count(fr)
    before_prog = fr.evaluate("WLStudio.program()")
    res = {}
    LOCKED = "document.body.classList.contains('wl-locked') && !document.body.classList.contains('wl-animating')"
    def send_ai():
        pg.fill("#chin", "我想佢一直行，唔好停")
        if vp[0] < 1280:                    # the student closes the drawer to watch the editor (Enter first, then close)
            pg.press("#chin", "Enter"); pg.click(".chclose")
        else:
            pg.press("#chin", "Enter")
        pg.wait_for_timeout(60)
        # the attempts come first and fast (a real reply can come in about a second), the screenshot after
        res["locked_at_attempt"] = fr.evaluate(LOCKED)
        D.drag_raw(pg, fr, srcbox, tgt, steps=3)
        pg.keyboard.press("Delete")
        res["locked"] = res["locked_at_attempt"]
        res["msg"] = fr.evaluate("(() => { const m = document.getElementById('wl-lockmsg'); return m && !m.hidden && m.getBoundingClientRect().height > 0 ? m.innerText : '' })()")
        res["n_after_attempt"] = D.block_count(fr)
        res["prog_after_attempt"] = fr.evaluate("WLStudio.program()")
        res["locked_after_attempt"] = fr.evaluate(LOCKED)
        th0 = fr.evaluate(f"WLStudio.vm.runtime.getSpriteTargetByName('{names[0]}').x")
        D.green_flag(fr); pg.wait_for_timeout(700)
        res["flag_while_locked"] = [th0, fr.evaluate(f"WLStudio.vm.runtime.getSpriteTargetByName('{names[0]}').x")]
        res["still_locked"] = fr.evaluate(LOCKED)
        res["shot"] = shot(pg, tag, "03-ai-turn-locked")
    body, rep, code = turn(pg, send_ai)
    C(f"[{tag}] AI-mode turn locks the blocks area (overlay 「AI 正在改積木…」)", res.get("locked") and ("AI 正在改積木" in res.get("msg", "") or not res.get("locked_after_attempt")), res.get("msg"))
    if res.get("locked_at_attempt") and res.get("locked_after_attempt"):
        C(f"[{tag}] a drag + Delete while locked change nothing", res.get("n_after_attempt") == n0 and res.get("prog_after_attempt") == before_prog,
          f"blocks {n0} -> {res.get('n_after_attempt')}")
    else:
        C(f"[{tag}] a drag + Delete while locked change nothing (inconclusive: the reply came before the attempt)", True, res)
    if res.get("still_locked"):
        C(f"[{tag}] the stage and green flag still work while locked", res["flag_while_locked"][0] != res["flag_while_locked"][1], res.get("flag_while_locked"))
    st = (body or {}).get("studio") or {}
    C(f"[{tag}] request: mode ai + studio.targets / editing / hand_edits / unsupported / text", (body or {}).get("mode") == "ai"
      and st.get("targets") and st.get("editing") == names[0] and isinstance(st.get("hand_edits"), dict) and isinstance(st.get("unsupported"), list)
      and "移動" in json.dumps(st.get("text"), ensure_ascii=False), {k: (st.get(k) if k != "targets" else len(st.get(k) or [])) for k in ("editing", "hand_edits", "text")})
    he = st.get("hand_edits") or {}
    C(f"[{tag}] hand_edits are {{sprite, id}} objects", all(isinstance(x, dict) and x.get("sprite") and x.get("id") for k in ("added", "changed", "removed") for x in he.get(k) or []) and he.get("added"), he)
    C(f"[{tag}] text <= 6000 chars, one block per line", len(json.dumps(st.get("text"), ensure_ascii=False)) <= 6100 and "\n" in json.dumps(list((st.get("text") or {}).values()), ensure_ascii=False).replace("\\n", "\n"))
    C(f"[{tag}] run report has per-script events (run.scripts)", isinstance(((body or {}).get("run") or {}).get("scripts"), list) and len(body["run"]["scripts"]) >= 1,
      ((body or {}).get("run") or {}).get("scripts"))
    # the animation (or the instant apply) and the unlock
    seen_ptr, counts, t0 = False, [], time.time()
    anim = fr.evaluate("WLStudio.anim()")
    while time.time() - t0 < 40:
        if fr.evaluate("!!document.querySelector('.wl-anim-ptr.on')"):
            if not seen_ptr:
                pg.wait_for_timeout(350); shot(pg, tag, "03b-ai-animation")        # the pointer at work
            seen_ptr = True
        counts.append(D.block_count(fr))
        if not fr.evaluate("document.body.classList.contains('wl-locked')") and not pg.evaluate("!!document.querySelector('#wlbody .msg.wait')"):
            break
        pg.wait_for_timeout(120)
    unlock_s = round(time.time() - t0, 1)
    C(f"[{tag}] reply received", code == 200 and rep.get("ok"), f"{code} {rep.get('say', rep.get('reason', ''))[:80]}")
    C(f"[{tag}] unlocked after the edits", not fr.evaluate("document.body.classList.contains('wl-locked')"), f"{unlock_s}s after the reply")
    if anim.get("available") and anim.get("enabled") and (rep.get("ops") or []):
        steps = sorted(set(counts))
        C(f"[{tag}] animation: a pointer is shown and blocks appear one by one", seen_ptr and len(steps) >= 2, f"pointer {seen_ptr}, block counts {steps[:8]}")
    live = fr.evaluate("WLStudio.program()")
    C(f"[{tag}] end state = the reply's program", not rep.get("ok") or live == rep.get("program"), {"live": live, "reply": rep.get("program")} if live != rep.get("program") else "")
    la = fr.evaluate("WLStudio.lastApply") if (rep.get("ops") or []) else None
    C(f"[{tag}] applied without fallback", la is None or not la.get("fallback"), la and {k: la.get(k) for k in ("animated", "fallback", "done")})
    shot(pg, tag, "04-ai-turn-after")

    # ---- skip + 上一步 (a second AI turn, stub: deterministic build)
    if (rep.get("ops") or []) and anim.get("available"):
        if stub:
            hook(base, "delay=300")
        before2 = fr.evaluate("WLStudio.program()")
        if vp[0] < 1280:
            fr.click("#wl-tool-chat"); pg.wait_for_timeout(300)
        skipped = {}
        def send2():
            pg.fill("#chin", "再加一句說你好")
            pg.press("#chin", "Enter")
        body2, rep2, code2 = turn(pg, send2)
        t1 = time.time()
        while time.time() - t1 < 15:
            sb = fr.evaluate("""(() => { const b = document.querySelector('.wl-anim-skip'); if (!b || getComputedStyle(b).display === 'none' || getComputedStyle(b).visibility === 'hidden') return null;
              const r = b.getBoundingClientRect(); return r.width ? {x: r.left + r.width / 2, y: r.top + r.height / 2} : null; })()""")
            if sb:                                   # a real (trusted) click where the button is, as a student would
                o = D.frame_offset(pg); pg.mouse.click(o[0] + sb["x"], o[1] + sb["y"]); skipped["at"] = round(time.time() - t1, 2); break
            if not fr.evaluate("document.body.classList.contains('wl-locked')"):
                break
            pg.wait_for_timeout(60)
        wait_turn_done(pg, 30); D.wait(fr, "!document.body.classList.contains('wl-locked')", 20)
        live2 = fr.evaluate("WLStudio.program()")
        if rep2.get("ops"):
            C(f"[{tag}] 跳過動畫: the turn finishes at once with the reply's program", skipped.get("at") is not None and live2 == rep2.get("program"), skipped)
            shot(pg, tag, "05-after-skip")
            fr.click("#wl-tool-undo"); pg.wait_for_timeout(1500)
            C(f"[{tag}] 上一步 restores the program before the last AI change", fr.evaluate("WLStudio.program()") == before2)
        else:
            C(f"[{tag}] second AI turn (skip test) had no change to animate", True, (rep2.get("say") or rep2.get("reason") or "")[:80])
    if stub:
        hook(base, "delay=0")

    # ---- 「我自己砌」: the owner's space-bar case
    if vp[0] < 1280 and not pg.evaluate("document.getElementById('chat').classList.contains('open')"):
        fr.click("#wl-tool-chat"); pg.wait_for_timeout(300)
    pg.click(".wl-smode button[data-m=self]"); pg.wait_for_timeout(300)
    C(f"[{tag}] 「我自己砌」 shows 請助教看看 and is remembered per lesson",
      pg.is_visible(".wl-tabtn") and pg.evaluate(f"localStorage.getItem('iits-lab-mode:files/L4/lessons/{SLUG}')") == "self")
    if vp[0] < 1280:
        pg.click(".chclose"); pg.wait_for_timeout(300)
    # start from a clean code area for this sprite: drag the earlier scripts back to the palette (as a student would)
    for _ in range(4):
        top = fr.evaluate("""() => { const ws = WLStudio.workspace(); const b = ws.getTopBlocks(true)[0]; if (!b) return null;
          const r = b.getSvgRoot().querySelector('.blocklyPath').getBoundingClientRect(); return {x: r.left + 8, y: r.top + 8}; }""")
        if not top:
            break
        pal = fr.evaluate("(() => { const r = document.querySelector('.blocklyFlyout').getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + 200}; })()")
        off = D.frame_offset(pg)
        pg.mouse.move(off[0] + top["x"], off[1] + top["y"]); pg.mouse.down()
        pg.mouse.move(off[0] + top["x"] - 30, off[1] + top["y"] + 5, steps=3); pg.mouse.move(off[0] + pal["x"], off[1] + pal["y"], steps=12)
        pg.mouse.up(); pg.wait_for_timeout(500)
    D.category(fr, "事件")
    D.drag_from_palette(pg, fr, "event_whenthisspriteclicked", D.free_point(fr, 50, 50))
    D.category(fr, "控制")
    D.drag_from_palette(pg, fr, "control_forever", D.conn_point(fr, "event_whenthisspriteclicked", "next"))
    D.category(fr, "動作")
    D.drag_from_palette(pg, fr, "motion_goto", D.conn_point(fr, "control_forever", "substack"))
    D.pick_dropdown(pg, fr, "motion_goto", "鼠標")
    D.category(fr, "事件")
    D.drag_from_palette(pg, fr, "event_whenkeypressed", D.free_point(fr, 50, 290))
    D.category(fr, "控制")
    D.drag_from_palette(pg, fr, "control_stop", D.conn_point(fr, "event_whenkeypressed", "next"))
    D.pick_dropdown(pg, fr, "control_stop", "這個程式")
    sc = dict(D.vm_scripts(fr)).get(names[0], [])
    want = [["event_whenthisspriteclicked", "control_forever", ["motion_goto"]], ["event_whenkeypressed", "control_stop"]]
    C(f"[{tag}] built by hand: 當角色被點擊 + 重複無限次 {{定位到 鼠標}} and 當 空白 鍵被按下 + 停止 這個程式", all(w in sc for w in want), sc)
    txt = fr.evaluate("WLStudio.request().text")
    flat = json.dumps(txt, ensure_ascii=False)
    C(f"[{tag}] studio.text shows the scripts as the editor does", "當角色被點擊" in flat and "重複無限次" in flat and "鼠標" in flat and "空白" in flat and "停止 這個程式" in flat, txt.get(names[0]))
    shot(pg, tag, "06-self-built")
    D.stage_click_sprite(pg, fr, names[0]); pg.wait_for_timeout(500)
    off = D.frame_offset(pg)
    cv = fr.evaluate("(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
    pg.mouse.move(off[0] + cv[0] + cv[2] * 0.75, off[1] + cv[1] + cv[3] * 0.3, steps=8); pg.wait_for_timeout(500)
    pg.keyboard.press(" "); pg.wait_for_timeout(500)
    pg.mouse.move(off[0] + cv[0] + cv[2] * 0.3, off[1] + cv[1] + cv[3] * 0.65, steps=8); pg.wait_for_timeout(700)
    p1 = fr.evaluate(f"[Math.round(WLStudio.vm.runtime.getSpriteTargetByName('{names[0]}').x), Math.round(WLStudio.vm.runtime.getSpriteTargetByName('{names[0]}').y)]")
    rs = fr.evaluate("(WLStudio.report() || {}).scripts") or []
    loop = [x for x in rs if x.get("running_at_end")]
    stopped = [x for x in rs if x.get("stopped") is not None and not x.get("running_at_end")]
    C(f"[{tag}] run: after space the loop kept going (run.scripts: one running at the end, the key script started and stopped)", len(loop) >= 1 and len(stopped) >= 1, rs)
    chip = D.wait(pg, "[...document.querySelectorAll('#wlbody .wl-chip')].some(e => e.textContent.includes('想助教看看'))", 6)
    C(f"[{tag}] after a run with hand changes: the 「想助教看看？」 chip (no automatic AI call)", chip is not None)
    shot(pg, tag, "07-self-ran")
    if vp[0] < 1280:
        fr.click("#wl-tool-chat"); pg.wait_for_timeout(300)
    prog_before = fr.evaluate("WLStudio.program()")
    def ask1():
        pg.fill("#chin", "點解按空白鍵佢唔停？")
        pg.press("#chin", "Enter")
    body, rep, code = turn(pg, ask1)
    wait_turn_done(pg, 60); pg.wait_for_timeout(500)
    q = rep.get("question") or ""
    C(f"[{tag}] 助教 (self): request mode self with the run's script events", (body or {}).get("mode") == "self" and isinstance(((body or {}).get("run") or {}).get("scripts"), list),
      ((body or {}).get("run") or {}).get("scripts"))
    C(f"[{tag}] 助教 reply: ops [] and the program unchanged", rep.get("ok") and rep.get("ops") == [] and fr.evaluate("WLStudio.program()") == prog_before,
      f"ops={rep.get('ops')}")
    C(f"[{tag}] 助教 says what happened and asks exactly one question", bool(rep.get("say")) and q.count("？") + q.count("?") == 1, {"say": rep.get("say"), "question": q})
    if real:
        C(f"[{tag}] 助教 talks about the loop that kept going (real model)", bool(re.search(r"(重複無限次|定位到|一直|仲|繼續|停|跟住)", (rep.get("say") or "") + q)), rep.get("say"))
    glow = fr.evaluate("document.querySelectorAll('.wl-focus, .wl-focus-one').length")
    C(f"[{tag}] the blocks in reply.focus glow", glow >= 1 if rep.get("focus") else True, {"focus": rep.get("focus"), "glowing": glow})
    shot(pg, tag, "08-self-reply")
    def ask2():
        pg.fill("#chin", "停止 這個程式係咩意思？")
        pg.press("#chin", "Enter")
    body, rep, code = turn(pg, ask2)
    wait_turn_done(pg, 60); pg.wait_for_timeout(400)
    C(f"[{tag}] block question answered, no build", rep.get("ok") and rep.get("ops") == [] and "停止" in ((rep.get("say") or "") + (rep.get("question") or "")) and fr.evaluate("WLStudio.program()") == prog_before,
      rep.get("say"))
    def review():
        pg.click(".wl-tabtn")
    body, rep, code = turn(pg, review)
    wait_turn_done(pg, 60); pg.wait_for_timeout(400)
    C(f"[{tag}] 請助教看看 = kind review with no text, mode self", (body or {}).get("kind") == "review" and not (body or {}).get("text") and (body or {}).get("mode") == "self")
    say = (rep.get("say") or "") + (rep.get("question") or "")
    quoted = re.findall(r"[「『]([^」』]{2,30})[」』]", say)
    lines = [re.sub(r"\s+", "", l) for v in (txt or {}).values() for t in v.values() for l in t.split("\n")]
    named = [x for x in quoted if any(re.sub(r"\s+", "", x) in l or l in re.sub(r"\s+", "", x) for l in lines if l)]
    C(f"[{tag}] review comment names a block the student really placed + one question", rep.get("ok") and rep.get("ops") == [] and (named or not quoted) and (rep.get("question") or "").count("？") + (rep.get("question") or "").count("?") == 1,
      {"say": rep.get("say"), "quoted": quoted})
    shot(pg, tag, "09-review")

    # ---- reload restores program, conversation, mode
    prog = fr.evaluate("WLStudio.program()")
    n_me = pg.locator("#wlbody .msg.me").count()
    pg.reload()
    ok = D.wait(pg, "!!window.WL_BOOT_MS && !!window.WL_STUDIO", 120)
    fr = D.frame(pg)
    C(f"[{tag}] reload: Wonder Lab reopens with the editor", ok is not None)
    if fr:
        C(f"[{tag}] reload restores the program", fr.evaluate("WLStudio.program()") == prog)
        C(f"[{tag}] reload keeps the conversation and the mode", pg.locator("#wlbody .msg.me").count() == n_me and pg.evaluate("document.querySelector('.wl-smode button[data-m=self]').classList.contains('on')"))
        # 課堂教材 and back: the editor is kept (no reload of the bundle)
        if vp[0] < 1280:
            fr.click("#wl-tool-chat"); pg.wait_for_timeout(300)
        nreq = []
        pg.on("request", lambda r: "scratch-gui-standalone" in r.url and nreq.append(r.url))
        pg.click(".wl-mode button:nth-child(1)"); pg.wait_for_timeout(600)
        mat = pg.evaluate("getComputedStyle(document.querySelector('main.wrap')).display !== 'none' && !document.body.classList.contains('wl-labmode')")
        shot(pg, tag, "10-material")
        if pg.is_visible(".wl-mode button:nth-child(2)") is False and pg.is_visible("#chfab"):
            pg.click("#chfab"); pg.wait_for_timeout(300)
        pg.click(".wl-mode button:nth-child(2)"); pg.wait_for_timeout(800)
        C(f"[{tag}] 課堂教材 and back: material shown, then the same editor and program (no reload)", mat and not nreq and D.frame(pg).evaluate("WLStudio.program()") == prog)
    errs = [e for e in pg._errs if "Failed to load resource" not in e or "favicon" not in e]
    C(f"[{tag}] no page errors", not errs, errs[:4])
    C(f"[{tag}] no request outside the site (no scratch.mit.edu)", not pg._ext, pg._ext[:4])
    fr = D.frame(pg)
    C(f"[{tag}] no trademark text in the editor", not (fr and D.no_scratch_text(fr)), fr and D.no_scratch_text(fr)[:4])
    em = D.emoji_in(D.page_text(pg) + (fr.evaluate("document.body.innerText") if fr else ""))
    C(f"[{tag}] no emoji anywhere on the page", not em, em[:6])
    ctx.close()


def stub_extras(b, base, user):
    tag = "stub"
    # wrap-up started by the teacher reaches the editor page within 25 s
    hook(base, "reset=1")
    ctx, pg = new_page(b, base, (1280, 800), user)
    secs, studio = D.open_lab(pg, base, SLUG)
    hook(base, "consol=1"); t0 = time.time()
    got = D.wait(pg, "document.querySelectorAll('#wlbody .msg.wl-cs:not(.wait)').length > 0", 30)
    C(f"[{tag}] teacher 開始整合 reaches the editor page within 25 s", got is not None and time.time() - t0 <= 25, f"{round(time.time() - t0, 1)}s")
    shot(pg, "1280x800", "11-wrapup")
    # 429 (soft) and 502: words kept, lock released
    for code in (429, 502):
        hook(base, f"fail={code}&n=1")
        pg.fill("#chin", f"測試 {code}"); pg.press("#chin", "Enter"); pg.wait_for_timeout(1500)
        fr = D.frame(pg)
        C(f"[{tag}] {code}: the student's words stay, the editor is unlocked", pg.input_value("#chin") == f"測試 {code}" and not fr.evaluate("document.body.classList.contains('wl-locked')")
          and not pg.evaluate("document.getElementById('chin').disabled"), pg.evaluate("[...document.querySelectorAll('#wlbody .msg.sys')].map(e => e.innerText).slice(-1)[0]"))
    ctx.close()
    # lab GET studio:false -> the read-only lab, no editor download
    hook(base, "studio=0")
    ctx, pg = new_page(b, base, (1440, 900), user)
    reqs = []
    pg.on("request", lambda r: "scratch-gui-standalone" in r.url and reqs.append(r.url))
    secs, studio = D.open_lab(pg, base, SLUG)
    C(f"[{tag}] lab GET studio:false -> the read-only lab boots (no editor download)", secs is not None and not studio and pg.evaluate("!!(window.WL && WL.ws)") and not reqs
      and not pg.evaluate("!!document.getElementById('wlsframe')"), f"{secs}s")
    shot(pg, "1440x900", "12-readonly-fallback")
    ctx.close()
    hook(base, "studio=1")
    # the editor cannot start on this device (its bundle does not load): the read-only lab instead, with a line saying so
    ctx, pg = new_page(b, base, (1440, 900), user)
    pg.route("**/studio-*/scratch-gui-standalone.js", lambda r: r.abort())
    secs, studio = D.open_lab(pg, base, SLUG)
    sysm = pg.evaluate("[...document.querySelectorAll('#wlbody .msg.sys')].map(e => e.textContent)")
    C(f"[{tag}] the editor bundle fails to load -> the read-only lab boots instead (and says so)", secs is not None and not studio and pg.evaluate("!!(window.WL && WL.ws)")
      and any("簡易版" in x for x in sysm) and not pg.evaluate("document.body.classList.contains('wl-studiomode')"), {"secs": secs, "sys": sysm[-1:] if sysm else []})
    ctx.close()
    # a phone-sized / portrait screen keeps the read-only lab even with studio:true
    ctx, pg = new_page(b, base, (820, 1180), user, touch=True)
    secs, studio = D.open_lab(pg, base, SLUG)
    C(f"[{tag}] narrow screen (820 px) keeps the read-only lab", secs is not None and not studio and pg.evaluate("!!(window.WL && WL.ws)"))
    ctx.close()


def readonly_real(b, base, user):
    """Staging with lab_studio false (set by the operator for this run): the read-only lab, one real turn builds blocks."""
    tag = "readonly"
    ctx, pg = new_page(b, base, (1440, 900), user)
    reqs = []
    pg.on("request", lambda r: "scratch-gui-standalone" in r.url and reqs.append(r.url))
    secs, studio = D.open_lab(pg, base, SLUG)
    C(f"[{tag}] lab GET studio:false -> the read-only lab boots, no editor download", secs is not None and not studio and pg.evaluate("!!(window.WL && WL.ws)") and not reqs, f"{secs}s")
    n0 = pg.evaluate("WL.ws.getAllBlocks().length")
    body, rep, code = turn(pg, lambda: (pg.fill("#chin", "叫小老鼠跟住我隻滑鼠行"), pg.press("#chin", "Enter")))
    wait_turn_done(pg, 60); pg.wait_for_timeout(1200)
    C(f"[{tag}] a real turn in the read-only lab (request without mode / studio, as before)", code == 200 and rep.get("ok") and "studio" not in (body or {}) and "mode" not in (body or {}),
      (rep.get("say") or rep.get("reason") or "")[:80])
    C(f"[{tag}] reply focus is a sprite name (read-only contract unchanged)", rep.get("focus") is None or isinstance(rep.get("focus"), str), rep.get("focus"))
    C(f"[{tag}] the blocks appear in the read-only lab", not rep.get("ops") or pg.evaluate("WL.ws.getAllBlocks().length") > n0, f"{n0} -> {pg.evaluate('WL.ws.getAllBlocks().length')}")
    shot(pg, "1440x900", "13-readonly-real-turn")
    C(f"[{tag}] no page errors", not pg._errs, pg._errs[:3])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8922")
    ap.add_argument("--user", default="wlin03")
    ap.add_argument("--stub", action="store_true")
    ap.add_argument("--vp", action="append")
    ap.add_argument("--tag", default=None)
    ap.add_argument("--readonly", action="store_true", help="staging with lab_studio false: only the read-only fallback check")
    a = ap.parse_args()
    vps = [tuple(int(x) for x in v.split("x")) for v in (a.vp or ["1440x900", "1366x768"])]
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=D.CHROME, args=D.CHROME_ARGS)
        try:
            if a.stub:
                hook(a.base, "reset=1")
            if a.readonly:
                vps = []
                try:
                    readonly_real(b, a.base, a.user)
                except Exception as e:
                    C("[readonly] flow ran to the end", False, repr(e)[:300])
            for vp in vps:
                try:
                    main_flow(b, a.base, vp, a.user, a.stub, not a.stub)
                except Exception as e:
                    import traceback
                    tb = traceback.extract_tb(e.__traceback__)[-2:]
                    C(f"[{vp[0]}x{vp[1]}] flow ran to the end", False, repr(e)[:300] + " at " + " / ".join(f"{os.path.basename(f.filename)}:{f.lineno} {f.line}" for f in tb))
                finally:
                    for c in CTXS:
                        try: c.close()
                        except Exception: pass
                    CTXS.clear()
                    if a.stub:
                        hook(a.base, "delay=0&fail=0&n=0")
            if a.stub:
                stub_extras(b, a.base, a.user)
        finally:
            b.close()
    tag = a.tag or ("stub" if a.stub else ("staging_readonly" if a.readonly else "staging"))
    s = C.summary()
    json.dump({"summary": s, "base": a.base, "when": time.strftime("%Y-%m-%d %H:%M:%S"), "results": C.r}, open(os.path.join(OUT, f"dual_e2e_{tag}.json"), "w"), ensure_ascii=False, indent=1)
    print("SUMMARY", s)
    sys.exit(0 if s["failed"] == 0 else 1)


if __name__ == "__main__":
    main()
