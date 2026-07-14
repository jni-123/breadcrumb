# Owner integration

This guide exposes an owner-controlled Breadcrumb endpoint backed by PostgreSQL. Package
publication is deferred in the current repository, so the runnable example uses workspace
packages under [`examples/owner-server`](../examples/owner-server/).

## 1. Create storage

```ts
import { postgresAdapter } from "@breadcrumb/postgres";

const storage = postgresAdapter({
  connectionString: process.env.DATABASE_URL,
});

await storage.migrate();
```

`migrate()` is idempotent. Production deployments should run migrations as a release step,
not on every request.

### Vercel Functions

Use `@breadcrumb/vercel` when the endpoint runs in Vercel Functions with a Marketplace
PostgreSQL integration:

```ts
import {
  createVercelGateway,
  createVercelPostgresResources,
} from "@breadcrumb/vercel";

const { storage, rateLimiter } = createVercelPostgresResources({
  connectionString: process.env.DATABASE_URL!,
  rateLimitKeySecret: process.env.BREADCRUMB_RATE_LIMIT_SECRET!,
});

export const gateway = createVercelGateway({
  publicOrigin: process.env.BREADCRUMB_PUBLIC_ORIGIN!,
  targetOrigin: process.env.BREADCRUMB_TARGET_ORIGIN!,
  storage,
  rateLimiter,
});
```

This uses a module-level `pg.Pool` and Vercel's `attachDatabasePool()` integration. Supply a
pooled connection URL, enable Fluid Compute, and do not close the storage adapter from a
request handler. See the complete
[`examples/vercel-gateway`](../examples/vercel-gateway/) deployment.

## 2. Configure policy and ingestion

```ts
import { createBreadcrumbHandler } from "@breadcrumb/server";

const handler = createBreadcrumbHandler({
  storage,
  policy: {
    acceptedOrigins: ["https://example.com"],
    acceptedEvents: [
      "task_failed",
      "task_degraded",
      "task_succeeded_with_friction",
    ],
    allowAnonymousAgents: true,
    allowUserPrompt: false,
    allowFileContents: false,
    allowScreenshots: false,
    maxPayloadBytes: 32768,
    maxReportsPerMinute: 20,
  },
});

export const POST = handler;
```

Production handlers must set `acceptedOrigins`; semantically equivalent origins are
normalized before comparison. Development-only or intentionally multi-tenant endpoints can
explicitly set `acceptAnyOrigin: true`.

The handler uses Fetch API `Request` and `Response`. In a Node HTTP server, translate the
incoming request as shown in
[`examples/owner-server/src/server.ts`](../examples/owner-server/src/server.ts).

### Optional bearer authentication

When anonymous reports are disabled, configure a bearer verifier. The same policy advertises
bearer authentication in the manifest and enforces it during ingestion:

```ts
const handler = createBreadcrumbHandler({
  storage,
  policy: {
    acceptedOrigins: ["https://example.com"],
    acceptedEvents: ["task_failed", "task_degraded"],
    allowAnonymousAgents: false,
    authentication: {
      type: "bearer",
      verify: async (token, request) => verifyOwnerToken(token, request),
    },
  },
});
```

Configuration fails at startup if anonymous reports are disabled without an authenticator.
A custom agent passes an externally provisioned token through the fourth `submitReport`
argument: `{ bearerToken }`. Anonymous reporting is the compatible policy for agents that
must work without prior installation or credential provisioning. Do not put bearer
credentials in repository manifests or reports.

## 3. Expose the owner manifest

Serve this document from `GET /.well-known/breadcrumb`:

```json
{
  "version": "0.1",
  "submission_url": "https://example.com/api/agent-feedback",
  "protocol_url": "https://raw.githubusercontent.com/jni-123/breadcrumb/main/protocol/protocol-0.1.json",
  "report_schema_url": "https://raw.githubusercontent.com/jni-123/breadcrumb/main/protocol/schemas/report-0.1.schema.json",
  "documentation_url": "https://example.com/agent-feedback/",
  "direct_submission": true,
  "accepted_events": [
    "task_failed",
    "task_degraded",
    "task_succeeded_with_friction"
  ],
  "privacy": {
    "allow_user_prompt": false,
    "allow_file_contents": false,
    "allow_screenshots": false,
    "max_payload_bytes": 32768
  },
  "allow_anonymous_agents": true,
  "authentication": { "type": "none" }
}
```

`manifestFromPolicy(policy, submissionUrl)` creates the same document from server policy,
including the protocol/schema links and `direct_submission: true`. Owners may self-host the
public documents and pass `{ protocolUrl, reportSchemaUrl, documentationUrl }` as the third
argument. This is recommended when the default reference URLs are not reachable from the
target agent. Use absolute public HTTPS URLs outside local development. Direct agents may
omit `deduplication`; the owner handler computes it before storage.

## 4. Advertise the target

For coding agents, commit `.breadcrumb.json` at the repository root:

```json
{
  "version": "0.1",
  "targets": [
    {
      "origin": "https://example.com",
      "manifest": "https://example.com/.well-known/breadcrumb",
      "provider": "Example"
    }
  ]
}
```

For websites, the experimental browser discovery relation is shown below. Runtime-specific
browser integrations may parse it; the current core package does not yet include an HTML
parser.

