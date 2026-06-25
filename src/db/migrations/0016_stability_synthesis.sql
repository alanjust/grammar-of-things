-- Stores all raw Pass 1 texts from every provider+run (JSON array, for debugging and future reanalysis)
ALTER TABLE objects ADD COLUMN fingerprint_stability_runs TEXT;

-- Stores the synthesized Pass 1 text produced from cross-model stability analysis.
-- This is what Pass 2 receives when present — it supersedes fingerprint_pass1_text.
-- fingerprint_pass1_text is preserved unchanged (Run 1, Claude only).
ALTER TABLE objects ADD COLUMN fingerprint_pass1_synthesized TEXT;
