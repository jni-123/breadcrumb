import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const loadMigration = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../migrations/${name}`, import.meta.url)),
    "utf8",
  );

export interface PostgresMigration {
  id: string;
  sql: string;
}

export const MIGRATION_000 = loadMigration("000_create_migrations.sql");
export const MIGRATION_001 = loadMigration("001_create_reports.sql");
export const MIGRATION_002 = loadMigration("002_create_rate_limit_buckets.sql");
export const MIGRATION_003 = loadMigration("003_add_report_deduplication.sql");

export const MIGRATIONS: readonly PostgresMigration[] = [
  { id: "000_create_migrations", sql: MIGRATION_000 },
  { id: "001_create_reports", sql: MIGRATION_001 },
  { id: "002_create_rate_limit_buckets", sql: MIGRATION_002 },
  { id: "003_add_report_deduplication", sql: MIGRATION_003 },
];
