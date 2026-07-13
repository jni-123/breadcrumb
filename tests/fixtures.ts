import { withDeduplication, type BreadcrumbReport } from "@breadcrumb/core";

export const makeReport = (
  overrides: Partial<Omit<BreadcrumbReport, "deduplication">> = {},
): BreadcrumbReport =>
  withDeduplication({
    schema_version: "0.1",
    event_type: "task_succeeded_with_friction",
    target: {
      type: "documentation",
      origin: "https://docs.example.com",
      uri: "https://docs.example.com/webhooks/signatures",
      provider: "Example",
    },
    task: { category: "webhook_authentication" },
    outcome: {
      status: "success_with_friction",
      confidence: 0.9,
      summary: "The task succeeded after a retry.",
    },
    dimensions: {
      discoverability: { status: "degraded" },
      comprehensibility: { status: "good" },
      executability: { status: "degraded" },
      verifiability: { status: "good" },
    },
    friction: [
      {
        type: "broken_example",
        concept: "signature_header",
        summary: "The first example failed.",
      },
    ],
    metrics: {
      tool_calls: 8,
      command_failures: 1,
      retries: 1,
      elapsed_ms: 1000,
    },
    agent: { runtime: "test-agent", integration_version: "0.1.0" },
    privacy: {
      user_prompt_included: false,
      file_contents_included: false,
      screenshots_included: false,
    },
    attribution: "external_interface_failure",
    ...overrides,
  });
