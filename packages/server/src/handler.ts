import {
  BREADCRUMB_PROTOCOL_URL,
  BREADCRUMB_REPORT_SCHEMA_URL,
  computeDeduplication,
  hasForbiddenPrivacyClaims,
  isBreadcrumbReportInput,
  normalizeOrigin,
  sanitizeReport,
  type BreadcrumbManifest,
  type BreadcrumbReport,
  type EventType,
} from "@breadcrumb/core";

import { InMemoryRateLimiter, type RateLimiter } from "./rate-limit.js";
import type { BreadcrumbStorage } from "./storage.js";

export interface BearerAuthentication {
  type: "bearer";
  verify(token: string, request: Request): Promise<boolean> | boolean;
}

export interface BreadcrumbPolicy {
  acceptedEvents: EventType[];
  acceptedOrigins?: string[];
  /** Explicit opt-in for development or intentionally multi-tenant endpoints. */
  acceptAnyOrigin?: boolean;
  allowAnonymousAgents?: boolean;
  authentication?: BearerAuthentication;
  allowScreenshots?: boolean;
  allowFileContents?: boolean;
  allowUserPrompt?: boolean;
  maxPayloadBytes?: number;
  maxReportsPerMinute?: number;
}

export interface HandlerOptions {
  storage: BreadcrumbStorage;
  policy: BreadcrumbPolicy;
  rateLimiter?: RateLimiter;
  /** Resolve a key only from infrastructure-controlled request metadata. */
  clientKey?: (request: Request) => Promise<string> | string;
}

const json = (status: number, value: unknown): Response =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });

const readBoundedBody = async (
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | null> => {
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const assertSupportedPrivacyPolicy = (policy: BreadcrumbPolicy): void => {
  if (
    policy.allowUserPrompt === true ||
    policy.allowFileContents === true ||
    policy.allowScreenshots === true
  )
    throw new Error(
      "Protocol 0.1 does not support accepting prompts, files, or screenshots",
    );
};

export interface ManifestOptions {
  protocolUrl?: string;
  reportSchemaUrl?: string;
  documentationUrl?: string;
}

export const manifestFromPolicy = (
  policy: BreadcrumbPolicy,
  submissionUrl: string,
  options: ManifestOptions = {},
): BreadcrumbManifest => {
  assertSupportedPrivacyPolicy(policy);
  return {
    version: "0.1",
    submission_url: submissionUrl,
    protocol_url: options.protocolUrl ?? BREADCRUMB_PROTOCOL_URL,
    report_schema_url: options.reportSchemaUrl ?? BREADCRUMB_REPORT_SCHEMA_URL,
    ...(options.documentationUrl === undefined
      ? {}
      : { documentation_url: options.documentationUrl }),
    direct_submission: true,
    accepted_events: policy.acceptedEvents,
    privacy: {
      allow_user_prompt: false,
      allow_file_contents: false,
      allow_screenshots: false,
      max_payload_bytes: policy.maxPayloadBytes ?? 32_768,
    },
    allow_anonymous_agents:
      policy.authentication === undefined
        ? (policy.allowAnonymousAgents ?? true)
        : false,
    authentication: { type: policy.authentication?.type ?? "none" },
  };
};

export const createBreadcrumbHandler = ({
  storage,
  policy,
  rateLimiter = new InMemoryRateLimiter(policy.maxReportsPerMinute ?? 20),
  clientKey = () => "shared",
}: HandlerOptions): ((request: Request) => Promise<Response>) => {
  assertSupportedPrivacyPolicy(policy);
  if (policy.acceptedOrigins === undefined && policy.acceptAnyOrigin !== true)
    throw new Error(
      "acceptedOrigins is required unless acceptAnyOrigin is explicitly enabled",
    );
  if (
    policy.allowAnonymousAgents === false &&
    policy.authentication === undefined
  )
    throw new Error(
      "Anonymous reports cannot be disabled without authentication",
    );
  const acceptedOrigins = new Set(
    (policy.acceptedOrigins ?? []).map(normalizeOrigin),
  );
  const maxBytes = policy.maxPayloadBytes ?? 32_768;
  const privacyPolicy = manifestFromPolicy(policy, "http://localhost/").privacy;

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST")
      return json(405, { error: "Method not allowed" });

    if (policy.authentication !== undefined) {
      const authorization = request.headers.get("authorization");
      const token = authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : undefined;
      let authenticated = false;
      try {
        authenticated =
          token !== undefined &&
          token.length > 0 &&
          (await policy.authentication.verify(token, request));
      } catch {
        return json(500, { error: "Authentication failed" });
      }
      if (!authenticated)
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "www-authenticate": "Bearer",
          },
        });
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return json(413, { error: "Payload too large" });
    }

    let bytes: Uint8Array | null;
    try {
      bytes = await readBoundedBody(request, maxBytes);
    } catch {
      return json(400, { error: "Unable to read request body" });
    }
    if (bytes === null) return json(413, { error: "Payload too large" });

    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      return json(400, { error: "Malformed JSON" });
    }

    if (!isBreadcrumbReportInput(value)) {
      return json(422, { error: "Report does not match schema" });
    }
    if (!policy.acceptedEvents.includes(value.event_type)) {
      return json(422, { error: "Event type is not accepted" });
    }
    let reportOrigin: string;
    try {
      reportOrigin = normalizeOrigin(value.target.origin);
    } catch {
      return json(422, { error: "Target origin is invalid" });
    }
    if (policy.acceptAnyOrigin !== true && !acceptedOrigins.has(reportOrigin)) {
      return json(422, { error: "Target origin is not accepted" });
    }
    const expected = computeDeduplication(value);
    if (
      value.deduplication !== undefined &&
      (value.deduplication.dedupe_hash !== expected.dedupe_hash ||
        value.deduplication.issue_key !== expected.issue_key)
    ) {
      return json(422, { error: "Deduplication does not match report" });
    }
    const report: BreadcrumbReport = { ...value, deduplication: expected };
    if (hasForbiddenPrivacyClaims(report)) {
      return json(422, { error: "Report declares prohibited private content" });
    }

    try {
      if (!(await rateLimiter.consume(await clientKey(request))))
        return json(429, { error: "Rate limit exceeded" });
    } catch {
      return json(500, { error: "Rate limiter failed" });
    }

    const sanitized = sanitizeReport(report, privacyPolicy);
    try {
      const saved = await storage.save(sanitized);
      return json(202, { id: saved.id });
    } catch {
      return json(500, { error: "Storage failed" });
    }
  };
};
