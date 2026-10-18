#!/usr/bin/env python3
"""Wonder Lab Studio prototype server (static files + a STUB of the Wonder Lab AI endpoint).

    python3 server/studio_server.py [--port 8920]          # canned AI turns (default, no model calls)
    (set -a; . ~/.deepseek; set +a; WL_REAL=1 WL_REAL_MAX=2 python3 server/studio_server.py --port 8921)
                                                            # real DeepSeek turns through lab_core.lab_turn (max WL_REAL_MAX)

Static:  /            -> src/index.html; other paths from src/, then node_modules/@scratch/scratch-gui/dist/
         text files are gzipped on the fly (level 9, cached) when the browser accepts gzip, as nginx gzip_static would.
API:     POST /api/ai/lab/<anything>   same request/response shape as lesson-ai lab_core.post():
         {text, history, program, run, note, signals, studio} -> {ok, say, question, ops, errors, program, focus, ...}
         `studio` (prototype extension) = {targets: [{name, isStage, costumes, x, y, visible}], unsupported, hand_edits}
         lets the stub build the lesson context (sprite names, costumes, backdrops) from the student's live project.

Dual mode (2026-10-07 evening): --site <built lesson site, e.g. ~/wonderlab-stage/build/L4> also serves the L4 pages under
/files/L4/lessons/ (.gz siblings as gzip_static) and stubs, for the lesson page:
         GET  /api/ai/lab/files/L4/lessons/<slug>   {ok, program, studio, modes, consol}   (studio: --studio 1|0)
         POST /api/ai/lab/files/L4/lessons/<slug>   + mode "ai"|"self", kind "review"|"consol" (no text), focus [{sprite, id}]
         GET  /api/ai/status/... · POST /api/ai/chat/...  (canned)
         test hooks: GET /api/ai/lab/_set?delay=<ms>&fail=<http code>&studio=0|1&consol=1|0&n=<turns>   GET /api/ai/lab/_log
In 「我自己砌」 (mode self) or kind review the stub never changes the program (ops []) and quotes a block line from
studio.text, as the real 助教 must.

The validation (sanitize_program, apply_ops, sanitize_run) is lab_core.py copied unchanged from
ycltesthk-portals/lesson-ai (2026-10-07), so the ops this stub returns are exactly what the real service would accept.
Copyright (C) 2026 IITS. AGPL-3.0-only.
"""
import argparse, gzip, io, json, mimetypes, os, re, sys, tarfile, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, unquote

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "src")
# Where the built gui bundle is served from. It is the npm tarball's dist by default, which means a
# checkout without `npm install` cannot serve the editor at all - the page 200s and then 404s on
# scratch-gui-standalone.js, which looks like a broken editor rather than a missing dependency.
# WL_DIST points it at any already-built bundle instead (a deploy, or another checkout), so the
# prototype can be run against the real editor without a full install.
DIST = os.environ.get("WL_DIST") or os.path.join(ROOT, "node_modules", "@scratch", "scratch-gui", "dist")

# The asset library the AI builds sprites from. On the deployed site nginx serves /lab-library/; this
# server did not, so S.library() 404'd and the library was never testable locally - which meant the
# assistant could only ever use sprites already on the stage, and nobody noticed at 8920 because
# nothing exercised it. WL_LIBRARY points at a copy of the deployed tree.
LIB_DIR = os.environ.get("WL_LIBRARY") or ""

# Import pedagogy from iits-repo (proprietary), not from local copy (keeps wonderlab AGPL-clean).
# The production lesson-ai service has the authoritative lab_core.py, lab_ta.py, lab_consol.py.
# This prototype server imports from there so there's only one copy to maintain.
# Path: wonderlab-studio/server → wonderlab-studio → src → iits-local
# Then: iits-local/src/iits-repo/portals/lesson-ai
IITS_LOCAL = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))  # Up 3 levels to iits-local
IITS_LESSON_AI = os.path.join(IITS_LOCAL, "src", "iits-repo", "portals", "lesson-ai")
sys.path.insert(0, IITS_LESSON_AI)
import lab_core as LC  # noqa: E402  (imports from iits-repo/portals/lesson-ai/)

