import { computeDeduplication } from "@breadcrumb/core";
import { MemoryStorage } from "@breadcrumb/server";
import { createVercelGateway } from "@breadcrumb/vercel";
import { describe, expect, it } from "vitest";

import { makeReport } from "../../../tests/fixtures.js";

describe("Vercel gateway", () => {
  it("serves a production manifest without exposing reports", async () => {
    const gateway = createVercelGateway({
      publicOrigin: "https://feedback.example.com",
      targetOrigin: "https://docs.example.com",
      storage: new MemoryStorage(),
      protocolUrl: "https://feedback.example.com/breadcrumb/protocol",
      reportSchemaUrl: "https://feedback.example.com/breadcrumb/report-schema",
      documentationUrl: "https://feedback.example.com/agent-feedback/",
    });

    const response = await gateway.manifest(
      new Request("https://feedback.example.com/.well-known/breadcrumb"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await response.json()).toMatchObject({
      submission_url: "https://feedback.example.com/api/agent-feedback",
      protocol_url: "https://feedback.example.com/breadcrumb/protocol",
      report_schema_url:
        "https://feedback.example.com/breadcrumb/report-schema",
      documentation_url: "https://feedback.example.com/agent-feedback/",
      privacy: {
        allow_user_prompt: false,
        allow_file_contents: false,
        allow_screenshots: false,
      },
    });
  });

  it("stores a valid report through the Fetch API handler", async () => {
    const storage = new MemoryStorage();
    const gateway = createVercelGateway({
      publicOrigin: "https://feedback.example.com",
      targetOrigin: "https://docs.example.com",
      storage,
    });
    const report = makeReport();
    report.deduplication = computeDeduplication(report);

    const response = await gateway.ingest(
      new Request("https://feedback.example.com/api/agent-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(report),
      }),
    );

    expect(response.status).toBe(202);
    expect(storage.reports).toHaveLength(1);
  });

  it.each([
    "http://feedback.example.com",
    "https://user:secret@feedback.example.com",
    "https://feedback.example.com/path",
  ])("rejects unsafe public origin %s", (publicOrigin) => {
    expect(() =>
      createVercelGateway({
        publicOrigin,
        targetOrigin: "https://docs.example.com",
        storage: new MemoryStorage(),
      }),
    ).toThrow();
  });
});
