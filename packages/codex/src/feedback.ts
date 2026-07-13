import { redactText, type Friction, type FrictionType } from "@breadcrumb/core";

import { appendFeedbackForCwd, type DeclaredAssessment } from "./state.js";

const FRICTION_TYPES: ReadonlySet<string> = new Set<FrictionType>([
  "poor_discoverability",
  "missing_information",
  "ambiguous_instruction",
  "conflicting_information",
  "stale_documentation",
  "version_mismatch",
  "broken_example",
  "undocumented_parameter",
  "authentication_blocked",
  "inaccessible_control",
  "unexpected_state",
  "navigation_loop",
  "excessive_retries",
  "verification_missing",
  "human_intervention_required",
  "unsupported_capability",
  "other",
]);

export interface FeedbackInput {
  type: string;
  summary: string;
  concept?: string;
  resource?: string;
  outcome: string;
  attribution: string;
  confidence?: number;
}

const OUTCOMES = new Set<DeclaredAssessment["outcome"]>([
  "success_with_friction",
  "partial_success",
  "failure",
  "abandoned",
]);

const ATTRIBUTIONS = new Set<DeclaredAssessment["attribution"]>([
  "agent_internal_failure",
  "local_environment_failure",
  "repository_failure",
  "external_interface_failure",
  "website_compatibility_failure",
  "unknown",
]);

const declaredAssessment = (input: FeedbackInput): DeclaredAssessment => {
  if (!OUTCOMES.has(input.outcome as DeclaredAssessment["outcome"]))
    throw new Error("Feedback outcome is missing or unsupported");
  if (!ATTRIBUTIONS.has(input.attribution as DeclaredAssessment["attribution"]))
    throw new Error("Feedback attribution is missing or unsupported");
  const confidence = input.confidence ?? 0.7;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
    throw new Error("Feedback confidence must be between 0 and 1");
  return {
    outcome: input.outcome as DeclaredAssessment["outcome"],
    attribution: input.attribution as DeclaredAssessment["attribution"],
    confidence,
  };
};

const validateResource = (value: string): string => {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Feedback resource must use HTTP or HTTPS");
  }
  return url.href;
};

export const queueFeedback = async (
  cwd: string,
  input: FeedbackInput,
): Promise<boolean> => {
  if (!FRICTION_TYPES.has(input.type)) {
    throw new Error(`Unsupported feedback type: ${input.type}`);
  }
  const summary = redactText(input.summary.trim());
  if (summary.length === 0 || summary.length > 1000) {
    throw new Error("Feedback summary must contain 1 to 1000 characters");
  }
  if (
    input.concept !== undefined &&
    !/^[a-z0-9_:-]{1,100}$/.test(input.concept)
  ) {
    throw new Error("Feedback concept must be a lowercase identifier");
  }

  const feedback: Friction = {
    type: input.type as FrictionType,
    summary,
    ...(input.concept === undefined ? {} : { concept: input.concept }),
    ...(input.resource === undefined
      ? {}
      : { resource: validateResource(input.resource) }),
  };
  return appendFeedbackForCwd(cwd, feedback, declaredAssessment(input));
};

export const feedbackTypes = [...FRICTION_TYPES] as FrictionType[];
