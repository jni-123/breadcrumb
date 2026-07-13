import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  computeDeduplication,
  discoverManifest,
  redactText,
  submitReport,
  validateReport,
} from "@breadcrumb/core";
import { describe, expect, it } from "vitest";

import { makeReport } from "../../../tests/fixtures.js";

describe("core protocol", () => {
  it("validates direct reports without client-generated deduplication", () => {
    const report = makeReport();
    const directReport: Partial<typeof report> = { ...report };
    delete directReport.deduplication;
    expect(validateReport(report)).toEqual({ valid: true, errors: [] });
    expect(validateReport(directReport)).toEqual({ valid: true, errors: [] });
    expect(
      validateReport({ ...directReport, raw_prompt: "secret" }).valid,
    ).toBe(false);
  });

  it("keeps every canonical schema example valid", async () => {
    const schema = JSON.parse(
      await readFile(
        new URL(
          "../../../protocol/schemas/report-0.1.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { examples?: unknown[] };
    expect(schema.examples).toHaveLength(1);
    for (const example of schema.examples ?? []) {
      expect(validateReport(example)).toEqual({ valid: true, errors: [] });
    }
  });

  it("produces stable deduplication despite changing metrics and summaries", () => {
    const first = makeReport();
    const second = makeReport({
      metrics: { tool_calls: 100 },
      outcome: {
        status: "success_with_friction",
        confidence: 0.5,
        summary: "Different",
      },
    });
    expect(computeDeduplication(first)).toEqual(computeDeduplication(second));
  });

  it("redacts common credentials", () => {
    expect(
      redactText("token=super-secret-value and Bearer abcdefghijklmnop"),
    ).toBe("[REDACTED] and [REDACTED]");
  });

  it("requires and sends configured bearer authentication", async () => {
    const report = makeReport();
    const manifest = {
      version: "0.1" as const,
      submission_url: "https://owner.example/feedback",
      accepted_events: ["task_succeeded_with_friction" as const],
      privacy: {
        allow_user_prompt: false,
        allow_file_contents: false,
        allow_screenshots: false,
        max_payload_bytes: 32_768,
      },
      authentication: { type: "bearer" as const },
    };
    await expect(submitReport(report, manifest)).resolves.toMatchObject({
      accepted: false,
      error: "Owner requires bearer authentication",
    });

    let authorization: string | null = null;
    const result = await submitReport(
      report,
      manifest,
      (_input, init) => {
        authorization = new Headers(init?.headers).get("authorization");
        return Promise.resolve(
          Response.json({ id: "accepted" }, { status: 202 }),
        );
      },
      { bearerToken: "owner-token" },
    );
    expect(result.accepted).toBe(true);
    expect(authorization).toBe("Bearer owner-token");
  });

  it("discovers a website manifest through robots.txt when well-known is absent", async () => {
    const discovered = await discoverManifest({
      targetOrigin: "https://example.com/docs/page",
      cwd: await mkdtemp(join(tmpdir(), "breadcrumb-no-repository-")),
      fetch: (input) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (url.endsWith("/.well-known/breadcrumb")) {
          return Promise.resolve(new Response(null, { status: 404 }));
        }
        if (url.endsWith("/robots.txt")) {
          return Promise.resolve(
            new Response(
              "User-agent: *\nAllow: /\nAgent-Feedback: https://feedback.example/manifest\n",
            ),
          );
        }
        if (url === "https://feedback.example/manifest") {
          return Promise.resolve(
            Response.json({
              version: "0.1",
              submission_url: "https://feedback.example/reports",
              accepted_events: ["task_degraded"],
              privacy: {
                allow_user_prompt: false,
                allow_file_contents: false,
                allow_screenshots: false,
                max_payload_bytes: 32768,
              },
            }),
          );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      },
    });

    expect(discovered?.manifestUrl).toBe("https://feedback.example/manifest");
    expect(discovered?.repositoryManifestPath).toBeNull();
  });

  it("discovers a repository manifest by walking parent directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "breadcrumb-discovery-"));
    const child = join(root, "a", "b");
    await mkdir(child, { recursive: true });
    await writeFile(
      join(root, ".breadcrumb.json"),
      JSON.stringify({
        version: "0.1",
        targets: [
          {
            origin: "https://docs.example.com",
            manifest: "https://docs.example.com/.well-known/breadcrumb",
          },
        ],
      }),
    );
    const discovered = await discoverManifest({
      cwd: child,
      fetch: () =>
        Promise.resolve(
          Response.json({
            version: "0.1",
            submission_url: "/feedback",
            accepted_events: ["task_succeeded_with_friction"],
            privacy: {
              allow_user_prompt: false,
              allow_file_contents: false,
              allow_screenshots: false,
              max_payload_bytes: 32768,
            },
          }),
        ),
    });
    expect(discovered?.manifest.submission_url).toBe(
      "https://docs.example.com/feedback",
    );
  });
});
