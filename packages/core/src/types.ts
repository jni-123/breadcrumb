export type EventType =
  "task_failed" | "task_degraded" | "task_succeeded_with_friction";

export type OutcomeStatus =
  | "success"
  | "success_with_friction"
  | "partial_success"
  | "failure"
  | "abandoned";

export type FrictionType =
  | "poor_discoverability"
  | "missing_information"
  | "ambiguous_instruction"
  | "conflicting_information"
  | "stale_documentation"
  | "version_mismatch"
  | "broken_example"
  | "undocumented_parameter"
  | "authentication_blocked"
  | "inaccessible_control"
  | "unexpected_state"
  | "navigation_loop"
  | "excessive_retries"
  | "verification_missing"
  | "human_intervention_required"
  | "unsupported_capability"
  | "other";

export interface ManifestPrivacy {
  allow_user_prompt: boolean;
  allow_file_contents: boolean;
  allow_screenshots: boolean;
  max_payload_bytes: number;
}

export interface BreadcrumbManifest {
  version: "0.1";
  submission_url: string;
  protocol_url?: string;
  report_schema_url?: string;
  documentation_url?: string;
  direct_submission?: true;
  accepted_events: EventType[];
  privacy: ManifestPrivacy;
  allow_anonymous_agents?: boolean;
  authentication?: { type: "none" | "bearer" };
}

export interface RepositoryTarget {
  origin: string;
  manifest: string;
  provider?: string;
}

export interface RepositoryManifest {
  version: "0.1";
  targets: RepositoryTarget[];
}

export interface DimensionAssessment {
  status: "good" | "degraded" | "blocked" | "unknown";
  summary?: string;
}

export interface Friction {
  type: FrictionType;
  resource?: string;
  concept?: string;
  summary: string;
}

export interface BreadcrumbMetrics {
  pages_visited?: number;
  searches_performed?: number;
  files_inspected?: number;
  tool_calls?: number;
  command_calls?: number;
  command_failures?: number;
  retries?: number;
  http_errors?: number;
  elapsed_ms?: number;
}

export interface BreadcrumbReportInput {
  schema_version: "0.1";
  event_type: EventType;
  target: {
    type:
      | "documentation"
      | "api"
      | "sdk"
      | "repository"
      | "cli"
      | "website"
      | "service"
      | "other";
    origin: string;
    uri: string;
    provider?: string;
    version?: string;
  };
  task: { category: string; description?: string };
  outcome: { status: OutcomeStatus; confidence: number; summary: string };
  dimensions: {
    discoverability: DimensionAssessment;
    comprehensibility: DimensionAssessment;
    executability: DimensionAssessment;
    verifiability: DimensionAssessment;
  };
  friction: Friction[];
  metrics: BreadcrumbMetrics;
  agent: {
    runtime: string;
    runtime_version?: string;
    model?: string;
    integration_version?: string;
  };
  privacy: {
    user_prompt_included: boolean;
    file_contents_included: boolean;
    screenshots_included: boolean;
  };
  attribution:
    | "agent_internal_failure"
    | "local_environment_failure"
    | "repository_failure"
    | "external_interface_failure"
    | "website_compatibility_failure"
    | "unknown";
  deduplication?: Deduplication;
}

export interface BreadcrumbReport extends BreadcrumbReportInput {
  deduplication: Deduplication;
}

export interface Deduplication {
  dedupe_hash: string;
  issue_key: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface DiscoveredManifest {
  manifest: BreadcrumbManifest;
  manifestUrl: string;
  repositoryManifestPath: string | null;
  target: RepositoryTarget;
}
