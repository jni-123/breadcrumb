import { createHmac, randomUUID } from "node:crypto";

import type { BreadcrumbReport } from "@breadcrumb/core";
import {
  normalizeQueryLimit,
  type BreadcrumbQuery,
  type BreadcrumbStorage,
  type RateLimiter,
} from "@breadcrumb/server";
import { Pool, type PoolConfig } from "pg";

import { MIGRATIONS } from "./migration.js";

export interface PostgresAdapter extends BreadcrumbStorage {
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export interface PostgresAdapterFromPoolOptions {
  closePool?: boolean;
}

export const postgresAdapterFromPool = (
  pool: Pool,
  { closePool = false }: PostgresAdapterFromPoolOptions = {},
): PostgresAdapter => ({
  async migrate(): Promise<void> {
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      await client.query("SELECT pg_advisory_xact_lock($1)", [1651663201]);
      const bootstrap = MIGRATIONS[0];
      if (bootstrap === undefined) throw new Error("No migrations configured");
      await client.query(bootstrap.sql);
      const applied = await client.query<{ id: string }>(
        "SELECT id FROM breadcrumb_migrations",
      );
      const appliedIds = new Set(applied.rows.map(({ id }) => id));
      for (const migration of MIGRATIONS) {
        if (appliedIds.has(migration.id)) continue;
        if (migration !== bootstrap) await client.query(migration.sql);
        await client.query(
          "INSERT INTO breadcrumb_migrations (id) VALUES ($1)",
          [migration.id],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      if (transactionStarted)
        await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },

  async save(report: BreadcrumbReport): Promise<{ id: string }> {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO breadcrumb_reports
        (id, schema_version, event_type, target_origin, outcome_status,
         exact_fingerprint, grouping_key, dedupe_hash, issue_key, report)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $6, $7, $8::jsonb)`,
      [
        id,
        report.schema_version,
        report.event_type,
        report.target.origin,
        report.outcome.status,
        report.deduplication.dedupe_hash,
        report.deduplication.issue_key,
        JSON.stringify(report),
      ],
    );
    return { id };
  },

  async list(query: BreadcrumbQuery = {}): Promise<BreadcrumbReport[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.origin !== undefined) {
      values.push(query.origin);
      conditions.push(`target_origin = $${values.length}`);
    }
    if (query.eventType !== undefined) {
      values.push(query.eventType);
      conditions.push(`event_type = $${values.length}`);
    }
    values.push(normalizeQueryLimit(query.limit));
    const result = await pool.query<{ report: BreadcrumbReport }>(
      `SELECT report FROM breadcrumb_reports
       ${conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`}
       ORDER BY received_at DESC LIMIT $${values.length}`,
      values,
    );
    return result.rows.map(({ report }) => report);
  },

  async updateStatus(id, status): Promise<void> {
    await pool.query(
      "UPDATE breadcrumb_reports SET status = $2 WHERE id = $1",
      [id, status],
    );
  },

  async close(): Promise<void> {
    if (closePool) await pool.end();
  },
});

export const postgresAdapter = (
  config: PoolConfig | { connectionString: string },
): PostgresAdapter =>
  postgresAdapterFromPool(new Pool(config), { closePool: true });

export interface PostgresRateLimiterOptions {
  limit?: number;
  windowMs?: number;
  keySecret: string;
}

export interface PostgresRateLimiter extends RateLimiter {
  prune(before?: Date): Promise<number>;
}

export const postgresRateLimiter = (
  pool: Pool,
  { limit = 20, windowMs = 60_000, keySecret }: PostgresRateLimiterOptions,
): PostgresRateLimiter => {
  if (!Number.isInteger(limit) || limit <= 0)
    throw new Error("Rate-limit value must be a positive integer");
  if (!Number.isInteger(windowMs) || windowMs <= 0)
    throw new Error("Rate-limit window must be a positive integer");
  if (keySecret.length < 32)
    throw new Error(
      "Rate-limit key secret must contain at least 32 characters",
    );

  return {
    async consume(key: string): Promise<boolean> {
      const keyDigest = createHmac("sha256", keySecret)
        .update(key)
        .digest("hex");
      const windowStartedAt = new Date(
        Math.floor(Date.now() / windowMs) * windowMs,
      );
      const result = await pool.query<{ request_count: number }>(
        `INSERT INTO breadcrumb_rate_limit_buckets
          (key_digest, window_started_at, request_count)
         VALUES ($1, $2, 1)
         ON CONFLICT (key_digest, window_started_at)
         DO UPDATE SET request_count = LEAST(
           breadcrumb_rate_limit_buckets.request_count + 1,
           $3
         )
         RETURNING request_count`,
        [keyDigest, windowStartedAt, limit + 1],
      );
      return (result.rows[0]?.request_count ?? limit + 1) <= limit;
    },

    async prune(before = new Date(Date.now() - windowMs * 2)): Promise<number> {
      const result = await pool.query(
        "DELETE FROM breadcrumb_rate_limit_buckets WHERE window_started_at < $1",
        [before],
      );
      return result.rowCount ?? 0;
    },
  };
};

export {
  MIGRATION_000,
  MIGRATION_001,
  MIGRATION_002,
  MIGRATION_003,
  MIGRATIONS,
} from "./migration.js";
