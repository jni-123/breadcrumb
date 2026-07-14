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

  it("leaves page responses unchanged unless Markdown embedding is enabled", async () => {
    const gateway = createVercelGateway({
      publicOrigin: "https://feedback.example.com",
      targetOrigin: "https://docs.example.com",
      storage: new MemoryStorage(),
    });
    const response = new Response("# Guide\n", {
      headers: { "content-type": "text/markdown" },
    });

    expect(
      await gateway.decoratePage(
        new Request("https://docs.example.com/guide"),
        response,
      ),
    ).toBe(response);
  });

  it("embeds feedback in Markdown pages without exposing request location data", async () => {
    const gateway = createVercelGateway({
      publicOrigin: "https://feedback.example.com",
      targetOrigin: "https://docs.example.com",
      storage: new MemoryStorage(),
      agentFeedback: { embedInMarkdown: true },
    });
    const response = await gateway.decoratePage(
      new Request(
        "https://docs.example.com/guide?email=reader@example.com#private",
        { headers: { accept: "text/markdown" } },
      ),
      new Response("# Guide\n", {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-length": "8",
          vary: "Cookie",
        },
      }),
    );
    const body = await response.text();

    expect(body).toContain(
      'manifest="https://feedback.example.com/.well-known/breadcrumb"',
    );
    expect(body).toContain('resource="https://docs.example.com/guide"');
    expect(body).not.toContain("reader@example.com");
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("vary")).toBe("Cookie, Accept");
  });

  it("never embeds feedback in human-facing HTML", async () => {
    const gateway = createVercelGateway({
      publicOrigin: "https://feedback.example.com",
      targetOrigin: "https://docs.example.com",
      storage: new MemoryStorage(),
      agentFeedback: { embedInMarkdown: true },
    });
    const response = new Response("<h1>Guide</h1>", {
      headers: { "content-type": "text/html" },
    });

    expect(
      await gateway.decoratePage(
        new Request("https://docs.example.com/guide"),
        response,
      ),
    ).toBe(response);
    expect(await response.text()).not.toContain("AgentFeedback");
  });

  it("rejects decoration outside the configured target origin", async () => {
    const gateway = createVercelGateway({
      publicOrigin: "https://feedback.example.com",
      targetOrigin: "https://docs.example.com",
      storage: new MemoryStorage(),
      agentFeedback: { embedInMarkdown: true },
    });

    await expect(
      gateway.decoratePage(
        new Request("https://other.example.com/guide"),
        new Response("# Guide\n", {
          headers: { "content-type": "text/markdown" },
        }),
      ),
    ).rejects.toThrow("configured target origin");
  });
});
