#!/usr/bin/env python3
"""teach-site local server.

Serves lessons with a nav sidebar, saves practice inputs as Markdown, and
spawns headless `cmd -p` runs for the check / create-lesson buttons.

Practice groups are identified structurally (from the lesson HTML), never by
prose: `q` = comprehension questions, `w` = writing task. The correction
Markdown carries the same ids in HTML comment anchors, so the UI can place
each group's feedback under its own textareas in any target language.
"""
import argparse
import json
import mimetypes
import os
import re
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LESSONS = ROOT / "lessons"
PDATA = ROOT / "practice-data"
PROMPTS = ROOT / "prompts"
STATE_FILE = ROOT / ".teach-site-state.json"
PORT = int(os.environ.get("PORT", "8000"))

GROUPS = ("q", "w")
GROUP_LABELS = {"q": "comprehension questions", "w": "writing task"}
ANCHOR_RE = re.compile(r"<!--\s*group:([qw])\s*-->", re.I)
TEMPLATE_RE = re.compile(r"\{([A-Z_]+)\}")


# --------------------------------------------------------------------------
# run state (persisted so a server restart does not orphan a run)
# --------------------------------------------------------------------------
class RunState:
    """Tracks the one active agent run and its outcome."""

    def __init__(self, path=STATE_FILE):
        self.path = path
        self.lock = threading.Lock()
        self.data = {"check": {"status": "idle"}, "create": {"status": "idle"}}
        self._load()

    def _load(self):
        try:
            stored = json.loads(self.path.read_text(encoding="utf-8"))
            for key in self.data:
                if isinstance(stored.get(key), dict):
                    self.data[key] = stored[key]
        except Exception:
            pass

    def _save(self):
        try:
            self.path.write_text(json.dumps(self.data, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass

    def snapshot(self):
        with self.lock:
            return json.loads(json.dumps(self.data))

    def busy(self):
        with self.lock:
            return any(v.get("status") == "running" for v in self.data.values())

    def set(self, action, **fields):
        with self.lock:
            self.data[action] = fields
            self._save()

    def get(self, action):
        with self.lock:
            return json.loads(json.dumps(self.data.get(action, {"status": "idle"})))


state = RunState()


# --------------------------------------------------------------------------
# course model
# --------------------------------------------------------------------------
class Course:
    """Everything the site knows about lessons, practice groups and course config."""

    def __init__(self, root=ROOT):
        self.root = root
        self.lessons_dir = root / "lessons"
        self.pdata_dir = root / "practice-data"
        self.prompts_dir = root / "prompts"

    # -- lessons --
    def lesson_files(self):
        return sorted(self.lessons_dir.glob("[0-9][0-9][0-9][0-9]-*.html"))

    def lesson_for(self, lid):
        for path in self.lesson_files():
            if path.name.startswith(lid):
                return path
        return None

    def next_lesson_id(self):
        files = self.lesson_files()
        if not files:
            return None
        return f"{max(int(p.name[:4]) for p in files) + 1:04d}"

    @staticmethod
    def lid_of(name):
        return name[:4]

    @staticmethod
    def lesson_title(text):
        m = re.search(r"<h1>(.*?)</h1>", text, re.S)
        return re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else ""

    @staticmethod
    def practice_groups(text):
        """Group ids present in a lesson, derived from textarea attributes."""
        found = []
        for gid in GROUPS:
            if re.search(r'data-practice="%s"' % gid, text):
                found.append(gid)
        return found

    @staticmethod
    def question_count(text):
        return len(set(re.findall(r'data-practice="q"[^>]*data-n="(\d+)"', text)))

    def status(self, lid):
        if (self.pdata_dir / f"{lid}-korrektur.md").exists():
            return "corrected"
        if (self.pdata_dir / f"{lid}-inputs.md").exists():
            return "progress"
        return "new"

    # -- config --
    def config(self):
        try:
            return json.loads((self.root / "course.json").read_text(encoding="utf-8"))
        except Exception:
            return {}

    def language(self):
        return self.config().get("language") or "the target language"

    def lang_code(self):
        return self.config().get("lang") or ""

    # -- nav --
    def nav_html(self, active_name):
        items = []
        for path in self.lesson_files():
            text = path.read_text(encoding="utf-8", errors="replace")
            title = self.lesson_title(text)
            status = self.status(self.lid_of(path.name))
            active = ' class="active"' if path.name == active_name else ""
            items.append(
                f'<li class="nav-{status}"><a href="/lessons/{path.name}"{active}>'
                f'<span class="dot"></span><span>{self.lid_of(path.name)} · {title}</span></a></li>'
            )
        return ('<nav id="lesson-nav"><p class="nav-head">Lessons</p><ul>'
                + "".join(items) + "</ul></nav>")


course = Course()


# --------------------------------------------------------------------------
# prompts
# --------------------------------------------------------------------------
def fill(template, mapping):
    """Substitute {KEY} placeholders; every placeholder must be supplied."""
    missing = sorted(set(TEMPLATE_RE.findall(template)) - set(mapping))
    if missing:
        raise KeyError(f"prompt template missing values: {', '.join(missing)}")
    for key, value in mapping.items():
        template = template.replace("{" + key + "}", str(value))
    return template


def render_prompt(name, mapping):
    template = (course.prompts_dir / name).read_text(encoding="utf-8")
    return fill(template, mapping)


# --------------------------------------------------------------------------
# agent runs
# --------------------------------------------------------------------------
def spawn_run(action, prompt):
    """Start one headless agent run. Returns False if another run is active."""
    if state.busy():
        return False
    state.set(action, status="running", since=time.time())

    def worker():
        try:
            proc = subprocess.run(
                ["cmd", "-p", "-t", "--yolo", "--skip-onboarding", "--max-turns", "150"],
                input=prompt,
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                timeout=1500,
            )
            tail = ((proc.stderr or "") + (proc.stdout or ""))[-1200:]
            state.set(action, status="done" if proc.returncode == 0 else "error",
                      code=proc.returncode, tail=tail)
        except subprocess.TimeoutExpired:
            state.set(action, status="error", tail="timeout after 1500s")
        except FileNotFoundError:
            state.set(action, status="error", tail="`cmd` CLI not found on PATH")
        except Exception as exc:
            state.set(action, status="error", tail=str(exc))

    threading.Thread(target=worker, daemon=True).start()
    return True


# --------------------------------------------------------------------------
# practice data
# --------------------------------------------------------------------------
def inputs_md(lid, data):
    """Render learner answers as Markdown using the structural group ids."""
    lines = [f"# Practice — Lesson {lid}", ""]
    fields = data.get("fields") or {}
    questions = sorted(
        (int(k[1:]), str(v).strip())
        for k, v in fields.items()
        if k.startswith("q") and k[1:].isdigit()
    )
    if questions:
        lines += ["<!-- group:q -->", "## Questions", ""]
        lines += [f"{n}. {v}" for n, v in questions if v]
        lines.append("")
    writing = str(fields.get("w", "")).strip()
    if writing:
        lines += ["<!-- group:w -->", "## Writing task", "", writing, ""]
    speaks = [s for s in (data.get("speaks") or []) if str(s.get("heard", "")).strip()]
    if speaks:
        lines += ["<!-- group:s -->", "## Speech transcripts", ""]
        lines += [
            f"- Target: “{s.get('target', '')}” → heard: “{s['heard']}”" + (" ✓" if s.get("ok") else "")
            for s in speaks
        ]
        lines.append("")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# http
# --------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send_body(self, code, body, ctype="text/plain; charset=utf-8", extra=None):
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, code, payload):
        self.send_body(code, json.dumps(payload, ensure_ascii=False), "application/json")

    # ---------- GET ----------
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/":
            files = course.lesson_files()
            target = f"/lessons/{files[0].name}" if files else "/"
            return self.send_body(302, "", extra={"Location": target})

        if path.startswith("/lessons/"):
            name = os.path.basename(path)
            file_path = course.lessons_dir / name
            if not name.endswith(".html") or not file_path.is_file():
                return self.send_body(404, "lesson not found")
            html = file_path.read_text(encoding="utf-8", errors="replace")
            if 'id="lesson-nav"' not in html:
                html = re.sub(r"(<body[^>]*>)", r"\1\n" + course.nav_html(name), html, count=1)
            return self.send_body(200, html, "text/html; charset=utf-8")

        if path == "/api/state":
            return self.send_body(200, json.dumps(state.snapshot(), ensure_ascii=False),
                                  "application/json")

        if path == "/api/lesson":
            lid = (query.get("id") or [""])[0]
            lesson = course.lesson_for(lid) if re.fullmatch(r"\d{4}", lid) else None
            if lesson is None:
                return self.send_json(404, {"error": "no such lesson"})
            text = lesson.read_text(encoding="utf-8", errors="replace")
            return self.send_json(200, {
                "id": lid,
                "groups": course.practice_groups(text),
                "questions": course.question_count(text),
                "hasCorrection": (course.pdata_dir / f"{lid}-korrektur.md").exists(),
            })

        if path == "/api/correction":
            lid = (query.get("id") or [""])[0]
            if not re.fullmatch(r"\d{4}", lid):
                return self.send_json(400, {"error": "bad id"})
            file_path = course.pdata_dir / f"{lid}-korrektur.md"
            if not file_path.is_file():
                return self.send_json(404, {"error": "none"})
            return self.send_body(200, file_path.read_text(encoding="utf-8"),
                                  "text/markdown; charset=utf-8")

        file_path = (ROOT / path.lstrip("/")).resolve()
        if not str(file_path).startswith(str(ROOT.resolve())) or not file_path.is_file():
            return self.send_body(404, "not found")
        ctype = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        return self.send_body(200, file_path.read_bytes(), ctype)

    # ---------- POST ----------
    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        except Exception:
            return self.send_json(400, {"error": "bad json"})

        if path == "/api/practice":
            lid = str(data.get("id", ""))
            if not re.fullmatch(r"\d{4}", lid) or course.lesson_for(lid) is None:
                return self.send_json(404, {"error": "no such lesson"})
            course.pdata_dir.mkdir(exist_ok=True)
            (course.pdata_dir / f"{lid}-inputs.md").write_text(inputs_md(lid, data), encoding="utf-8")
            return self.send_json(200, {"saved": True})

        if path == "/api/check":
            lid = str(data.get("id", ""))
            lesson = course.lesson_for(lid) if re.fullmatch(r"\d{4}", lid) else None
            if lesson is None:
                return self.send_json(404, {"error": "no such lesson"})
            if not (course.pdata_dir / f"{lid}-inputs.md").is_file():
                return self.send_json(409, {"error": "no inputs saved"})
            text = lesson.read_text(encoding="utf-8", errors="replace")
            try:
                prompt = render_prompt("check.md", {
                    "ID": lid,
                    "LANG": course.language(),
                    "LANG_CODE": course.lang_code(),
                    "LESSON_FILE": f"lessons/{lesson.name}",
                    "INPUTS_FILE": f"practice-data/{lid}-inputs.md",
                    "OUTPUT_FILE": f"practice-data/{lid}-korrektur.md",
                    "GROUP_Q": "q" if "q" in course.practice_groups(text) else "",
                    "GROUP_W": "w" if "w" in course.practice_groups(text) else "",
                    "QUESTION_COUNT": str(course.question_count(text)),
                    "SPEAK_COUNT": str(text.count('data-say=')),
                })
            except (KeyError, OSError) as exc:
                return self.send_json(500, {"error": str(exc)})
            started = spawn_run("check", prompt)
            if not started:
                return self.send_json(409, {"error": "a run is already active"})
            return self.send_json(202, {"started": True})

        if path == "/api/create":
            files = course.lesson_files()
            if not files:
                return self.send_json(409, {"error": "no lessons"})
            next_id = course.next_lesson_id()
            style_lesson = files[-1]
            korrekturen = sorted(course.pdata_dir.glob("*-korrektur.md"))
            last_korr = korrekturen[-1].as_posix() if korrekturen else "none yet"
            titles = ", ".join(
                f"{course.lid_of(p.name)} {course.lesson_title(p.read_text(encoding='utf-8'))}"
                for p in files
            )
            try:
                prompt = render_prompt("create.md", {
                    "LANG": course.language(),
                    "LANG_CODE": course.lang_code(),
                    "SYLLABUS": "syllabus.md",
                    "NEXT_ID": next_id,
                    "NEW_LESSON_FILE": f"lessons/{next_id}-<slug>.html",
                    "LESSONS_LIST": titles,
                    "LAST_KORREKTUR": last_korr,
                    "STYLE_LESSON": f"lessons/{style_lesson.name}",
                })
            except (KeyError, OSError) as exc:
                return self.send_json(500, {"error": str(exc)})
            started = spawn_run("create", prompt)
            if not started:
                return self.send_json(409, {"error": "a run is already active"})
            return self.send_json(202, {"started": True, "next_id": next_id})

        return self.send_json(404, {"error": "unknown endpoint"})


# --------------------------------------------------------------------------
# self-check
# --------------------------------------------------------------------------
def self_check():
    """Verify the site can actually serve the course. Used by --check."""
    problems = []
    if not course.lesson_files():
        problems.append("no lessons found in lessons/")
    for path in course.lesson_files():
        text = path.read_text(encoding="utf-8", errors="replace")
        name = path.name
        if 'id="practice-actions"' not in text:
            problems.append(f"{name}: missing #practice-actions block")
        if 'site.css' not in text:
            problems.append(f"{name}: missing site.css link")
        if 'site.js' not in text:
            problems.append(f"{name}: missing site.js script")
        if not course.practice_groups(text):
            problems.append(f"{name}: no practice textareas found")
    for name in ("check.md", "create.md"):
        path = course.prompts_dir / name
        if not path.is_file():
            problems.append(f"prompts/{name}: missing")
            continue
        template = path.read_text(encoding="utf-8")
        for placeholder in sorted(set(TEMPLATE_RE.findall(template))):
            if placeholder not in {"ID", "LANG", "LANG_CODE", "LESSON_FILE", "INPUTS_FILE",
                                   "OUTPUT_FILE", "GROUP_Q", "GROUP_W", "QUESTION_COUNT",
                                   "SPEAK_COUNT", "SYLLABUS", "NEXT_ID", "NEW_LESSON_FILE",
                                   "LESSONS_LIST", "LAST_KORREKTUR", "STYLE_LESSON"}:
                problems.append(f"prompts/{name}: unknown placeholder {{{placeholder}}}")
    if not (ROOT / "course.json").is_file():
        problems.append("course.json: missing")
    if problems:
        print("self-check FAILED:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"self-check OK: {len(course.lesson_files())} lessons, "
          f"{len(list(course.pdata_dir.glob('*.md'))) if course.pdata_dir.exists() else 0} practice files")
    return 0


def main():
    parser = argparse.ArgumentParser(description="teach-site local server")
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--no-open", action="store_true", help="do not open a browser")
    parser.add_argument("--check", action="store_true", help="verify the course and exit")
    args = parser.parse_args()

    if args.check:
        sys.exit(self_check())

    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    url = f"http://127.0.0.1:{args.port}/"
    print(f"teach-site running: {url}")
    if not args.no_open:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
