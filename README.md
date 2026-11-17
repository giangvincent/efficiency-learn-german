# Handoff: learn-german-fast — German A2→B1 "Arbeitswelt & IT" course site (2026-11-17)

## Context

This repo is `teach-site`: a local, single-user web app that serves generated German lessons,
collects the learner's written/spoken practice in the browser, and spawns headless `cmd -p`
agent runs to correct submissions and to author the next lesson. Course: A2 → B1, Arbeitswelt & IT,
for Giang (native English, tech/IT job where German is the working language; measured A2 production /
low-B1 reception on 2026-10-03). There is **no git history**: `/Users/giangvincent/Documents/learn-german-fast`
has `.git` on branch `main` with **zero commits** and everything untracked. Test baseline (run 2026-11-17):
`node test_correction_contract.js` → `ALL PASS`, `node test_history_render.js` → `ALL PASS`,
`python3 server.py --check` → `self-check OK: 11 lessons, 9 practice files`. No known failing tests.

## What was implemented

- **Course content — lessons 0001–0011** (`lessons/0001-…​.html` … `lessons/0011-wohin-oder-wo.html`).
  Lessons 0001–0010 plus 0011 (Wechselpräpositionen, wohin?/wo?) are all marked ✅ in `syllabus.md`.
  Evidence: `grep '✅' syllabus.md` → 0001–0010 + "Wechselpräpositionen: wohin? wo? (an / auf / in) ✅".
  0011 carries 0 `data-practice="q"` textareas and 1 `data-practice="w"` textarea (verified via grep).
  Next unmarked syllabus topic = "Konjunktionen: aber, denn, deshalb, trotzdem" (server would mint 0012).
  Not committed — zero git history.
- **Practice pipeline** — `server.py` (stdlib-only `http.server`, binds 127.0.0.1, `PORT` env, default 8000):
  serves lessons with injected nav sidebar, saves practice to `practice-data/<id>-inputs.md`,
  renders `-korrektur.md` back into the page, and spawns `cmd -p -t --yolo --skip-onboarding
  --max-turns 150` for the `check` and `create` buttons. Prompt templates: `prompts/check.md`,
  `prompts/create.md`. Practice groups are identified **structurally** (`data-practice="q|w"` in the
  lesson HTML, `<!-- group:q|w -->` anchors in the correction Markdown), never by prose.
- **Learner data on disk** — `practice-data/`: inputs for 0001–0005; corrections for 0001–0004 only.
  `practice-data/0005-inputs.md` (805 B, uncorrected writing task) is the only pending correction.
  Evidence: directory listing, timestamps 2026-11-14 (0001–0003, 0005) and 2026-11-16 (0004-korrektur.md).
- **Test suite** — `test_correction_contract.js` (correction anchors bind to the next heading only;
  Chinese-language correction still places q/w sections correctly) and `test_history_render.js`
  (every historical korrektur renders its groups under the right textareas). Both pass. No `package.json`,
  no CI; tests are run by hand with `node`.
- **App shell assets** — `assets/site.css`, `site.js`, `drill.js`, `speak.js`, `sprechen.js`,
  `style.css`; `start.sh` (execs `python3 server.py`). No external runtime deps.
- **Archive (local-only, gitignored)** — `archive/` holds the earlier iteration: placement test
  (2026-10-03, A2), learning records, MISSION/NOTES/RESOURCES, old lesson ladder, stale analytics
  (`archive/docs/analytics/`, generated for the old layout, references paths that no longer match the
  root repo). `.gitignore` covers `__pycache__`, `.commandcode`, `archive/`.

### Not implemented / not landed (evidence-based exclusions)

- **`practice-data/0011-korrektur.md` does not exist.** `.teach-site-state.json` (mtime 2026-11-14 09:04)
  records a `check` run as `status:"done"` with tail: "Written to `practice-data/0011-korrektur.md` —
  group:w only (lesson has 0 question textareas), 3 sentences corrected sentence-by-sentence, plus
  Modelltext and Fehler-Matrix; `test_history_render.js` passes… `Repo has no `.git`, so nothing was committed."
  Neither `0011-inputs.md` nor `0011-korrektur.md` exists anywhere (`find . -name '0011-*'` → empty,
  excluding `.git`). The recorded run outcome is **not true of the filesystem** — treat it as lost or
  hallucinated output. Lesson 0011's correction work is unverified and must be redone or discarded.
- **No commits yet.** Branch `main` has 0 commits; nothing has been pushed. A remote exists:
  `origin = https://github.com/giangvincent/efficiency-learn-german.git` (fetch+push). The first
  push would publish all untracked files, including the learner profile in `archive/` only if
  un-ignored — `archive/` is currently gitignored, so it would not be published.
