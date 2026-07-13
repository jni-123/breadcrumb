import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleHook, queueFeedback } from "@breadcrumb/codex";
import type { BreadcrumbReport } from "@breadcrumb/core";
import { afterEach, describe, expect, it } from "vitest";

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
  delete process.env.BREADCRUMB_STATE_DIR;
});

describe("Codex vertical slice", () => {
  it("collects safe metrics, discovers policy, and submits on Stop", async () => {
    let received: BreadcrumbReport | undefined;
    const server = createServer((request, response) => {
      void (async () => {
        if (request.url === "/.well-known/breadcrumb") {
          response.setHeader("content-type", "application/json");
          response.end(
            JSON.stringify({
              version: "0.1",
              submission_url: "/feedback",
              accepted_events: [
                "task_failed",
                "task_degraded",
                "task_succeeded_with_friction",
              ],
              privacy: {
                allow_user_prompt: false,
                allow_file_contents: false,
                allow_screenshots: false,
                max_payload_bytes: 32768,
              },
            }),
          );
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of request)
          chunks.push(Buffer.from(chunk as Uint8Array));
        received = JSON.parse(
          Buffer.concat(chunks).toString("utf8"),
        ) as BreadcrumbReport;
        response.statusCode = 202;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ id: "report_1" }));
      })();
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("No test port");
    const origin = `http://127.0.0.1:${address.port}`;

    const cwd = await mkdtemp(join(tmpdir(), "breadcrumb-e2e-"));
    process.env.BREADCRUMB_STATE_DIR = join(cwd, "state");
    await writeFile(
      join(cwd, ".breadcrumb.json"),
      JSON.stringify({
        version: "0.1",
        targets: [{ origin, manifest: `${origin}/.well-known/breadcrumb` }],
      }),
    );

    const input = { session_id: "private-session-id", cwd };
    await handleHook("SessionStart", {
      ...input,
      source: "startup",
      model: "test-model",
    });
    await handleHook("PostToolUse", {
      ...input,
      tool_name: "Bash",
      tool_response: "Process exited with code 1",
    });
    expect(
      await queueFeedback(cwd, {
        type: "broken_example",
        concept: "signature_example",
        summary: "The documented signature example failed.",
        outcome: "failure",
        attribution: "repository_failure",
        confidence: 0.9,
      }),
    ).toBe(true);
    const result = await handleHook("Stop", input);

    expect(result).toEqual({ reported: true, reportId: "report_1" });
    expect(received?.event_type).toBe("task_failed");
    expect(received?.outcome).toMatchObject({
      status: "failure",
      confidence: 0.9,
    });
    expect(received?.attribution).toBe("repository_failure");
    expect(received?.dimensions.executability.status).toBe("blocked");
    expect(received?.metrics.command_failures).toBe(1);
    expect(received?.friction).toEqual([
      {
        type: "broken_example",
        concept: "signature_example",
        summary: "The documented signature example failed.",
      },
    ]);
    expect(received?.privacy).toEqual({
      user_prompt_included: false,
      file_contents_included: false,
      screenshots_included: false,
    });
    expect(JSON.stringify(received)).not.toContain("private-session-id");
  });
});
