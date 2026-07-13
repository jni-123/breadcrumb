#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";

import { discoverManifest } from "@breadcrumb/core";

import { queueFeedback } from "./feedback.js";
import { handleHook, type CodexHookInput, type HookName } from "./hooks.js";
import { hooksInstalled, installHooks, uninstallHooks } from "./install.js";

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8");
};

const option = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const main = async (): Promise<void> => {
  const [, , action, detail] = process.argv;
  const cwd = option("--cwd") ?? process.cwd();
  const codexHome =
    option("--codex-home") ??
    process.env.CODEX_HOME ??
    join(homedir(), ".codex");

  if (action === "install") {
    const path = await installHooks(codexHome, option("--command"));
    console.log(`Installed Breadcrumb hooks in ${path}`);
    console.log(
      "Codex will ask you to trust the commands the first time they run.",
    );
    return;
  }
  if (action === "uninstall") {
    const path = await uninstallHooks(codexHome);
    console.log(`Removed Breadcrumb hooks from ${path}`);
    return;
  }
  if (action === "doctor") {
    const installed = await hooksInstalled(codexHome);
    const discovered = await discoverManifest({ cwd });
    console.log(`Hooks: ${installed ? "installed" : "missing"}`);
    console.log(
      `Manifest: ${discovered === null ? "not discovered" : discovered.manifestUrl}`,
    );
    if (!installed || discovered === null) process.exitCode = 1;
    return;
  }
  if (action === "feedback") {
    const type = option("--type");
    const summary = option("--summary");
    const outcome = option("--outcome");
    const attribution = option("--attribution");
    if (
      type === undefined ||
      summary === undefined ||
      outcome === undefined ||
      attribution === undefined
    ) {
      throw new Error(
        "feedback requires --type, --summary, --outcome, and --attribution",
      );
    }
    const concept = option("--concept");
    const resource = option("--resource");
    const confidenceValue = option("--confidence");
    const queued = await queueFeedback(cwd, {
      type,
      summary,
      ...(concept === undefined ? {} : { concept }),
      ...(resource === undefined ? {} : { resource }),
      outcome,
      attribution,
      ...(confidenceValue === undefined
        ? {}
        : { confidence: Number(confidenceValue) }),
    });
    if (!queued)
      throw new Error("No active Codex session found for this directory");
    console.log(
      "Breadcrumb feedback queued for submission at the end of this turn.",
    );
    return;
  }
  if (action === "hook" && detail !== undefined) {
    const validHooks: HookName[] = ["SessionStart", "PostToolUse", "Stop"];
    if (!validHooks.includes(detail as HookName)) return;
    try {
      const raw = await readStdin();
      const input = (raw.length === 0 ? {} : JSON.parse(raw)) as CodexHookInput;
      const encodedCommand = option("--report-command-base64");
      const feedbackCommand =
        encodedCommand === undefined
          ? undefined
          : Buffer.from(encodedCommand, "base64").toString("utf8");
      const result = await handleHook(
        detail as HookName,
        input,
        feedbackCommand,
      );
      if (result.hookOutput !== undefined)
        console.log(JSON.stringify(result.hookOutput));
    } catch (error) {
      // Hooks must never interrupt the user's Codex session.
      console.error(
        `Breadcrumb hook skipped: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
    return;
  }

  console.error(
    "Usage: breadcrumb-codex <install|doctor|uninstall|feedback|hook> [options]",
  );
  process.exitCode = 2;
};

await main();