- **Lesson 0005's correction does not exist** despite its inputs being saved.
- **`0002-korrektur.md` is sparse**: its q-feedback parses to a single item numbered within 1..5
  ("q feedback items are numbered 1..5 (1 given)"); `test_history_render.js` tolerates sparse lists and
  passes. Whether 0002 was fully corrected is not verifiable from the artefact.

## Human actions required

**Must-do-before-launch (before any push/share or fresh clone elsewhere):**

1. **Initial commit.** Environment: repo root `/Users/giangvincent/Documents/learn-german-fast`.
   Add `.DS_Store` to `.gitignore` first (it is untracked and not ignored; `.gitignore` currently lists
   only `__pycache__`, `.commandcode`, `archive/`), then commit. Note: `archive/` is gitignored, so
   mission/notes/analytics will not be in the repo (see Future work — that is intentional but maybe not
   wanted). Where to record: this file's "What was implemented" once done.
2. **Reconcile the stale state record.** Inspect `.teach-site-state.json` (`check.status: "done"`,
   `tail` claims `0011-korrektur.md` written). Since both `0011-inputs.md` and `0011-korrektur.md` are
   absent, either (a) discard the state claim — set `check` back to `{"status":"idle"}` and carry on — or
   (b) re-do the correction from the learner's real 0011 inputs if they still exist outside the repo.
   Record the decision in `syllabus.md` only if 0011 is genuinely done; otherwise leave 0011's ✅ as
   content-done / practice-pending. Re-run `node test_history_render.js` after any correction rewrite.
3. **Correct lesson 0005.** Start the site (`./start.sh`), open http://127.0.0.1:8000/lessons/0005-ein-klarer-status.html,
   click "check" (or write `practice-data/0005-korrektur.md` via the same flow the other corrections used).
   Verify afterwards: `node test_history_render.js` → expect `ALL PASS` incl. a 0005 line.
   Record in the lesson's practice loop; no other file needs editing.
4. **Baseline verification on any machine used for continuing this work:**
   `node test_correction_contract.js && node test_history_render.js && python3 server.py --check`.
   All three must be green before generating 0012 (`NEXT_ID=0012`, topic "Konjunktionen").

**Human-gate (judgment calls — owner decision, not automatable):**

5. **Decide the fate of `archive/`.** It contains the learner profile (`archive/NOTES.md`), mission
   (`archive/MISSION.md`), resources, placement result and all analytics/learning records — currently
   gitignored and local-only. If the repo should carry the course context, un-ignore `archive/MISSION.md`,
   `NOTES.md`, `RESOURCES.md` (the learning records 0001–0005 are valuable) and decide on
   `archive/docs/analytics/` (stale — see below). Otherwise keep it out and note the loss in the syllabus.
6. **Decide whether syllabus.md's ✅ for 0011 stands.** Content was written and is structurally fine,
   but the recorded feedback loop (correction) never landed on disk. Recommend keeping ✅ for content and
   treating the correction as re-doable.
7. **`--yolo` agent runs.** `spawn_run()` calls `cmd -p -t --yolo --skip-onboarding`. `--yolo`
   auto-approves the agent's tool calls (lesson writes, syllabus edits). This is the designed flow and is
   acceptable on a localhost single-user machine; do **not** expose port 8000 beyond loopback and do not
   run the site as a shared service. If you want approval gating later, that is a code change to
   `spawn_run()` in `server.py` — not a config toggle.
8. **Weekly human pushback (from `archive/NOTES.md`):** schedule one 30-min 1:1 with a native speaker
   (iTalki/Preply) or post a recording to r/GermanPractice. No lesson in this repo provides it.

**Optional improvement:**