STAGE = LC.STAGE_NAME
TEXT_EXT = {".js", ".css", ".html", ".json", ".svg", ".txt", ".map", ".md"}
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/wasm", ".wasm")
_gz, _gz_lock = {}, threading.Lock()
REAL = os.environ.get("WL_REAL") == "1"
REAL_MAX = int(os.environ.get("WL_REAL_MAX", "3"))
_real_used = 0
LOG = []          # last requests to the AI endpoint (for the e2e test: what the browser actually sent)
SITE = None       # --site: a built L4 lesson folder (pages + assets/lab), served under /files/L4/lessons/
STUB = {"delay": 0, "fail": 0, "fail_n": 0, "studio": True, "consol": False, "turns": 0}
LESSON_RX = re.compile(r"^/api/ai/(lab|status|chat)/files/(L4)/lessons/([a-z0-9]+-bp[0-9]+)$")


def resolve_site(path):
    """/files/L4/lessons/<rel> -> a file in --site (None if not there)."""
    if not SITE:
        return None
    p = unquote(urlparse(path).path)
    m = re.match(r"^/files/L4/lessons/(.+)$", p)
    if not m:
        return None
    f = os.path.realpath(os.path.join(SITE, m.group(1)))
    return f if f.startswith(os.path.realpath(SITE)) and os.path.isfile(f) else None


def site_lesson(slug):
    """The lesson stage json the page uses (sprite names for the stub when the page sends no studio.targets)."""
    try:
        d = json.load(open(os.path.join(SITE or "", "assets", "lab", slug + ".json"), encoding="utf-8"))
    except Exception:
        return None
    sprites = [{"name": sp["name"], "costumes": [{"name": c["name"]} for c in sp.get("costumes") or []] or [{"name": ""}],
                "x": sp.get("x", 0), "y": sp.get("y", 0), "visible": sp.get("visible", True)} for sp in d.get("sprites") or []]
    return {"title": d.get("title", slug), "sprites": sprites, "stage": {"backdrops": [{"name": c["name"]} for c in (d.get("stage") or {}).get("backdrops") or []]},
            "brief": {"goal": "（stub）", "questions": [], "colors": {}, "limits": "—"}}


def resolve(path):
    p = unquote(urlparse(path).path)
    if p in ("/", ""):
        p = "/index.html"
    rel = os.path.normpath(p.lstrip("/"))
    if rel.startswith(".."):
        return None
    # /lab-library/... -> the asset library, when one is configured
    if LIB_DIR and rel.startswith("lab-library/"):
        f = os.path.join(LIB_DIR, rel[len("lab-library/"):])
        if os.path.isfile(f) and os.path.realpath(f).startswith(os.path.realpath(LIB_DIR)):
            return f
        return None
    for base in (SRC, DIST):
        f = os.path.join(base, rel)
        if os.path.isfile(f) and os.path.realpath(f).startswith(os.path.realpath(base)):
            return f
    return None


SOURCE_FILES = ["README.md", "NOTICE.md", "LICENSE", "package.json", "package-lock.json", "src", "server", "tools", "test/e2e.py", "test/perf.py",
                "test/real_turns.py", "test/webkit_ipad.cjs"]


