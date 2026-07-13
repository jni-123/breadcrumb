import {
  discoverManifest,
  submitReport,
  withDeduplication,
  type BreadcrumbReport,
  type Friction,
} from "@breadcrumb/core";

import { feedbackTypes } from "./feedback.js";
import {
  newSessionState,
  readState,
  removeState,
  writeState,
  type SessionState,
} from "./state.js";

export type HookName = "SessionStart" | "PostToolUse" | "Stop";

export interface CodexHookInput {
  session_id?: string;
  turn_id?: string;
  cwd?: string;
  model?: string;
  source?: "startup" | "resume" | "clear" | "compact";
  tool_name?: string;
  tool_response?: unknown;
}

export interface HookResult {
  reported: boolean;
  reason?: string;
  reportId?: string;
  hookOutput?: {
    hookSpecificOutput: {
      hookEventName: "SessionStart";
      additionalContext: string;
    };
  };
}

const valueAt = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;

/** Inspect only status-shaped fields, then discard the response without persisting it. */
export const inferToolFailure = (response: unknown): boolean => {
  const exitCode =
    valueAt(response, "exit_code") ?? valueAt(response, "exitCode");
  if (typeof exitCode === "number") return exitCode !== 0;

  const metadata = valueAt(response, "metadata");
  const metadataExitCode =
    valueAt(metadata, "exit_code") ?? valueAt(metadata, "exitCode");
  if (typeof metadataExitCode === "number") return metadataExitCode !== 0;

  if (valueAt(response, "success") === false) return true;
  const status = valueAt(response, "status");
  if (typeof status === "string" && /^(?:error|failed|failure)$/i.test(status))
    return true;

  if (typeof response === "string") {
    const match = /(?:exit code|exited with code)[: ]+(\d+)/i.exec(
      response.slice(0, 512),
    );
    return match?.[1] !== undefined && Number(match[1]) !== 0;
  }
  return false;
};

const isCommandTool = (name: string): boolean =>
  /^(?:Bash|shell|shell_command|apply_patch)$/i.test(name);

const updateToolState = (
  state: SessionState,
  toolName: string,
  failed: boolean,
): void => {
  state.toolCalls += 1;
  if (isCommandTool(toolName)) state.commandCalls += 1;
  if (["Read", "NotebookRead", "read_file"].includes(toolName))
    state.filesInspected += 1;
  if (
    ["Grep", "Glob", "WebSearch", "WebFetch", "search", "web_search"].includes(
      toolName,
    )
  ) {
    state.searches += 1;
  }

  if (state.pendingFailures[toolName] === true) state.retries += 1;
  if (failed) {
    state.failedToolCalls += 1;
    if (isCommandTool(toolName)) state.commandFailures += 1;
    state.pendingFailures[toolName] = true;
  } else {
    delete state.pendingFailures[toolName];
  }
};

const dimensionStatuses = (
  state: SessionState,
): BreadcrumbReport["dimensions"] => {
  const types = new Set(state.declaredFeedback.map(({ type }) => type));
  const hasAny = (candidates: Friction["type"][]): boolean =>
    candidates.some((type) => types.has(type));
  const outcome = state.declaredAssessment?.outcome;
  const blockedOutcome = outcome === "failure" || outcome === "abandoned";
  const statusFor = (
    affected: boolean,
  ): BreadcrumbReport["dimensions"]["discoverability"]["status"] =>
    affected ? (blockedOutcome ? "blocked" : "degraded") : "unknown";
  return {
    discoverability: {
      status: statusFor(
        types.has("poor_discoverability") ||
          types.has("navigation_loop") ||
          state.searches >= 4,
      ),
    },
    comprehensibility: {
      status: statusFor(
        hasAny([
          "missing_information",
          "ambiguous_instruction",
          "conflicting_information",
          "stale_documentation",
          "version_mismatch",
          "undocumented_parameter",
        ]),
      ),
    },
    executability: {
      status: statusFor(
        state.failedToolCalls > 0 ||
          hasAny([
            "broken_example",
            "authentication_blocked",
            "inaccessible_control",
            "unexpected_state",
            "human_intervention_required",
            "unsupported_capability",
            "excessive_retries",
          ]),
      ),
    },
    verifiability: {
      status: statusFor(
        types.has("verification_missing") ||
          Object.keys(state.pendingFailures).length > 0,
      ),
    },
  };
};

