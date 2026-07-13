import { createHmac, randomUUID } from "node:crypto";

import { computeDeduplication } from "@breadcrumb/core";
import { postgresAdapter } from "@breadcrumb/postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { makeReport } from "../fixtures.js";

const connectionString = process.env.DATABASE_URL;
const rateLimitSecret = "vercel-gateway-test-secret-with-32-characters";
const cronSecret = "vercel-gateway-test-cron-secret";
const clientAddress = "203.0.113.42";

interface FetchRoute {
  fetch(request: Request): Promise<Response>;
}

let manifestRoute: FetchRoute;
let ingestionRoute: FetchRoute;
let cleanupRoute: FetchRoute;
let dispose: () => Promise<void>;
let pool: Pool;
let savedReportId: string | undefined;

beforeAll(async () => {
  if (connectionString === undefined) return;

  const migrationStorage = postgresAdapter({ connectionString });
  await migrationStorage.migrate();
  await migrationStorage.close();

  vi.stubEnv("DATABASE_URL", connectionString);
  vi.stubEnv("BREADCRUMB_PUBLIC_ORIGIN", "http://localhost:3000");
  vi.stubEnv("BREADCRUMB_TARGET_ORIGIN", "https://docs.example.com");
  vi.stubEnv("BREADCRUMB_RATE_LIMIT_SECRET", rateLimitSecret);
  vi.stubEnv("BREADCRUMB_MAX_REPORTS_PER_MINUTE", "20");
  vi.stubEnv("CRON_SECRET", cronSecret);

  const [manifestModule, ingestionModule, cleanupModule, gatewayModule] =
    await Promise.all([
      import("../../examples/vercel-gateway/api/breadcrumb-manifest.js"),
      import("../../examples/vercel-gateway/api/agent-feedback.js"),
      import("../../examples/vercel-gateway/api/prune-rate-limits.js"),
      import("../../examples/vercel-gateway/src/gateway.js"),
    ]);
  manifestRoute = manifestModule.default;
  ingestionRoute = ingestionModule.default;
  cleanupRoute = cleanupModule.default;
  dispose = async () => gatewayModule.postgres.dispose();
  pool = new Pool({ connectionString });
});

afterAll(async () => {
  if (connectionString === undefined) return;

  const activePool = pool as Pool | undefined;
  if (activePool !== undefined) {
    if (savedReportId !== undefined)
      await activePool.query("DELETE FROM breadcrumb_reports WHERE id = $1", [
        savedReportId,
      ]);
    const keyDigest = createHmac("sha256", rateLimitSecret)
      .update(clientAddress)
      .digest("hex");
    await activePool.query(
      "DELETE FROM breadcrumb_rate_limit_buckets WHERE key_digest = $1",
      [keyDigest],
    );
    await activePool.end();
  }
  const disposeGateway = dispose as (() => Promise<void>) | undefined;
  if (disposeGateway !== undefined) await disposeGateway();
  vi.unstubAllEnvs();
});

describe.skipIf(connectionString === undefined)(
  "Vercel gateway route modules",
  () => {
    it("serves the rewritten well-known manifest handler", async () => {
      const response = await manifestRoute.fetch(
        new Request("http://localhost:3000/.well-known/breadcrumb"),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        submission_url: "http://localhost:3000/api/agent-feedback",
        privacy: {
          allow_user_prompt: false,
          allow_file_contents: false,
          allow_screenshots: false,
        },
      });
    });

    it("validates and persists a report through the Vercel Web Handler", async () => {
      const report = makeReport();
      report.deduplication = computeDeduplication(report);
      const response = await ingestionRoute.fetch(
        new Request("http://localhost:3000/api/agent-feedback", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": clientAddress,
          },
          body: JSON.stringify(report),
        }),
      );

      expect(response.status).toBe(202);
      const body = (await response.json()) as { id: string };
      savedReportId = body.id;
      const stored = await pool.query<{ report: unknown }>(
        "SELECT report FROM breadcrumb_reports WHERE id = $1",
        [savedReportId],
      );
      expect(stored.rows[0]?.report).toMatchObject({
        target: { origin: "https://docs.example.com" },
        privacy: {
          user_prompt_included: false,
          file_contents_included: false,
        },
      });
    });

    it("authenticates the cron route and prunes old rate-limit buckets", async () => {
      const oldDigest = createHmac("sha256", rateLimitSecret)
        .update(randomUUID())
        .digest("hex");
      await pool.query(
        `INSERT INTO breadcrumb_rate_limit_buckets
          (key_digest, window_started_at, request_count)
         VALUES ($1, now() - interval '10 minutes', 1)`,
        [oldDigest],
      );

      const wrongMethod = await cleanupRoute.fetch(
        new Request("http://localhost:3000/api/prune-rate-limits", {
          method: "POST",
        }),
      );
      expect(wrongMethod.status).toBe(405);

      const unauthorized = await cleanupRoute.fetch(
        new Request("http://localhost:3000/api/prune-rate-limits"),
      );
      expect(unauthorized.status).toBe(401);

      const authorized = await cleanupRoute.fetch(
        new Request("http://localhost:3000/api/prune-rate-limits", {
          headers: { authorization: `Bearer ${cronSecret}` },
        }),
      );
      expect(authorized.status).toBe(200);
      const cleanup = (await authorized.json()) as { deleted: number };
      expect(cleanup.deleted).toBeGreaterThanOrEqual(1);
      const remaining = await pool.query(
        "SELECT 1 FROM breadcrumb_rate_limit_buckets WHERE key_digest = $1",
        [oldDigest],
      );
      expect(remaining.rowCount).toBe(0);
    });
  },
);