```html
<link rel="agent-feedback" href="/.well-known/breadcrumb" />
```

### Opt-in agent-facing Markdown block

Sites that already expose Markdown pages can append a concise `<AgentFeedback>` capability block
to every agent-facing representation. For the Vercel gateway, enable the option and pass Markdown
responses through the returned decorator:

```ts
const gateway = createVercelGateway({
  publicOrigin: "https://example.com",
  targetOrigin: "https://example.com",
  storage,
  agentFeedback: { embedInMarkdown: true },
});

const response = await renderMarkdownPage(request);
return gateway.decoratePage(request, response);
```

The option is off by default. `decoratePage` modifies only `text/markdown` responses from the
configured target origin, removes query strings and fragments from the advertised resource URL,
and adds `Vary: Accept`. It returns HTML unchanged. Put the decorator in the central Markdown
renderer or a framework adapter to cover every agent-facing page.

The block is absent from normal HTML, not secret: a human who opens the raw Markdown can see it.
Breadcrumb does not convert arbitrary HTML to Markdown, and the gateway cannot rewrite unrelated
application routes unless they pass through `decoratePage`. The embedded text remains a non-binding
capability notice; it does not override the agent runtime's network, privacy, or trust policy.

### Playwright and accessibility-tree discovery

Playwright-driven agents commonly inspect the rendered accessibility tree. The discovery
relation above is document-head metadata and does not normally appear in an accessibility
snapshot. `robots.txt` and `llms.txt` are also invisible unless the runtime deliberately
requests them. Keep those machine-readable surfaces, but do not make them the website's only
path to the feedback resource.

Add a visible semantic link in stable navigation or a footer:

```html
<footer>
  <a href="/agent-feedback/">How agent feedback works</a>
</footer>
```

The linked explanation should identify the resource near the top and link to the owner manifest,
protocol descriptor, report schema, and its minimal valid example. For reliable browser-agent
and human access:

- use a normal `<a>` with descriptive visible text and a keyboard-accessible focus target;
- render the link statically or server-side when possible;
- keep the explanation and machine resources on stable same-origin HTTPS URLs;
- avoid requiring authentication, cookies, consent dialogs, unusual menu interactions, or
  redirects merely to discover the resources;
- do not hide the only link with `aria-hidden`, icon-only controls, hover-only UI, canvas,
  CSS-generated text, or closed shadow DOM; and
- retain the `<link rel="agent-feedback">`, `robots.txt`, and `llms.txt` surfaces for runtimes
  that inspect them directly.

A visible link improves discovery; it is not a site-authored command, authorization grant, or
submission obligation. The participating runtime still decides whether to inspect or use the
resource under its existing network, security, and trust policy.

Breadcrumb can also safely upgrade existing robots and llms text at build time or in route
handlers:

```ts
import { upgradeLlmsTxt, upgradeRobotsTxt } from "@breadcrumb/core";

const robots = upgradeRobotsTxt(existingRobots, {
  manifestUrl: "https://example.com/.well-known/breadcrumb",
  llmsTxtUrl: "https://example.com/llms.txt",
});

const llms = upgradeLlmsTxt(existingLlms, {
  manifestUrl: "https://example.com/.well-known/breadcrumb",
});
```

A browser script cannot edit server-hosted `robots.txt`; the owner must generate or deploy
the upgraded file. See [robots.txt and llms.txt discovery](robots-and-llms.md). Agent users
install nothing: Codex, Claude Code, browser agents, and other runtimes can all follow the
same published instructions. Core web discovery supports the well-known path with
robots.txt as a fallback.

## Responses

| Status | Meaning                                                         |
| ------ | --------------------------------------------------------------- |
| `202`  | Accepted and stored; response contains an `id`                  |
| `400`  | Malformed JSON                                                  |
| `405`  | Method other than `POST`                                        |
| `401`  | Missing or invalid configured bearer authentication             |
| `413`  | Payload exceeds policy                                          |
| `422`  | Schema, event policy, privacy claim, or deduplication violation |
| `429`  | Rate limit exceeded                                             |
| `500`  | Authentication, rate limiting, or storage failed                |

## Database shape

Reports are append-only in `breadcrumb_reports`. Applied migration identifiers are recorded
in `breadcrumb_migrations`, and migration SQL under `packages/postgres/migrations/` is the
single source of truth. The complete report is stored as JSONB;
schema version, event, origin, outcome, deduplication, status, and timestamp are also stored
in indexed columns. See
[`001_create_reports.sql`](../packages/postgres/migrations/001_create_reports.sql).

## Production checklist

- Put the endpoint behind TLS and your normal edge protections.
- Replace the in-memory rate limiter when running multiple processes. Supply a `clientKey`
  resolver that reads only infrastructure-controlled request metadata; the generic handler
  deliberately does not trust `x-forwarded-for`. The Vercel integration uses its trusted edge
  header plus HMAC-keyed PostgreSQL buckets shared across function instances.
- Apply a restrictive CORS policy if browser clients are introduced.
- Monitor rejected payloads without logging their complete bodies.
- Set retention and deletion policies for telemetry.
- Keep prompts, file contents, screenshots, and raw traces disabled unless a future protocol
  version defines a safe, explicit mechanism.
- Treat confidence and attribution as agent assertions, not verified facts.
