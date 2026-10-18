#!/usr/bin/env python3
"""Shared helpers for the dual-mode browser tests (the full editor inside an L4 lesson page).

The editor runs in an iframe (#wlsframe, lab-frame.html) inside the lesson page; the AI 學伴 pane is the lesson page's own
#chat. Mouse actions use page coordinates (Playwright's page.mouse): a real drag from the palette into the code area is a
trusted pointer sequence, exactly as a student's.  Copyright (C) 2026 IITS. AGPL-3.0-only.
"""
import json, os, re, time

CHROME = "/usr/bin/google-chrome"
CHROME_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"]
READY_JS = "!!document.querySelector('.wl-mode') && !document.querySelector('.wl-mode button:nth-child(2)').disabled"

# emoji-capable code points (Unicode emoji-data), non-ASCII only
EMOJI = set()
try:
    for line in open("/usr/share/unicode/emoji/emoji-data.txt"):
        line = line.split("#")[0].strip()
        if not line:
            continue
        rng, prop = [x.strip() for x in line.split(";")]
        if prop not in ("Emoji", "Extended_Pictographic", "Emoji_Component"):
            continue
        a, _, b = rng.partition(".."); a = int(a, 16); b = int(b, 16) if b else a
        EMOJI.update(c for c in range(a, b + 1) if c >= 0x80)
except OSError:
    EMOJI.update(range(0x1F300, 0x1FAFF))


def emoji_in(s):
    return sorted({f"U+{ord(c):04X}" for c in s if ord(c) in EMOJI})


class Checks:
    def __init__(self):
        self.r = []

    def __call__(self, name, ok, info=""):
        self.r.append({"check": name, "ok": bool(ok), "info": info if isinstance(info, str) else json.dumps(info, ensure_ascii=False)[:600]})
        print(("PASS " if ok else "FAIL ") + name + (f"  ({self.r[-1]['info']})" if info not in ("", None) else ""), flush=True)
        return ok

    def summary(self):
        return {"checks": len(self.r), "failed": sum(not x["ok"] for x in self.r)}


def wait(pg, js, secs=30, arg=None):
    t0 = time.time()
    while time.time() - t0 < secs:
        try:
            if (pg.evaluate(js, arg) if arg is not None else pg.evaluate(js)):
                return round(time.time() - t0, 2)
        except Exception:
            pass
        time.sleep(0.2)
    return None


def frame(pg):
    for f in pg.frames:
        if "lab-frame.html" in (f.url or ""):
            return f
    return None


def open_lab(pg, base, slug="501-bp01", secs=120):
    """Open the lesson page, switch to Wonder Lab; returns (seconds to ready, studio?)."""
    pg.goto(f"{base}/files/L4/lessons/{slug}/index.html")
    wait(pg, READY_JS, 30)
    if not pg.is_visible(".wl-mode button:nth-child(2)") and pg.is_visible("#chfab"):
        pg.click("#chfab"); pg.wait_for_timeout(300)
    t0 = time.time()
    pg.click(".wl-mode button:nth-child(2)")
    ok = wait(pg, "!!window.WL_BOOT_MS", secs)
    return (round(time.time() - t0, 2) if ok is not None else None), bool(pg.evaluate("!!window.WL_STUDIO"))


def frame_offset(pg):
    return pg.evaluate("(() => { const r = document.getElementById('wlsframe').getBoundingClientRect(); return [r.left + 1, r.top + 1]; })()")


def category(fr, name):
    fr.locator(".blocklyToolboxCategory", has_text=name).first.click()
    fr.wait_for_timeout(900)


FLYOUT_JS = """(op) => { const ws = WLStudio.workspace(); const fw = ws.getFlyout().getWorkspace();
  const b = fw.getTopBlocks(false).find(x => x.type === op); if (!b) return null;
  const r = b.getSvgRoot().querySelector('.blocklyPath').getBoundingClientRect();
  const SB = WLStudio.blocks(), xy = SB.utils.svgMath.wsToScreenCoordinates(fw, b.getRelativeToSurfaceXY());
  return {x: r.left, y: r.top, w: r.width, h: r.height, ox: xy.x, oy: xy.y}; }"""


def flyout_box(fr, op):
    """The palette block's box once the palette has stopped scrolling (three equal readings in a row)."""
    hist = []
    for _ in range(40):
        cur = fr.evaluate(FLYOUT_JS, op)
        hist.append(cur)
        if len(hist) >= 3 and all(h and abs(h["y"] - cur["y"]) < 0.5 and abs(h["x"] - cur["x"]) < 0.5 for h in hist[-3:]):
            return cur
        fr.wait_for_timeout(150)
    return hist[-1] if hist else None


HIT_JS = """([x, y, op]) => { const e = document.elementFromPoint(x, y); if (!e) return false;
  const fw = WLStudio.workspace().getFlyout().getWorkspace(); const b = fw.getTopBlocks(false).find(z => z.type === op);
  return !!(b && b.getSvgRoot().contains(e)); }"""


