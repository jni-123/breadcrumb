ALTER TABLE breadcrumb_reports
  ADD COLUMN IF NOT EXISTS dedupe_hash text;
ALTER TABLE breadcrumb_reports
  ADD COLUMN IF NOT EXISTS issue_key text;

UPDATE breadcrumb_reports
SET dedupe_hash = exact_fingerprint,
    issue_key = grouping_key
WHERE dedupe_hash IS NULL OR issue_key IS NULL;

CREATE INDEX IF NOT EXISTS breadcrumb_reports_dedupe_hash_idx
  ON breadcrumb_reports (dedupe_hash);
CREATE INDEX IF NOT EXISTS breadcrumb_reports_issue_key_idx
  ON breadcrumb_reports (issue_key);
