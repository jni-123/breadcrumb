import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  handleHook,
  hooksInstalled,
  hooksPath,
  inferToolFailure,
  installHooks,
  uninstallHooks,
} from "@breadcrumb/codex";
import { expect, it } from "vitest";

it("installs idempotently and preserves unrelated Codex hooks", async () => {
  const codexHome = await mkdtemp(join(tmpdir(), "breadcrumb-install-"));
  const path = hooksPath(codexHome);
  await mkdir(codexHome, { recursive: true });
  await writeFile(
    path,
    JSON.stringify({
      description: "Existing project hooks",
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "echo existing" }] }],
      },
    }),
  );

  await installHooks(codexHome, "breadcrumb-codex");
  await installHooks(codexHome, "breadcrumb-codex");
  expect(await hooksInstalled(codexHome)).toBe(true);
  const installed = JSON.parse(await readFile(path, "utf8")) as {
    hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> };
  };
  expect(installed.hooks.Stop).toHaveLength(2);
  expect(installed.hooks.Stop[0]?.hooks[0]?.command).toBe("echo existing");

  await uninstallHooks(codexHome);
  expect(await hooksInstalled(codexHome)).toBe(false);
  const uninstalled = await readFile(path, "utf8");
  expect(uninstalled).toContain("echo existing");
  expect(uninstalled).not.toContain("breadcrumb-codex hook");
});

it("removes only Breadcrumb commands from mixed hook groups", async () => {
  const codexHome = await mkdtemp(join(tmpdir(), "breadcrumb-mixed-hooks-"));
  const path = hooksPath(codexHome);
  await writeFile(
    path,
    JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [
              { type: "command", command: "echo existing" },
              {
                type: "command",
                command: "breadcrumb-codex hook Stop",
                timeout: 20,
                statusMessage: "Breadcrumb: recording privacy-safe metrics",
              },
            ],
          },
        ],
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: "breadcrumb-codex hook SessionStart",
              },
            ],
          },
        ],
        PostToolUse: [
          {
            hooks: [
              {
                type: "command",
                command: "breadcrumb-codex hook PostToolUse",
              },
            ],
          },
        ],
      },
    }),
  );

  await uninstallHooks(codexHome);
  const uninstalled = await readFile(path, "utf8");
  expect(uninstalled).toContain("echo existing");
  expect(uninstalled).not.toContain("breadcrumb-codex hook");
});

it("does not report when the agent declares no feedback", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "breadcrumb-no-feedback-"));
  process.env.BREADCRUMB_STATE_DIR = join(cwd, "state");
  const input = { session_id: "no-feedback-session", cwd };
  const started = await handleHook(
    "SessionStart",
    { ...input, source: "startup" },
    "breadcrumb-codex",
  );
  expect(started.hookOutput?.hookSpecificOutput.additionalContext).toContain(
    "If you have no meaningful feedback, do nothing.",
  );
  const stateDirectory = process.env.BREADCRUMB_STATE_DIR;
  if (stateDirectory === undefined) throw new Error("State directory missing");
  const [stateName] = await readdir(stateDirectory);
  if (stateName === undefined) throw new Error("State file missing");
  const persistedState = await readFile(
    join(stateDirectory, stateName),
    "utf8",
  );
  expect(persistedState).not.toContain(cwd);
  expect(JSON.parse(persistedState)).toHaveProperty("cwdHash");
  await handleHook("PostToolUse", {
    ...input,
    tool_name: "Bash",
    tool_response: "Process exited with code 1",
  });
  expect(await handleHook("Stop", input)).toEqual({
    reported: false,
    reason: "No agent feedback declared",
  });
  delete process.env.BREADCRUMB_STATE_DIR;
});

it("derives failure status without retaining tool output", () => {
  expect(
    inferToolFailure(
      "Chunk ID: x\nProcess exited with code 1\nFinal output:\nsecret",
    ),
  ).toBe(true);
  expect(inferToolFailure("Exit code: 0\nSuccess")).toBe(false);
  expect(inferToolFailure({ exit_code: 2, output: "private" })).toBe(true);
  expect(inferToolFailure({ status: "failed", message: "private" })).toBe(true);
});
