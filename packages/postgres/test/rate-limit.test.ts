import { postgresRateLimiter } from "@breadcrumb/postgres";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
});

describe("PostgreSQL rate limiter", () => {
  it("persists only an HMAC of the client key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T12:34:56.000Z"));
    const query = vi.fn().mockResolvedValue({
      rows: [{ request_count: 1 }],
      rowCount: 1,
    });
    const limiter = postgresRateLimiter({ query } as unknown as Pool, {
      limit: 2,
      keySecret: "a-secure-test-secret-with-at-least-32-characters",
    });

    await expect(limiter.consume("203.0.113.8")).resolves.toBe(true);

    const values = query.mock.calls[0]?.[1] as unknown[];
    expect(values[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(values[0]).not.toBe("203.0.113.8");
    expect(values[1]).toEqual(new Date("2026-07-12T12:34:00.000Z"));
  });

  it("rejects a request once the shared count exceeds the limit", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ request_count: 3 }],
      rowCount: 1,
    });
    const limiter = postgresRateLimiter({ query } as unknown as Pool, {
      limit: 2,
      keySecret: "a-secure-test-secret-with-at-least-32-characters",
    });

    await expect(limiter.consume("client")).resolves.toBe(false);
  });

  it("requires a strong key secret", () => {
    expect(() =>
      postgresRateLimiter({} as Pool, {
        keySecret: "too-short",
      }),
    ).toThrow("at least 32 characters");
  });
});