def source_tar():
    """AGPL-3.0 section 13: the Corresponding Source of what this server sends (our files; upstream = npm tarballs in package-lock.json)."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for rel in SOURCE_FILES:
            f = os.path.join(ROOT, rel)
            if os.path.exists(f):
                tar.add(f, arcname="wonderlab-studio/" + rel,
                        filter=lambda ti: None if ("__pycache__" in ti.name or ".bak" in ti.name) else ti)
    return buf.getvalue()


def gz_bytes(f):
    m = os.stat(f).st_mtime
    with _gz_lock:
        hit = _gz.get(f)
        if hit and hit[0] == m:
            return hit[1]
    with open(f, "rb") as fh:
        data = gzip.compress(fh.read(), 9)
    with _gz_lock:
        _gz[f] = (m, data)
    return data


# ------------------------------------------------------------------ stub "AI"
def lesson_from(studio):
    """The lab_core lesson context, built from the live project the browser describes (students add sprites here)."""
    targets = (studio or {}).get("targets") or []
    sprites, backdrops = [], []
    for t in targets[:30]:
        if not isinstance(t, dict):
            continue
        costumes = [{"name": str(c)[:40]} for c in (t.get("costumes") or [])[:50]]
        if t.get("isStage"):
            backdrops = costumes
        else:
            sprites.append({"name": str(t.get("name") or "")[:40], "costumes": costumes or [{"name": ""}],
                            "x": t.get("x", 0), "y": t.get("y", 0), "visible": t.get("visible", True)})
    return {"title": "自由創作（Studio 原型）", "sprites": sprites, "stage": {"backdrops": backdrops or [{"name": "背景1"}]},
            "brief": {"goal": "學生自由創作；跟隨學生的想法。", "questions": [], "colors": {}, "limits": "—"}}


def scripts_of(program, sprite):
    t = program["stage"] if sprite == STAGE else (program.get("sprites") or {}).get(sprite) or {}
    return t.get("scripts") or {}


def describe(block, depth=0):
    names = {"event_whenflagclicked": "當綠旗被點擊", "motion_movesteps": "移動", "motion_turnright": "右轉",
             "control_forever": "重複無限次", "control_repeat": "重複", "looks_sayforsecs": "說", "looks_say": "說",
             "event_whenkeypressed": "當鍵被按下", "motion_changexby": "x 改變", "motion_changeyby": "y 改變",
             "control_if": "如果", "motion_ifonedgebounce": "碰到邊緣就反彈", "control_wait": "等待"}
    return names.get(block.get("op"), block.get("op"))


def canned(text, program, run, studio, lesson):
    """Return lab_core-shaped raw model output {intent, say, question, ops, focus}. Builds on the student's own scripts."""
    t = text or ""
    sprites = [s["name"] for s in lesson["sprites"]]
    want = (studio or {}).get("focus") or (studio or {}).get("editing")
    focus = want if want in sprites else (sprites[0] if sprites else STAGE)
    mine = scripts_of(program, focus)
    he = (studio or {}).get("hand_edits") or []
    if isinstance(he, dict):                         # dual-mode contract: {added: [id], changed: [id], removed: [id]}
        hand = [i for k in ("added", "changed", "removed") for i in (he.get(k) or []) if isinstance(i, str)]
    else:                                            # the prototype page: [{sprite, id, change}]
        hand = [e for e in he if isinstance(e, dict) and e.get("sprite") == focus]
    # the student's own green-flag script (hand-made or edited): build on it instead of starting a new one
    flag_sid = next((sid for sid, bl in mine.items() if bl and bl[0].get("op") == "event_whenflagclicked"), None)
    seen = ""
    if mine:
        first = next(iter(mine.values()))
        seen = f"我看到「{focus}」現在有 {len(mine)} 段程式（第一段：{'、'.join(describe(b) for b in first[:4])}{'…' if len(first) > 4 else ''}）。"
    if hand:
        seen += f"你自己改過 {len(hand)} 段。"
    ran = ""
    if run and isinstance(run.get("sprites"), dict) and focus in run["sprites"]:
        r = run["sprites"][focus]
        ran = f"上次執行：{focus} 由 {tuple(r.get('start') or [])} 去到 {tuple(r.get('end') or [])}。"

    def put(extra, say, q):
        base = list(mine[flag_sid]) if flag_sid else [{"op": "event_whenflagclicked"}]
        sid = flag_sid or "s1"
        # keep the student's blocks (and mistakes); add only what they asked for, before a cap block
        if base and LC.OPS.get(base[-1]["op"], {}).get("shape") in ("cap", "c-cap"):
            base = base[:-1] + extra + [base[-1]]
        else:
            base = base + extra
        how = "在你自己砌的那段程式下面" if flag_sid else "用「當綠旗被點擊」開始"
        return {"intent": "build", "say": f"照你說的：{how}{say}", "question": q,
                "ops": [{"do": "set_script", "sprite": focus, "id": sid, "blocks": base}], "focus": focus}

    if re.search(r"(刪|delete|清除程式)", t):
        if not mine:
            return {"intent": "ask", "say": "現在沒有程式可以刪。", "question": "你想角色先做甚麼？", "ops": [], "focus": focus}
        sid = list(mine)[-1]
        return {"intent": "build", "say": f"照你說的：刪去了「{focus}」最後一段程式。", "question": "刪了之後，按「執行」會發生甚麼？",
                "ops": [{"do": "delete_script", "sprite": focus, "id": sid}], "focus": focus}
    if re.search(r"(一直|重複|不停|forever|loop)", t, re.I):
        return put([{"op": "control_forever", "SUBSTACK": [{"op": "motion_movesteps", "STEPS": 10}]}],
                   "，加了「重複無限次」裏面「移動 10 點」。", "按「執行」之前猜猜：角色走到舞台邊之後會怎樣？")
    if re.search(r"(移|走|行|move|動)", t, re.I):
        return put([{"op": "motion_movesteps", "STEPS": 10}], "，加了「移動 10 點」。", "按「執行」之前猜猜：角色會向哪一邊走？")
    if re.search(r"(說|講|say|hello|你好)", t, re.I):
        return put([{"op": "looks_sayforsecs", "MESSAGE": "你好！", "SECS": 2}], "，加了「說 你好！ 2 秒」。", "你想角色說完之後做甚麼？")
    if re.search(r"(轉|turn)", t, re.I):
        return put([{"op": "motion_turnright", "DEGREES": 15}], "，加了「右轉 15 度」。", "轉完之後，角色面向哪一邊？")
    return {"intent": "observe", "say": (seen + ran) or "我們從你的想法開始。", "question": "你想角色接下來做甚麼？", "ops": [], "focus": focus}