CONN_JS = """([op, which, nth]) => { const ws = WLStudio.workspace(), SB = WLStudio.blocks();
  const bs = ws.getAllBlocks(false).filter(b => b.type === op && !b.isShadow());
  bs.sort((a, b) => a.getRelativeToSurfaceXY().y - b.getRelativeToSurfaceXY().y);
  let b = bs[nth || 0]; if (!b) return null; let c = null;
  if (which === 'next') { while (b.getNextBlock()) b = b.getNextBlock(); c = b.nextConnection; }
  else if (which === 'substack') { const inp = b.getInput('SUBSTACK'); c = inp && inp.connection; if (c && c.targetBlock()) { let x = c.targetBlock(); while (x.getNextBlock()) x = x.getNextBlock(); c = x.nextConnection; } }
  if (!c) return null;
  const p = SB.utils.svgMath.wsToScreenCoordinates(ws, new SB.utils.Coordinate(c.x, c.y));
  return {x: p.x, y: p.y}; }"""


def conn_point(fr, op, which="next", nth=0):
    return fr.evaluate(CONN_JS, [op, which, nth])


def free_point(fr, dx=60, dy=60):
    """A point in the empty code area (frame coordinates), dx/dy from its top-left."""
    return fr.evaluate("""([dx, dy]) => { const r = document.querySelector('.blocklyMainBackground').getBoundingClientRect();
      const f = WLStudio.workspace().getFlyout(); const fr = f && f.svgGroup_ ? f.svgGroup_.getBoundingClientRect() : null;
      const left = Math.max(r.left, fr ? fr.right : r.left); return {x: left + dx, y: r.top + dy}; }""", [dx, dy])


def drag_from_palette(pg, fr, op, to, steps=18):
    """A real mouse drag of palette block `op` so that its origin (top-left, where its previous connection is) lands on
    frame point `to` {x, y}. Returns the source box."""
    src = None
    off = frame_offset(pg)
    for _ in range(12):
        src = flyout_box(fr, op)
        if not src:
            raise RuntimeError("palette block not found: " + op)
        vis = fr.evaluate("(() => { const r = document.querySelector('.blocklyFlyout').getBoundingClientRect(); return [r.top, r.bottom, r.left, r.right]; })()")
        if src["y"] + src["h"] > vis[1] - 10 or src["y"] < vis[0] + 5:      # below / above the palette's visible part: scroll it (the wheel)
            pg.mouse.move(off[0] + (vis[2] + vis[3]) / 2, off[1] + (vis[0] + vis[1]) / 2)
            pg.mouse.wheel(0, max(-400, min(400, src["y"] - (vis[0] + vis[1]) / 2)))
            fr.wait_for_timeout(400)
            continue
        gx, gy = src["x"] + 10, src["y"] + min(14, src["h"] / 2)      # grab point (frame coords)
        if fr.evaluate(HIT_JS, [gx, gy, op]):
            break
        fr.wait_for_timeout(300)
    ox, oy = gx - src["ox"], gy - src["oy"]                             # grab point relative to the block origin
    dx, dy = src["x"] - src["ox"], src["y"] - src["oy"]                 # the block's outline vs its origin
    pg.mouse.move(off[0] + gx, off[1] + gy)
    pg.mouse.down()
    px, py = gx + 25, gy + 8
    pg.mouse.move(off[0] + px, off[1] + py, steps=4)
    pg.wait_for_timeout(80)
    # where the dragged block really is now (the palette may still have been settling when it was picked up)
    now = fr.evaluate("""() => { const SB = WLStudio.blocks(); const b = SB.getSelected ? SB.getSelected() : (SB.common && SB.common.getSelected && SB.common.getSelected());
      if (!b || !b.getSvgRoot) return null; const r = b.getSvgRoot().querySelector('.blocklyPath').getBoundingClientRect(); return {x: r.left, y: r.top}; }""")
    if now:
        ox, oy = px - (now["x"] - dx), py - (now["y"] - dy)
    pg.mouse.move(off[0] + to["x"] + ox, off[1] + to["y"] + oy, steps=steps)
    pg.wait_for_timeout(150)
    pg.mouse.up()
    pg.wait_for_timeout(450)
    return src


def drag_raw(pg, fr, src, to, steps=14):
    """The same trusted mouse drag from a palette box measured earlier (no waiting): used while the editor is locked."""
    off = frame_offset(pg)
    gx, gy = src["x"] + 10, src["y"] + min(14, src["h"] / 2)
    pg.mouse.move(off[0] + gx, off[1] + gy)
    pg.mouse.down()
    pg.mouse.move(off[0] + gx + 25, off[1] + gy + 8, steps=2)
    pg.mouse.move(off[0] + to["x"], off[1] + to["y"], steps=steps)
    pg.mouse.up()
    pg.wait_for_timeout(120)


