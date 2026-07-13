import { postgres } from "../src/gateway.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET")
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers: { "cache-control": "no-store" } },
      );
    const secret = process.env.CRON_SECRET;
    if (
      secret === undefined ||
      request.headers.get("authorization") !== `Bearer ${secret}`
    )
      return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );

    const deleted = await postgres.rateLimiter.prune();
    return Response.json(
      { deleted },
      { headers: { "cache-control": "no-store" } },
    );
  },
};