def ta_reply(text, program, run, studio, lesson):
    """「我自己砌」 / 請助教看看 stub: never changes the program; names a block line the student really has (studio.text) and
    says what the last run showed, then asks one question. Shaped like the real 助教 (intent, say, question, ops [], focus)."""
    texts = (studio or {}).get("text") if isinstance((studio or {}).get("text"), dict) else {}
    editing = (studio or {}).get("editing")
    order = ([editing] if editing in texts else []) + [k for k in texts if k != editing]
    sprite, sid, lines = None, None, []
    for sp in order:
        scr = texts.get(sp) or {}
        if isinstance(scr, dict) and scr:
            sid = next(iter(scr)); sprite = sp; lines = [x.strip() for x in str(scr[sid]).split("\n") if x.strip()]
            break
    t = text or ""
    if re.search(r"停止.{0,3}這個程式|停止這個程式", t) and re.search(r"(意思|做咩|做甚麼|乜嘢)", t):
        return {"intent": "explain", "say": "「停止 這個程式」只會停它自己所在的那一段程式，其他程式會照樣繼續。",
                "question": "你的程式裏面，按空白鍵時有哪幾段程式在行？", "ops": [], "focus": [{"sprite": sprite, "id": sid}] if sid else []}
    if not lines:
        return {"intent": "ask", "say": "我還沒有看到你砌的積木。", "question": "你想先讓角色做甚麼？", "ops": [], "focus": []}
    seen = f"你在「{sprite}」砌了「{lines[0]}」" + (f"，下面是「{lines[1]}」。" if len(lines) > 1 else "。")
    ran = ""
    scripts = (run or {}).get("scripts") if isinstance(run, dict) else None
    if isinstance(scripts, list) and any(isinstance(x, dict) and x.get("running_at_end") for x in scripts):
        ran = "上次執行完的時候，還有程式在行。"
    q = "你估按下空白鍵之後，哪一段程式會停下來？" if re.search(r"(空白|space)", t + " ".join(lines), re.I) else "你按執行之前，估一估角色會怎樣動？"
    return {"intent": "observe", "say": seen + ran, "question": q, "ops": [], "focus": [{"sprite": sprite, "id": sid}]}


