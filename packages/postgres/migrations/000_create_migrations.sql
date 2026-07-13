CREATE TABLE IF NOT EXISTS breadcrumb_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
