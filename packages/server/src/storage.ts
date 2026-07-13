import type { BreadcrumbReport } from "@breadcrumb/core";

export interface BreadcrumbQuery {
  origin?: string;
  eventType?: BreadcrumbReport["event_type"];
  limit?: number;
}

export const normalizeQueryLimit = (limit = 100): number => {
  if (!Number.isInteger(limit) || limit <= 0)
    throw new Error("Query limit must be a positive integer");
  return Math.min(limit, 1000);
};

export interface BreadcrumbStorage {
  save(report: BreadcrumbReport): Promise<{ id: string }>;
  list?(query: BreadcrumbQuery): Promise<BreadcrumbReport[]>;
  updateStatus?(
    id: string,
    status: "open" | "acknowledged" | "resolved" | "rejected",
  ): Promise<void>;
}

export class MemoryStorage implements BreadcrumbStorage {
  readonly reports: Array<{ id: string; report: BreadcrumbReport }> = [];

  async save(report: BreadcrumbReport): Promise<{ id: string }> {
    const id = `mem_${this.reports.length + 1}`;
    this.reports.push({ id, report: structuredClone(report) });
    return { id };
  }

  async list(query: BreadcrumbQuery = {}): Promise<BreadcrumbReport[]> {
    return this.reports
      .map(({ report }) => report)
      .filter(
        (report) =>
          query.origin === undefined || report.target.origin === query.origin,
      )
      .filter(
        (report) =>
          query.eventType === undefined ||
          report.event_type === query.eventType,
      )
      .slice(0, normalizeQueryLimit(query.limit))
      .map((report) => structuredClone(report));
  }
}
