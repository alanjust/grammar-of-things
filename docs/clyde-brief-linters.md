# Brief for Claude Code: wire linters.py into the eval loop

Paste this into Claude Code from the directory containing eval.py.

---

I have a new file, linters.py, that runs deterministic quality checks
(regex denylists, length assertions, cross-section duplication) on
Art Lab analysis output. I want it wired into eval.py so the checks
run on every generated analysis BEFORE the Haiku judge call.

Tasks:

1. Place linters.py in the same directory as eval.py (it's already
   there — confirm it imports cleanly: `from linters import
   run_linters, score_penalty`).

2. In eval.py, immediately after each Sonnet analysis is generated
   and before the Haiku judge is called:
   - Run `findings = run_linters(analysis_text)`
   - Compute `penalty = score_penalty(findings)`
   - Subtract the penalty from that output's final score
   - Log each finding (rule_id, severity, message, snippet) to
     whatever per-run log/report eval.py already produces, in a
     clearly labeled "LINT FINDINGS" block per test image

3. Behavior on "error"-severity findings (machinery leaks): still
   run the judge, but flag the run prominently. Do NOT skip the
   judge call — I want both signals during calibration.

4. Add a summary line to the run report: total findings by rule_id
   across all 4 test images, so recurring defects are visible at
   a glance.

5. Do not change the judge prompt, the spend cap, or any scoring
   logic other than applying the penalty. Baseline comparability
   matters — note in the report that scores now include lint
   penalties so the 76.2 baseline isn't directly comparable.

6. Run the eval once on the existing 4 test images and show me the
   lint findings before changing anything else. I need to see the
   false-positive rate (especially slop-vocabulary and
   section-duplication thresholds) before we trust the penalties.

Calibration notes for later, not now:
- SECTION_JACCARD_THRESHOLD (0.30) and
  SLOP_PER_1000_WORDS_THRESHOLD (2.0) are starting guesses.
  Tune against real outputs.
- The denylists in linters.py are mine to curate — when you see a
  new machinery leak in output, suggest the regex but let me
  approve additions.
