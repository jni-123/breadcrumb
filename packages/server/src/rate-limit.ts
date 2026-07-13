export interface RateLimiter {
  consume(key: string): Promise<boolean> | boolean;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly entries = new Map<
    string,
    { count: number; windowStarted: number }
  >();

  constructor(
    private readonly limit = 20,
    private readonly windowMs = 60_000,
  ) {}

  consume(key: string): boolean {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (entry === undefined || now - entry.windowStarted >= this.windowMs) {
      this.entries.set(key, { count: 1, windowStarted: now });
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count += 1;
    return true;
  }
}
