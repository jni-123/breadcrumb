import { computeDeduplication, validateManifest } from "@breadcrumb/core";
import {
  createBreadcrumbHandler,
  manifestFromPolicy,
  MemoryStorage,
} from "@breadcrumb/server";
import { describe, expect, it } from "vitest";

import { makeReport } from "../../../tests/fixtures.js";

const policy = {
  acceptedEvents: ["task_succeeded_with_friction"] as const,
  acceptedOrigins: ["https://docs.example.com"],
  maxPayloadBytes: 32_768,
};

describe("ingestion handler", () => {
  it("stores a valid report", async () => {
    const storage = new MemoryStorage();
    const handler = createBreadcrumbHandler({
      storage,
      policy: { ...policy, acceptedEvents: [...policy.acceptedEvents] },
    });
    const response = await handler(
      new Request("https://owner.example/feedback", {
        method: "POST",
        body: JSON.stringify(makeReport()),
      }),
    );
    expect(response.status).toBe(202);
    expect(storage.reports).toHaveLength(1);
    expect(storage.reports[0]?.report.privacy.user_prompt_included).toBe(false);
  });

  it("adds deduplication for a zero-install direct submission", async () => {
    const storage = new MemoryStorage();
    const handler = createBreadcrumbHandler({
      storage,
      policy: { ...policy, acceptedEvents: [...policy.acceptedEvents] },
    });
    const { deduplication: expected, ...directReport } = makeReport();
    const response = await handler(
      new Request("https://owner.example/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(directReport),
      }),
    );

    expect(response.status).toBe(202);
    expect(storage.reports[0]?.report.deduplication).toEqual(expected);
  });

  it("rejects reports attributed to an unaccepted origin", async () => {
    const storage = new MemoryStorage();
    const handler = createBreadcrumbHandler({
      storage,
      policy: {
        ...policy,
        acceptedEvents: [...policy.acceptedEvents],
        acceptedOrigins: ["https://allowed.example"],
      },
    });

    const response = await handler(
      new Request("https://owner.example/feedback", {
        method: "POST",
        body: JSON.stringify(makeReport()),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Target origin is not accepted",
    });
    expect(storage.reports).toHaveLength(0);
  });

  it("rejects malformed, oversized, private, and forged reports", async () => {
    const storage = new MemoryStorage();
    const handler = createBreadcrumbHandler({
      storage,
      policy: {
        ...policy,
        acceptedEvents: [...policy.acceptedEvents],
        maxPayloadBytes: 2048,
      },
    });
    const malformed = await handler(
      new Request("https://owner.example/feedback", {
        method: "POST",
        body: "{",
      }),
    );
    expect(malformed.status).toBe(400);

    const privateReport = makeReport();
    privateReport.privacy.user_prompt_included = true;
    const privateResponse = await handler(
      new Request("https://owner.example/feedback", {
        method: "POST",
        body: JSON.stringify(privateReport),
      }),
    );
    expect(privateResponse.status).toBe(422);

    const forged = makeReport();
    forged.deduplication.dedupe_hash = `sha256:${"0".repeat(64)}`;
    const forgedResponse = await handler(
      new Request("https://owner.example/feedback", {
        method: "POST",
        body: JSON.stringify(forged),
      }),
    );
    expect(forgedResponse.status).toBe(422);

    const oversized = await handler(
      new Request("https://owner.example/feedback", {
        method: "POST",
        body: JSON.stringify({ padding: "x".repeat(3000) }),
      }),
    );
    expect(oversized.status).toBe(413);
  });

  it("normalizes accepted origins before comparison", async () => {
    const storage = new MemoryStorage();
    const handler = createBreadcrumbHandler({
      storage,
      policy: {
        acceptedEvents: [...policy.acceptedEvents],
        acceptedOrigins: ["https://docs.example.com"],
      },
    });
    const report = makeReport();
    report.target.origin = "https://docs.example.com/";
    report.deduplication = computeDeduplication(report);

    const response = await handler(
      new Request("https://owner.example/feedback", {
        method: "POST",
        body: JSON.stringify(report),
      }),
    );

    expect(response.status).toBe(202);
  });

  it("enforces advertised bearer authentication", async () => {
    const storage = new MemoryStorage();
    const authentication = {
      type: "bearer" as const,
      verify: (token: string) => token === "accepted-token",
    };
    const securedPolicy = {
      acceptedEvents: [...policy.acceptedEvents],
      acceptedOrigins: ["https://docs.example.com"],
      allowAnonymousAgents: false,
      authentication,
    };
    const handler = createBreadcrumbHandler({
      storage,
      policy: securedPolicy,
    });
    const manifest = manifestFromPolicy(
      securedPolicy,
      "https://owner.example/feedback",
      {
        protocolUrl: "https://owner.example/breadcrumb/protocol",
        reportSchemaUrl: "https://owner.example/breadcrumb/report-schema",
        documentationUrl: "https://owner.example/agent-feedback/",
      },
    );
    expect(validateManifest(manifest)).toEqual({ valid: true, errors: [] });
    expect(manifest).toMatchObject({
      direct_submission: true,
      protocol_url: "https://owner.example/breadcrumb/protocol",
      report_schema_url: "https://owner.example/breadcrumb/report-schema",
      documentation_url: "https://owner.example/agent-feedback/",
      allow_anonymous_agents: false,
      authentication: { type: "bearer" },
    });

    const unauthorized = await handler(
      new Request("https://owner.example/feedback", {
        method: "POST",
        body: JSON.stringify(makeReport()),
      }),
    );
    expect(unauthorized.status).toBe(401);

    const accepted = await handler(
      new Request("https://owner.example/feedback", {
        method: "POST",
        headers: { authorization: "Bearer accepted-token" },
        body: JSON.stringify(makeReport()),
      }),
    );
    expect(accepted.status).toBe(202);
  });

  it("requires explicit origin policy and handles limiter failure", async () => {
    expect(() =>
      createBreadcrumbHandler({
        storage: new MemoryStorage(),
        policy: { acceptedEvents: [...policy.acceptedEvents] },
      }),
    ).toThrow("acceptedOrigins is required");
    expect(() =>
      createBreadcrumbHandler({
        storage: new MemoryStorage(),
        policy: {
          acceptedEvents: [...policy.acceptedEvents],
          acceptedOrigins: ["https://docs.example.com"],
          allowUserPrompt: true,
        },
      }),
    ).toThrow("does not support accepting prompts");

    const handler = createBreadcrumbHandler({
      storage: new MemoryStorage(),
      policy: {
        acceptedEvents: [...policy.acceptedEvents],
        acceptedOrigins: ["https://docs.example.com"],
      },
      rateLimiter: {
        consume: () => Promise.reject(new Error("unavailable")),
      },
    });
    const response = await handler(
      new Request("https://owner.example/feedback", {
        method: "POST",
        body: JSON.stringify(makeReport()),
      }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Rate limiter failed" });
  });
});
