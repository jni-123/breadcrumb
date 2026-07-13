import {
  postgresAdapterFromPool,
  postgresRateLimiter,
  type PostgresAdapter,
  type PostgresRateLimiter,
} from "@breadcrumb/postgres";
import {
  createBreadcrumbHandler,
  manifestFromPolicy,
  type BreadcrumbPolicy,
  type BreadcrumbStorage,
  type RateLimiter,
} from "@breadcrumb/server";
import { attachDatabasePool } from "@vercel/functions";
import { Pool, type PoolConfig } from "pg";

const DEFAULT_POLICY: BreadcrumbPolicy = {
  acceptedEvents: [
    "task_failed",
    "task_degraded",
    "task_succeeded_with_friction",
  ],
  allowAnonymousAgents: true,
  allowScreenshots: false,
  allowFileContents: false,
  allowUserPrompt: false,
  maxPayloadBytes: 32_768,
  maxReportsPerMinute: 20,
};

const normalizeOrigin = (value: string, label: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  const isLocalHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !isLocalHttp)
    throw new Error(`${label} must use HTTPS`);
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  )
    throw new Error(`${label} cannot include credentials or a path`);
  return url.origin;
};

export interface VercelPostgresOptions {
  connectionString: string;
  rateLimitKeySecret: string;
  pool?: Omit<PoolConfig, "connectionString">;
  maxReportsPerMinute?: number;
}

export interface VercelPostgresResources {
  storage: PostgresAdapter;
  rateLimiter: PostgresRateLimiter;
  dispose(): Promise<void>;
}

export const createVercelPostgresResources = ({
  connectionString,
  rateLimitKeySecret,
  pool: poolConfig,
  maxReportsPerMinute = 20,
}: VercelPostgresOptions): VercelPostgresResources => {
  if (connectionString.trim() === "")
    throw new Error("A PostgreSQL connection string is required");
  const pool = new Pool({
    ...poolConfig,
    connectionString,
    max: poolConfig?.max ?? 10,
  });
  attachDatabasePool(pool);
  return {
    // Vercel owns the pool lifecycle, so storage.close() intentionally does not end it.
    storage: postgresAdapterFromPool(pool),
    rateLimiter: postgresRateLimiter(pool, {
      limit: maxReportsPerMinute,
      keySecret: rateLimitKeySecret,
    }),
    // Reserved for local tests or explicit process shutdown, never request handlers.
    async dispose(): Promise<void> {
      await pool.end();
    },
  };
};

export interface VercelGatewayOptions {
  publicOrigin: string;
  targetOrigin: string;
  storage: BreadcrumbStorage;
  policy?: BreadcrumbPolicy;
  rateLimiter?: RateLimiter;
  protocolUrl?: string;
  reportSchemaUrl?: string;
  documentationUrl?: string;
}

export interface VercelGateway {
  manifest(request: Request): Promise<Response>;
  ingest(request: Request): Promise<Response>;
}

export const createVercelGateway = ({
  publicOrigin,
  targetOrigin,
  storage,
  policy = DEFAULT_POLICY,
  rateLimiter,
  protocolUrl,
  reportSchemaUrl,
  documentationUrl,
}: VercelGatewayOptions): VercelGateway => {
  const origin = normalizeOrigin(publicOrigin, "Breadcrumb public origin");
  const acceptedOrigin = normalizeOrigin(
    targetOrigin,
    "Breadcrumb target origin",
  );
  const effectivePolicy: BreadcrumbPolicy = {
    ...policy,
    acceptedOrigins: [acceptedOrigin],
  };
  const ingest = createBreadcrumbHandler({
    storage,
    policy: effectivePolicy,
    ...(rateLimiter === undefined ? {} : { rateLimiter }),
    // Vercel overwrites this edge header; generic servers must provide their own
    // trusted client-key resolver rather than trusting client-supplied headers.
    clientKey: (request) =>
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "vercel-unknown",
  });

  return {
    async manifest(request: Request): Promise<Response> {
      if (request.method !== "GET")
        return Response.json(
          { error: "Method not allowed" },
          { status: 405, headers: { "cache-control": "no-store" } },
        );
      return Response.json(
        manifestFromPolicy(effectivePolicy, `${origin}/api/agent-feedback`, {
          ...(protocolUrl === undefined ? {} : { protocolUrl }),
          ...(reportSchemaUrl === undefined ? {} : { reportSchemaUrl }),
          ...(documentationUrl === undefined ? {} : { documentationUrl }),
        }),
        { headers: { "cache-control": "public, max-age=300" } },
      );
    },
    ingest,
  };
};

export { DEFAULT_POLICY as DEFAULT_VERCEL_POLICY };