const createReport = (
  state: SessionState,
  target: { origin: string; provider?: string },
): BreadcrumbReport => {
  const unresolved = Object.keys(state.pendingFailures).length > 0;
  const assessment = state.declaredAssessment;
  const status =
    assessment?.outcome ??
    (unresolved ? "partial_success" : "success_with_friction");
  const eventType =
    status === "failure" || status === "abandoned"
      ? "task_failed"
      : status === "partial_success"
        ? "task_degraded"
        : "task_succeeded_with_friction";
  const friction: Friction[] = state.declaredFeedback;
  const firstPublicResource = friction.find(({ resource }) => {
    if (resource === undefined) return false;
    try {
      return new URL(resource).origin === new URL(target.origin).origin;
    } catch {
      return false;
    }
  })?.resource;
  const base: Omit<BreadcrumbReport, "deduplication"> = {
    schema_version: "0.1",
    event_type: eventType,
    target: {
      type: firstPublicResource === undefined ? "repository" : "documentation",
      origin: target.origin,
      uri: firstPublicResource ?? target.origin,
      ...(target.provider === undefined ? {} : { provider: target.provider }),
    },
    task: { category: "coding_task" },
    outcome: {
      status,
      confidence: assessment?.confidence ?? 0.7,
      summary: friction[0]?.summary ?? "Agent-declared task friction.",
    },
    dimensions: dimensionStatuses(state),
    friction,
    metrics: {
      searches_performed: state.searches,
      files_inspected: state.filesInspected,
      tool_calls: state.toolCalls,
      command_calls: state.commandCalls,
      command_failures: state.commandFailures,
      retries: state.retries,
      elapsed_ms: Math.max(0, Date.now() - state.startedAt),
    },
    agent: {
      runtime: "codex",
      integration_version: "0.1.0",
      ...(process.env.CODEX_CLI_VERSION === undefined
        ? {}
        : { runtime_version: process.env.CODEX_CLI_VERSION }),
      ...(state.model === undefined ? {} : { model: state.model }),
    },
    privacy: {
      user_prompt_included: false,
      file_contents_included: false,
      screenshots_included: false,
    },
    attribution: assessment?.attribution ?? "unknown",
  };
  return withDeduplication(base);
};

export const handleHook = async (
  hook: HookName,
  input: CodexHookInput,
  feedbackCommand?: string,
): Promise<HookResult> => {
  const sessionId = input.session_id;
  if (sessionId === undefined || sessionId.length === 0) {
    return { reported: false, reason: "Missing session ID" };
  }
  const cwd = input.cwd ?? process.cwd();

  if (hook === "SessionStart") {
    const existing = await readState(sessionId);
    const state =
      existing !== null &&
      input.source !== "startup" &&
      input.source !== "clear"
        ? {
            ...existing,
            ...(input.model === undefined ? {} : { model: input.model }),
          }
        : newSessionState(sessionId, cwd, input.model);
    await writeState(sessionId, state, false);
    const additionalContext =
      feedbackCommand === undefined
        ? undefined
        : [
            "This repository supports optional Breadcrumb agent-experience feedback.",
            "Only when you independently encounter meaningful, target-attributable usability feedback, queue it with:",
            `Categories: ${feedbackTypes.join(", ")}.`,
            `${feedbackCommand} feedback --type <category> --concept <lowercase_identifier> --summary "<sanitized summary>" --outcome <success_with_friction|partial_success|failure|abandoned> --attribution <repository_failure|external_interface_failure|website_compatibility_failure|local_environment_failure|agent_internal_failure|unknown> [--confidence <0..1>] [--resource <public URL>]`,
            "Choose the semantic task outcome and attribution explicitly. Do not queue feedback merely because Breadcrumb is available. Do not include prompts, file contents, commands, credentials, private URLs, or other sensitive data. If you have no meaningful feedback, do nothing.",
          ].join("\n");
    return {
      reported: false,
      reason: "Session initialized",
      ...(additionalContext === undefined
        ? {}
        : {
            hookOutput: {
              hookSpecificOutput: {
                hookEventName: "SessionStart" as const,
                additionalContext,
              },
            },
          }),
    };
  }

  const state =
    (await readState(sessionId)) ??
    newSessionState(sessionId, cwd, input.model);
  if (hook === "PostToolUse") {
    if (input.tool_name !== undefined) {
      updateToolState(
        state,
        input.tool_name,
        inferToolFailure(input.tool_response),
      );
      await writeState(sessionId, state);
    }
    return { reported: false, reason: "Metric recorded" };
  }

  if (state.declaredFeedback.length === 0) {
    await removeState(sessionId);
    return { reported: false, reason: "No agent feedback declared" };
  }

  const discovered = await discoverManifest({ cwd });
  if (discovered === null)
    return { reported: false, reason: "No manifest discovered" };

  const report = createReport(state, discovered.target);
  const result = await submitReport(report, discovered.manifest);
  if (result.accepted || (result.status >= 400 && result.status < 500))
    await removeState(sessionId);
  return {
    reported: result.accepted,
    ...(result.id === undefined ? {} : { reportId: result.id }),
    ...(result.error === undefined ? {} : { reason: result.error }),
  };
};
