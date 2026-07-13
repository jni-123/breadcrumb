import { createServer } from "node:http";

import {
  BREADCRUMB_PROTOCOL_URL,
  upgradeLlmsTxt,
  upgradeRobotsTxt,
} from "@breadcrumb/core";
import { manifestFromPolicy } from "@breadcrumb/server";

import { ingestionHandler, policy, storage } from "./config.js";

const port = Number(process.env.PORT ?? 3000);
const maxPayloadBytes = policy.maxPayloadBytes ?? 32_768;

class PayloadTooLargeError extends Error {}

const toRequest = async (
  request: import("node:http").IncomingMessage,
): Promise<Request> => {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxPayloadBytes)
    throw new PayloadTooLargeError("Payload too large");
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Uint8Array);
    receivedBytes += buffer.byteLength;
    if (receivedBytes > maxPayloadBytes)
      throw new PayloadTooLargeError("Payload too large");
    chunks.push(buffer);
  }
  const method = request.method ?? "GET";
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined)
      headers.set(name, Array.isArray(value) ? value.join(",") : value);
  }
  return new Request(
    `http://${request.headers.host ?? `localhost:${port}`}${request.url ?? "/"}`,
    {
      method,
      headers,
      ...(["GET", "HEAD"].includes(method)
        ? {}
        : { body: Buffer.concat(chunks), duplex: "half" as never }),
    },
  );
};

const send = async (
  response: import("node:http").ServerResponse,
  fetchResponse: Response,
): Promise<void> => {
  response.statusCode = fetchResponse.status;
  fetchResponse.headers.forEach((value, name) =>
    response.setHeader(name, value),
  );
  response.end(Buffer.from(await fetchResponse.arrayBuffer()));
};

const server = createServer((incoming, outgoing) => {
  void (async () => {
    try {
      const request = await toRequest(incoming);
      const url = new URL(request.url);
      if (
        url.pathname === "/.well-known/breadcrumb" &&
        request.method === "GET"
      ) {
        await send(
          outgoing,
          Response.json(
            manifestFromPolicy(
              policy,
              `http://localhost:${port}/api/agent-feedback`,
              {
                documentationUrl:
                  "https://github.com/jni-123/breadcrumb/blob/main/docs/agent-feedback.md",
              },
            ),
          ),
        );
        return;
      }
      if (url.pathname === "/robots.txt" && request.method === "GET") {
        const origin = `http://localhost:${port}`;
        await send(
          outgoing,
          new Response(
            upgradeRobotsTxt("User-agent: *\nAllow: /\n", {
              manifestUrl: `${origin}/.well-known/breadcrumb`,
            }),
            { headers: { "content-type": "text/plain; charset=utf-8" } },
          ),
        );
        return;
      }
      if (url.pathname === "/llms.txt" && request.method === "GET") {
        const origin = `http://localhost:${port}`;
        await send(
          outgoing,
          new Response(
            upgradeLlmsTxt(
              "# Breadcrumb demo\n\n> Agent feedback protocol demo.\n",
              {
                manifestUrl: `${origin}/.well-known/breadcrumb`,
                protocolUrl: BREADCRUMB_PROTOCOL_URL,
                documentationUrl:
                  "https://github.com/jni-123/breadcrumb/blob/main/docs/agent-feedback.md",
              },
            ),
            { headers: { "content-type": "text/plain; charset=utf-8" } },
          ),
        );
        return;
      }
      if (url.pathname === "/api/agent-feedback") {
        await send(outgoing, await ingestionHandler(request));
        return;
      }
      if (url.pathname === "/api/reports" && request.method === "GET") {
        const reports = (await storage.list?.({ limit: 100 })) ?? [];
        await send(outgoing, Response.json({ reports }));
        return;
      }
      await send(
        outgoing,
        new Response(
          "Breadcrumb demo owner server\n\nGET /.well-known/breadcrumb\nGET /robots.txt\nGET /llms.txt\nPOST /api/agent-feedback\nGET /api/reports\n",
          { headers: { "content-type": "text/plain; charset=utf-8" } },
        ),
      );
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        await send(
          outgoing,
          Response.json({ error: "Payload too large" }, { status: 413 }),
        );
        return;
      }
      console.error(error);
      await send(
        outgoing,
        Response.json({ error: "Internal error" }, { status: 500 }),
      );
    }
  })();
});

await storage.migrate();
server.listen(port, () => {
  console.log(`Breadcrumb owner server listening on http://localhost:${port}`);
});

const shutdown = (): void => {
  server.close(() => void storage.close());
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
