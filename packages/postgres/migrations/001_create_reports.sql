CREATE TABLE IF NOT EXISTS breadcrumb_reports (
  id text PRIMARY KEY,
  schema_version text NOT NULL,
  event_type text NOT NULL,
  target_origin text NOT NULL,
  outcome_status text NOT NULL,
  exact_fingerprint text NOT NULL,
  grouping_key text NOT NULL,
  report jsonb NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'rejected')),
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS breadcrumb_reports_exact_fingerprint_idx
  ON breadcrumb_reports (exact_fingerprint);
CREATE INDEX IF NOT EXISTS breadcrumb_reports_grouping_key_idx
  ON breadcrumb_reports (grouping_key);
CREATE INDEX IF NOT EXISTS breadcrumb_reports_origin_event_received_idx
  ON breadcrumb_reports (target_origin, event_type, received_at DESC);
