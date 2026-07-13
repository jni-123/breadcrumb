import type { BreadcrumbManifest, BreadcrumbReport } from "./types.js";
import { sanitizeReport } from "./privacy.js";
import { validateReport } from "./validation.js";

export interface SubmissionResult {
  accepted: boolean;
  status: number;
  id?: string;
  error?: string;
}

export interface SubmissionAuthentication {
  bearerToken?: string;
}

export const submitReport = async (
  report: BreadcrumbReport,
  manifest: BreadcrumbManifest,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
  authentication: SubmissionAuthentication = {},
): Promise<SubmissionResult> => {
  if (!manifest.accepted_events.includes(report.event_type)) {
    return {
      accepted: false,
      status: 0,
      error: "Event type is not accepted by owner",
    };
  }

  if (
    manifest.authentication?.type === "bearer" &&
    authentication.bearerToken === undefined
  )
    return {
      accepted: false,
      status: 0,
      error: "Owner requires bearer authentication",
    };

  const sanitized = sanitizeReport(report, manifest.privacy);
  const validation = validateReport(sanitized);
  if (!validation.valid) {
    return { accepted: false, status: 0, error: validation.errors.join("; ") };
  }

  const body = JSON.stringify(sanitized);
  if (Buffer.byteLength(body) > manifest.privacy.max_payload_bytes) {
    return {
      accepted: false,
      status: 0,
      error: "Report exceeds owner payload limit",
    };
  }

  try {
    const response = await fetcher(manifest.submission_url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(manifest.authentication?.type !== "bearer" ||
        authentication.bearerToken === undefined
          ? {}
          : { authorization: `Bearer ${authentication.bearerToken}` }),
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    const value = (await response.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
    };
    return {
      accepted: response.ok,
      status: response.status,
      ...(value.id === undefined ? {} : { id: value.id }),
      ...(value.error === undefined ? {} : { error: value.error }),
    };
  } catch (error) {
    return {
      accepted: false,
      status: 0,
      error: error instanceof Error ? error.message : "Submission failed",
    };
  }
};
