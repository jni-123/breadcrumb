import { postgresAdapter } from "@breadcrumb/postgres";
import {
  createBreadcrumbHandler,
  type BreadcrumbPolicy,
} from "@breadcrumb/server";

export const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://breadcrumb:breadcrumb@localhost:5432/breadcrumb";

export const storage = postgresAdapter({ connectionString });

export const policy: BreadcrumbPolicy = {
  // This local demo intentionally accepts fixture targets from any origin.
  // Production integrations should set acceptedOrigins instead.
  acceptAnyOrigin: true,
  acceptedEvents: [
    "task_failed",
    "task_degraded",
    "task_succeeded_with_friction",
  ],
  allowAnonymousAgents: true,
  allowScreenshots: false,
  allowFileContents: false,
  allowUserPrompt: false,
  maxPayloadBytes: 32_768,
  maxReportsPerMinute: 20,
};

export const ingestionHandler = createBreadcrumbHandler({ storage, policy });
