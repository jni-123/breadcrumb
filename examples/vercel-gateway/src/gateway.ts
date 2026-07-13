import {
  createVercelGateway,
  createVercelPostgresResources,
} from "@breadcrumb/vercel";

const requiredEnvironmentVariable = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.trim() === "")
    throw new Error(`${name} is required`);
  return value;
};

const maxReportsPerMinute = Number(
  process.env.BREADCRUMB_MAX_REPORTS_PER_MINUTE ?? 20,
);
if (!Number.isInteger(maxReportsPerMinute) || maxReportsPerMinute <= 0)
  throw new Error(
    "BREADCRUMB_MAX_REPORTS_PER_MINUTE must be a positive integer",
  );

export const postgres = createVercelPostgresResources({
  connectionString: requiredEnvironmentVariable("DATABASE_URL"),
  rateLimitKeySecret: requiredEnvironmentVariable(
    "BREADCRUMB_RATE_LIMIT_SECRET",
  ),
  maxReportsPerMinute,
});

export const gateway = createVercelGateway({
  publicOrigin: requiredEnvironmentVariable("BREADCRUMB_PUBLIC_ORIGIN"),
  targetOrigin: requiredEnvironmentVariable("BREADCRUMB_TARGET_ORIGIN"),
  storage: postgres.storage,
  rateLimiter: postgres.rateLimiter,
});
