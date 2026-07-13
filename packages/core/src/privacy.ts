import type { BreadcrumbManifest, BreadcrumbReport } from "./types.js";

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk|pk|api)[-_][a-z0-9_-]{12,}\b/gi,
  /\bBearer\s+[a-z0-9._~+/=-]{8,}\b/gi,
  /\b(?:password|passwd|token|secret|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi,
  /\b[A-Za-z0-9+/]{32,}={0,2}\b/g,
];

export const redactText = (value: string): string => {
  let redacted = value;
  for (const pattern of SECRET_PATTERNS)
    redacted = redacted.replace(pattern, "[REDACTED]");
  return redacted;
};

export const sanitizeReport = (
  report: BreadcrumbReport,
  policy?: BreadcrumbManifest["privacy"],
): BreadcrumbReport => {
  // The reference SDK remains stricter than an owner that opts into private fields.
  void policy;
  return {
    ...report,
    target: {
      ...report.target,
      ...(report.target.provider === undefined
        ? {}
        : { provider: redactText(report.target.provider) }),
    },
    task: {
      category: report.task.category,
      ...(report.task.description === undefined
        ? {}
        : { description: redactText(report.task.description) }),
    },
    outcome: { ...report.outcome, summary: redactText(report.outcome.summary) },
    dimensions: Object.fromEntries(
      Object.entries(report.dimensions).map(([name, dimension]) => [
        name,
        dimension.summary === undefined
          ? { status: dimension.status }
          : {
              status: dimension.status,
              summary: redactText(dimension.summary),
            },
      ]),
    ) as BreadcrumbReport["dimensions"],
    friction: report.friction.map((item) => ({
      ...item,
      summary: redactText(item.summary),
    })),
    privacy: {
      user_prompt_included: false,
      file_contents_included: false,
      screenshots_included: false,
    },
  };
};

export const hasForbiddenPrivacyClaims = (report: BreadcrumbReport): boolean =>
  report.privacy.user_prompt_included ||
  report.privacy.file_contents_included ||
  report.privacy.screenshots_included;