9. Add a minimal runner for the two test files (e.g. `npm test` with `package.json` or a `test.sh`) so the
   zero-commit baseline above is reproducible without reading this file. Not required for the current loop.

## Future work and investigations

- **Lost 0011 correction (see "Not implemented" above).** Why it matters: the state file's `tail` proves
  the agent believed it succeeded, yet nothing landed — the failure mode (headless `cmd -p` run reports
  done without the artefact) can silently recur. Mitigation to investigate: add a post-run existence check
  on `practice-data/<id>-korrektur.md` in `spawn_run()`'s worker before setting `status:"done"`, or have
  the prompt's `OUTPUT_FILE` verified by the site before flipping state. Not implemented; not recorded
  anywhere except this handoff.
- **Sparse 0002 feedback.** `0002-korrektur.md` yields 1 of 5 expected question items (passing per
  `test_history_render.js` toleration). Either the full correction is elsewhere or it needs regeneration.
  Deferred; not blocking. Archive has the older `0002-korrektur.md` for comparison if wanted.
- **Stale analytics.** `archive/docs/analytics/PROJECT_ANALYTICS.md` and `project-map.json` describe the
  pre-root layout (`docs/analytics/`, files that now live elsewhere); they were generated by an earlier
  LM Studio scan. Either regenerate against the current root (add the root as a new project via the
  laya-control MCP) or delete. Do not trust these maps for navigation.
- **Test-drift guard by hand only.** `test_history_render.js` is the only thing catching a malformed
  anchor in future corrections (`prompts/check.md` depends on `## ` heading discipline). Any change to the
  correction format must keep both tests green; there is no CI to notice otherwise.
- **`.teach-site-state.json` is written without cross-process locking** (single `threading.Lock` in-process).
  Two server processes on the same `PORT`/state file can clobber each other's `status`. Fine for one
  operator; worth a code comment or a lockfile if ever run shared. Not recorded elsewhere.
- **Dependency/security note.** `server.py` is stdlib-only; no known CVEs to pin. The trust boundary is the
  loopback bind plus the `--yolo` boundary above — both rely on this machine not being a shared host.
  `PORT` is the only env knob; `cmd` must be on `PATH` (`FileNotFoundError` → `status:"error"`, surfaced in
  `/api/state`).
- **Known-good baseline to protect:** both test files `ALL PASS`; `--check` OK (11 lessons). If any of these
  regress after generating 0012, fix the artefact, not the test (the tests encode the contract the site
  depends on).
- **Decision left to owner:** whether to push to `origin` at all (a public-looking remote for a
  personal learner-profile repo — `archive/` is the one thing keeping the profile out of git today) and
  whether `archive/` becomes part of the committed course.

## Pointers

- Repo root (all paths relative to `/Users/giangvincent/Documents/learn-german-fast`)
- Remote: `origin = https://github.com/giangvincent/efficiency-learn-german.git` — no commits, nothing pushed
- Site: `server.py`, `start.sh`, `assets/{site.css,site.js,drill.js,speak.js,sprechen.js,style.css}`
- Course: `syllabus.md` (0011 = Wechselpräpositionen ✅; next open = Konjunktionen),
  `course.json` (`lang: de-DE`), `lessons/0001-…`–`lessons/0011-wohin-oder-wo.html`
- Prompts: `prompts/check.md`, `prompts/create.md` (both use `cmd -p --yolo`)
- Learner data: `practice-data/0001..0005-inputs.md`, `practice-data/0001..0004-korrektur.md`
  (0002 sparse); **missing** `0005-korrektur.md`, `0011-inputs.md`, `0011-korrektur.md`
- Tests: `test_correction_contract.js`, `test_history_render.js` (run with `node`)
- State: `.teach-site-state.json` (stale `done` record — see Human actions #2)
- Local-only context (gitignored): `archive/MISSION.md`, `archive/NOTES.md`, `archive/RESOURCES.md`,
  `archive/learning-records/`, `archive/analytics` / `archive/docs/analytics/` (stale)
- Agent instructions: `AGENTS.md` = `CLAUDE.md` = `GEMINI.md` (identical satomoext routing block, project id 4)
- No README existed before this file; this document is the handoff and the repo entry point.
