CREATE TABLE IF NOT EXISTS breadcrumb_rate_limit_buckets (
  key_digest text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (key_digest, window_started_at)
);

CREATE INDEX IF NOT EXISTS breadcrumb_rate_limit_window_idx
  ON breadcrumb_rate_limit_buckets (window_started_at);