def stub_turn(body):
    studio = body.get("studio") if isinstance(body.get("studio"), dict) else {}
    lesson = lesson_from(studio) if studio.get("targets") else (site_lesson(body.get("_slug") or "") or lesson_from(studio))
    program = LC.sanitize_program(body.get("program"), lesson)
    run_in = body.get("run") if isinstance(body.get("run"), dict) else None
    run = LC.sanitize_run(run_in, lesson)
    if run is not None and run_in and isinstance(run_in.get("scripts"), list):
        run["scripts"] = run_in["scripts"][:30]                     # the stub keeps the per-script events (the real service: package SV)
    text = str(body.get("text") or "")[:300]
    mode = "self" if body.get("mode") == "self" else "ai"
    if mode == "self" or body.get("kind") in ("review", "consol"):
        raw = ta_reply(text, program, run, studio, lesson)
        STUB["turns"] += 1
        return {"ok": True, "say": LC.tidy_say(raw["say"], False), "question": LC.tidy_question(raw["question"]), "ops": [], "errors": [],
                "program": program, "focus": [f for f in raw["focus"] if f.get("id")], "mode": mode, "intent": raw["intent"],
                "left": 99, "in_class": False, "masked": False, "ms": 1, "checks": [], "source": "stub"}
    t0 = time.time()
    global _real_used
    if REAL and _real_used < REAL_MAX:
        _real_used += 1
        key = os.environ.get("DEEPSEEK_API_KEY", "")      # from the environment only (set -a; . ~/.deepseek; set +a); never logged
        if not key:
            raise RuntimeError("WL_REAL=1 needs DEEPSEEK_API_KEY in the environment")
        hist = [m for m in (body.get("history") or [])[-8:] if isinstance(m, dict) and m.get("role") in ("user", "assistant")]
        out = LC.lab_turn(lesson, hist, program, run, text, key, os.environ.get("WL_MODEL", "deepseek-chat"), body.get("note") or None)
        say, question, applied, errors, new_prog, focus = out["say"], out["question"], out["ops"], out["errors"], out["program"], out["focus"]
        src = "deepseek"
    else:
        raw = canned(text, program, run, studio, lesson)
        new_prog, applied, errors = LC.apply_ops(program, raw["ops"], lesson)
        built = bool(applied)
        say, question, focus = LC.tidy_say(raw["say"], built), LC.tidy_question(raw["question"]), raw["focus"]
        src = "stub"
    STUB["turns"] += 1
    if body.get("mode") in ("ai", "self"):          # the dual-mode contract: focus = the scripts the reply is about
        focus = [{"sprite": o.get("sprite"), "id": o.get("id")} for o in applied if o.get("do") == "set_script"][:4]

    # Mock token usage and limits
    model_used = body.get("model") or "deepseek-chat"
    is_r1 = model_used == "deepseek-reasoner"

    # Simulate token counts (in real implementation, get from API response)
    input_tokens = len(text) * 4 + len(str(program)) // 2  # Rough estimate
    output_tokens = len(say) * 4 + len(str(applied)) // 2
    reasoning_tokens = 0
    if is_r1 and body.get("show_thinking"):
        reasoning_tokens = output_tokens * 3  # R1 thinking is typically 3x output

    # Mock updated limits (decremented by 1)
    limits_after = {
        "per_lesson_hour": {"left": 7 if not is_r1 else 2, "max": 10 if not is_r1 else 5},
        "per_lesson_day": {"left": 19 if not is_r1 else 7, "max": 25 if not is_r1 else 10},
        "per_student_day": {"left": 44 if not is_r1 else 14, "max": 60 if not is_r1 else 20}
    }

    result = {"ok": True, "say": say, "question": question, "ops": applied, "errors": errors, "program": new_prog, "focus": focus,
            "mode": mode, "left": 99, "in_class": False, "masked": False, "ms": int((time.time() - t0) * 1000), "checks": [], "source": src,
            "model_used": model_used, "tokens": {"input": input_tokens, "output": output_tokens}, "limits_after": limits_after}

    if reasoning_tokens > 0:
        result["tokens"]["reasoning"] = reasoning_tokens

    return result


def mask(s):
    return re.sub(r"(sk-|Bearer\s+)\S+", r"\1***", s)