def vm_scripts(fr):
    """[(target name, [opcodes of the stack, nested in order])] for every script in the live VM."""
    return fr.evaluate("""() => WLStudio.vm.runtime.targets.filter(t => t.isOriginal).map(t => {
      const B = t.blocks._blocks; const walk = id => { const out = []; for (let g = 0; id && B[id] && g < 200; g++) { const b = B[id];
        out.push(b.opcode); Object.keys(b.inputs).forEach(k => { const i = b.inputs[k]; if (i.block && i.block !== i.shadow && B[i.block] && !B[i.block].shadow && /SUBSTACK/.test(k)) out.push(walk(i.block)); });
        id = b.next; } return out; };
      return [t.isStage ? '舞台' : t.getName(), t.blocks.getScripts().filter(id => B[id] && !B[id].shadow).map(walk)]; })""")


def block_count(fr):
    return fr.evaluate("() => WLStudio.vm.runtime.targets.reduce((n, t) => n + Object.values(t.blocks._blocks).filter(b => !b.shadow).length, 0)")


def pick_dropdown(pg, fr, op, option_text, field_index=0):
    """Click the dropdown of the first workspace block `op` (its field_index-th dropdown, own or in a menu shadow) and choose
    the option whose text contains option_text (real clicks)."""
    box = fr.evaluate("""([op, n]) => { const ws = WLStudio.workspace(); const b = ws.getAllBlocks(false).find(x => x.type === op && !x.isShadow()); if (!b) return null;
      const fields = []; const scan = blk => blk.inputList.forEach(inp => { inp.fieldRow.forEach(f => { if (f.getOptions && f.EDITABLE !== false) fields.push(f); });
        const c = inp.connection && inp.connection.targetBlock(); if (c && c.isShadow()) scan(c); });
      scan(b); const f = fields[n]; if (!f) return null; const el = f.getSvgRoot ? f.getSvgRoot() : (f.fieldGroup_ || null); if (!el) return null;
      const r = el.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; }""", [op, field_index])
    if not box:
        raise RuntimeError("dropdown not found on " + op)
    off = frame_offset(pg)
    pg.mouse.click(off[0] + box["x"], off[1] + box["y"])
    pg.wait_for_timeout(500)
    item = fr.locator(".blocklyDropDownDiv .blocklyMenuItem, .blocklyDropDownDiv .goog-menuitem, .blocklyDropDownDiv [role=option], .blocklyDropDownDiv [role=menuitem]", has_text=option_text).first
    item.click()
    pg.wait_for_timeout(500)


def stage_click_sprite(pg, fr, sprite):
    """Click a sprite on the stage (real mouse), where the renderer draws it."""
    pt = fr.evaluate("""(n) => { const vm = WLStudio.vm, t = vm.runtime.getSpriteTargetByName(n); const c = document.querySelector('canvas[class*="stage_stage"], [class*="stage_stage"] canvas, canvas');
      const r = c.getBoundingClientRect(); const b = t.getBounds(); const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
      return {x: r.left + (cx + 240) / 480 * r.width, y: r.top + (180 - cy) / 360 * r.height}; }""", sprite)
    off = frame_offset(pg)
    pg.mouse.click(off[0] + pt["x"], off[1] + pt["y"])
    return pt


def green_flag(fr):
    fr.locator('[aria-label="開始執行"], img[class*="green-flag"]').first.click()


def stop_button(fr):
    fr.locator('[aria-label="停止執行"], img[class*="stop-all"]').first.click()


def send_chat(pg, text, secs=90):
    n0 = pg.locator("#wlbody .msg.bot:not(.wait), #wlbody .msg.sys").count()
    pg.fill("#chin", text)
    pg.press("#chin", "Enter")
    ok = wait(pg, f"document.querySelectorAll('#wlbody .msg.bot:not(.wait), #wlbody .msg.sys').length > {n0} && !document.querySelector('#wlbody .msg.wait')", secs)
    return ok


def last_bot(pg):
    return pg.evaluate("[...document.querySelectorAll('#wlbody .msg.bot:not(.wait)')].slice(-2).map(e => e.innerText)")


def no_scratch_text(fr):
    """Visible text / labels inside the editor frame that name the trademark (should be none)."""
    return fr.evaluate(r"""() => { const bad = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { const n = w.currentNode, t = n.textContent || ''; const e = n.parentElement;
        if (/scratch/i.test(t) && e && !e.closest('script, style') && e.getClientRects().length) bad.push(t.trim().slice(0, 80)); }
      document.querySelectorAll('[alt],[title],[aria-label],[data-tip],a[href]').forEach(e => ['alt', 'title', 'aria-label', 'data-tip', 'href'].forEach(a => {
        const v = e.getAttribute(a); if (v && /scratch/i.test(v) && e.getClientRects().length) bad.push(a + '=' + v.slice(0, 80)); }));
      return bad; }""")


def page_text(pg):
    return pg.evaluate(r"""(() => { const parts = [document.title, document.body.innerText];
      document.querySelectorAll('[title],[aria-label],[placeholder]').forEach(e => ['title', 'aria-label', 'placeholder'].forEach(a => { const v = e.getAttribute(a); if (v) parts.push(v); }));
      return parts.join('\n'); })()""")
