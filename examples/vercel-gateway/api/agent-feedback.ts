import { gateway } from "../src/gateway.js";

export default {
  async fetch(request: Request): Promise<Response> {
    return gateway.ingest(request);
  },
};
