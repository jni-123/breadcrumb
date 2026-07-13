import { createHash } from "node:crypto";

import type { BreadcrumbReport, Deduplication } from "./types.js";

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9:_./-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

export const normalizeOrigin = (value: string): string => {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Origin must use HTTP or HTTPS");
  if (
    url.username !== "" ||
    url.password !== "" ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search !== "" ||
    url.hash !== ""
  )
    throw new Error(
      "Origin cannot include credentials, a path, query, or hash",
    );
  return url.origin.toLowerCase();
};

export const normalizeResourcePath = (value: string): string => {
  const url = new URL(value);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return path.toLowerCase();
};

export const computeDeduplication = (
  report: Omit<BreadcrumbReport, "deduplication"> | BreadcrumbReport,
): Deduplication => {
  const origin = normalizeOrigin(report.target.origin);
  const path = normalizeResourcePath(report.target.uri);
  const friction = [...report.friction]
    .map((item) => `${item.type}:${item.concept ?? "general"}`)
    .sort();
  const canonical = [
    report.schema_version,
    origin,
    path,
    report.task.category,
    ...friction,
  ].join("|");
  const primary = report.friction[0];
  const issueKey = [
    new URL(origin).host,
    slug(report.task.category),
    primary?.type ?? "other",
    slug(primary?.concept ?? path),
  ].join(":");

  return {
    dedupe_hash: `sha256:${createHash("sha256").update(canonical).digest("hex")}`,
    issue_key: issueKey.slice(0, 500),
  };
};

export const withDeduplication = (
  report: Omit<BreadcrumbReport, "deduplication">,
): BreadcrumbReport => ({
  ...report,
  deduplication: computeDeduplication(report),
});