class H(BaseHTTPRequestHandler):
    server_version = "WonderLabStudio/0.1"

    def log_message(self, fmt, *a):
        if os.environ.get("WL_LOG"):
            sys.stderr.write("%s %s\n" % (self.address_string(), fmt % a))

    def _j(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def _site_status(self):
        # Mock models configuration
        models = [
            {
                "id": "deepseek-chat",
                "display_name": "DeepSeek Chat",
                "description": "快速回應，適合一般對話",
                "default": True,
                "enabled": True,
                "supports_thinking": False,
                "limits": {
                    "per_lesson_hour": {"left": 8, "max": 10},
                    "per_lesson_day": {"left": 20, "max": 25},
                    "per_student_day": {"left": 45, "max": 60}
                },
                "costs": {
                    "input_per_1m": 0.27,   # HK$ per 1M tokens
                    "output_per_1m": 1.10,
                    "cached_input_per_1m": 0.054
                }
            },
            {
                "id": "deepseek-reasoner",
                "display_name": "DeepSeek R1",
                "description": "深度推理，可顯示思考過程",
                "default": False,
                "enabled": True,
                "supports_thinking": True,
                "limits": {
                    "per_lesson_hour": {"left": 3, "max": 5},
                    "per_lesson_day": {"left": 8, "max": 10},
                    "per_student_day": {"left": 15, "max": 20}
                },
                "costs": {
                    "input_per_1m": 0.55,
                    "output_per_1m": 2.19,
                    "cached_input_per_1m": 0.11,
                    "reasoning_per_1m": 2.19  # R1's thinking tokens same as output
                }
            }
        ]

        # Mock role (in real implementation, get from session/auth)
        role = "student"  # or "teacher"

        return {
            "ok": True,
            "open": True,
            "models": models,
            "role": role,
            "open_from": "07:00",
            "open_until": "21:00"
        }

    def do_GET(self):
        p = urlparse(self.path).path
        # Standalone studio status endpoint
        if p == "/api/ai/status/studio":
            return self._j(200, self._site_status())
        if p == "/api/ai/lab/_log":                      # test hook: the last request bodies the stub received
            return self._j(200, {"ok": True, "log": LOG[-10:]})
        if p == "/api/ai/lab/_set":                      # test hook: delay / failures / studio flag / wrap-up pending
            q = dict(x.split("=", 1) for x in (urlparse(self.path).query or "").split("&") if "=" in x)
            if "delay" in q: STUB["delay"] = max(0, min(70000, int(q["delay"])))
            if "fail" in q: STUB["fail"] = int(q["fail"]); STUB["fail_n"] = int(q.get("n", "1"))
            if "studio" in q: STUB["studio"] = q["studio"] == "1"
            if "consol" in q: STUB["consol"] = q["consol"] == "1"
            if q.get("reset") == "1": LOG.clear(); STUB.update(delay=0, fail=0, fail_n=0, consol=False, turns=0)
            return self._j(200, {"ok": True, "stub": STUB})
        if p == "/favicon.ico" and SITE:                  # as the staging stand-in (serve.py) answers
            self.send_response(204); self.send_header("Content-Length", "0"); self.end_headers(); return
        m = LESSON_RX.match(p)
        if m and SITE:
            if m.group(1) == "status":
                return self._j(200, self._site_status())
            if m.group(1) == "lab":
                cs = {"state": "pending" if STUB["consol"] else "off", "pending": bool(STUB["consol"])}
                return self._j(200, {"ok": True, "program": None, "studio": bool(STUB["studio"]), "modes": ["ai", "self"], "consol": cs})
        sf = resolve_site(self.path)
        if sf:
            ext = os.path.splitext(sf)[1].lower()
            ctype = (mimetypes.guess_type(sf)[0] or "application/octet-stream")
            if ext in (".js", ".mjs"): ctype = "text/javascript"
            if ctype.startswith("text/") or ctype.endswith("json") or ext == ".svg": ctype += "; charset=utf-8"
            gz = "gzip" in (self.headers.get("Accept-Encoding") or "") and os.path.isfile(sf + ".gz")
            data = open(sf + ".gz" if gz else sf, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            if gz: self.send_header("Content-Encoding", "gzip")
            self.send_header("Cache-Control", "public, max-age=31536000, immutable" if re.search(r"/assets/lab/(engine|studio)-[0-9a-f]+/", p) else "no-cache")
            self.end_headers()
            self.wfile.write(data)
            return
        if p == "/source.tar.gz":
            data = source_tar()
            self.send_response(200)
            self.send_header("Content-Type", "application/gzip")
            self.send_header("Content-Disposition", 'attachment; filename="wonderlab-studio-source.tar.gz"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        f = os.path.join(ROOT, "LICENSE") if p == "/LICENSE.txt" else resolve(self.path)
        if not f:
            self.send_error(404)
            return
        ext = os.path.splitext(f)[1].lower()
        ctype = mimetypes.guess_type(f)[0] or ("text/plain" if f.endswith("LICENSE") else "application/octet-stream")
        if ext in (".js", ".css", ".html", ".json", ".svg", ".txt", ".md") or f.endswith("LICENSE"):
            ctype += "; charset=utf-8"
        use_gz = ext in TEXT_EXT and "gzip" in (self.headers.get("Accept-Encoding") or "")
        data = gz_bytes(f) if use_gz else open(f, "rb").read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        if use_gz:
            self.send_header("Content-Encoding", "gzip")
        own = f.startswith(SRC)
        self.send_header("Cache-Control", "no-cache" if own else "public, max-age=86400")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        p = urlparse(self.path).path
        m = LESSON_RX.match(p)
        if m and m.group(1) == "chat":
            n = int(self.headers.get("Content-Length", "0") or 0); self.rfile.read(n)
            return self._j(200, {"ok": True, "answer": "（模擬回答）這一課的重點是用積木讓角色照你的想法行動。", "left": 9})
        if not p.startswith("/api/ai/lab/"):
            self.send_error(404)
            return
        slug = m.group(3) if m else ""
        if STUB["delay"]:
            time.sleep(STUB["delay"] / 1000.0)
        if STUB["fail"] and STUB["fail_n"] > 0:
            STUB["fail_n"] -= 1
            n = int(self.headers.get("Content-Length", "0") or 0); body = self.rfile.read(n)
            try: LOG.append({"ts": time.time(), "bytes": n, "body": json.loads(body or b"{}"), "failed": STUB["fail"]})
            except Exception: pass
            code = STUB["fail"]
            if code == 429:
                return self._j(429, {"ok": False, "retry": True, "reason": "上一個想法還在處理中，請等一等。"})
            if code == 504:
                self.send_response(504); self.send_header("Content-Type", "text/html"); self.end_headers(); self.wfile.write(b"<html>504</html>"); return
            return self._j(code, {"ok": False, "retry": True, "reason": "AI 學伴暫時連不上，請稍後再試。"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n > LC.MAX_BODY:
                return self._j(413, {"ok": False, "reason": "程式太大了。"})
            body = json.loads(self.rfile.read(n) or b"{}")
            if not isinstance(body, dict):
                raise ValueError
        except Exception:
            return self._j(400, {"ok": False, "reason": "訊息格式不對。"})
        if not str(body.get("text") or "").strip() and body.get("kind") not in ("review", "consol"):
            return self._j(400, {"ok": False, "reason": "請先說說你的想法。"})
        if body.get("kind") == "consol":
            if not STUB["consol"]:
                return self._j(409, {"ok": False, "reason": "現在沒有要開始的整合。", "consol": {"state": "off", "pending": False}})
            STUB["consol"] = False
        body["_slug"] = slug
        LOG.append({"ts": time.time(), "bytes": n, "body": body})
        del LOG[:-20]
        try:
            out = stub_turn(body)
        except Exception as e:
            print("stub error", type(e).__name__, mask(str(e))[:200], flush=True)
            return self._j(502, {"ok": False, "retry": True, "reason": "AI 學伴暫時連不上，請稍後再試。"})
        if body.get("kind") == "consol":
            out["consol"] = {"state": "step1", "pending": False}
            out["say"], out["question"] = "（整合）我們一起回顧你今天的程式。", "你最後的做法，和一開始的做法有甚麼不同？"
        LOG[-1]["reply"] = out
        self._j(200, out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8920)
    ap.add_argument("--site", default=None, help="a built L4 lesson folder to serve under /files/L4/lessons/ (dual-mode tests)")
    ap.add_argument("--studio", default="1", help="lab GET studio flag for --site pages (1 or 0)")
    a = ap.parse_args()
    if not 8920 <= a.port <= 8929:
        sys.exit("port must be 8920-8929")
    global SITE
    if a.site:
        SITE = os.path.realpath(os.path.expanduser(a.site))
    STUB["studio"] = a.studio == "1"
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), H)
    print(f"Wonder Lab Studio on http://127.0.0.1:{a.port}/  (AI: {'DeepSeek x%d' % REAL_MAX if REAL else 'stub'})", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
