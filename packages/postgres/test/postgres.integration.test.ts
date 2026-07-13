import { postgresAdapter, postgresRateLimiter } from "@breadcrumb/postgres";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { makeReport } from "../../../tests/fixtures.js";

const connectionString = process.env.DATABASE_URL;

describe.skipIf(connectionString === undefined)("PostgreSQL adapter", () => {
  it("migrates, stores, lists, and updates reports", async () => {
    if (connectionString === undefined)
      throw new Error("DATABASE_URL is required");
    const storage = postgresAdapter({ connectionString });
    const concurrentStorage = postgresAdapter({ connectionString });
    await Promise.all([storage.migrate(), concurrentStorage.migrate()]);
    await concurrentStorage.close();
    const migrationPool = new Pool({ connectionString });
    const migrations = await migrationPool.query<{ id: string }>(
      "SELECT id FROM breadcrumb_migrations ORDER BY id",
    );
    expect(migrations.rows.map(({ id }) => id)).toEqual([
      "000_create_migrations",
      "001_create_reports",
      "002_create_rate_limit_buckets",
      "003_add_report_deduplication",
    ]);
    await migrationPool.end();
    const report = makeReport();
    const saved = await storage.save(report);
    const listed = await storage.list?.({
      origin: report.target.origin,
      limit: 10,
    });
    expect(
      listed?.some(
        (item) =>
          item.deduplication.dedupe_hash === report.deduplication.dedupe_hash,
      ),
    ).toBe(true);
    await storage.updateStatus?.(saved.id, "acknowledged");
    await storage.close();
  });

  it("shares rate limits through PostgreSQL", async () => {
    if (connectionString === undefined)
      throw new Error("DATABASE_URL is required");
    const storage = postgresAdapter({ connectionString });
    await storage.migrate();
    await storage.close();

    const pool = new Pool({ connectionString });
    const limiter = postgresRateLimiter(pool, {
      limit: 1,
      keySecret: "an-integration-secret-with-at-least-32-characters",
    });
    const key = `integration-${crypto.randomUUID()}`;
    await expect(limiter.consume(key)).resolves.toBe(true);
    await expect(limiter.consume(key)).resolves.toBe(false);
    await limiter.prune(new Date(Date.now() + 1));
    await pool.end();
  });
});
