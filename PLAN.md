# Breadcrumb TypeScript Vertical Slice Plan

> Historical implementation record for the original Codex vertical slice. The primary model
> is now runtime-neutral, zero-install direct submission; use [`README.md`](README.md) and
> [`docs/`](docs/README.md) for current behavior.

## Assumptions

- Breadcrumb will be implemented as a TypeScript monorepo.
- Codex CLI will be the first agent integration because it has the highest MVP priority and supports lifecycle hooks suitable for automatic reporting.

## Vertical-Slice Goal

Demonstrate this complete flow:

```text
Codex CLI task
  → runtime hooks expose optional feedback and collect safe metrics
  → agent explicitly declares meaningful, target-attributable feedback
  → repository manifest is discovered
  → owner manifest and policy are fetched
  → report is sanitized and deduplicated
  → server validates and accepts it
  → PostgreSQL stores it
```

No task-specific instruction should be required.

## 1. Replace the Python Scaffold

Convert the repository into a Node.js and TypeScript workspace.

Proposed structure:

```text
packages/
  core/
  server/
  postgres/
  codex/
examples/
  confusing-docs/
  owner-server/
protocol/
  schemas/
    manifest-0.1.schema.json
    report-0.1.schema.json
docs/
  protocol.md
  privacy.md
  codex.md
tests/
  e2e/
package.json
pnpm-workspace.yaml
tsconfig.base.json
eslint.config.js
docker-compose.yml
```

Tooling:

- Node.js 20+
- pnpm workspaces
- TypeScript strict mode
- Vitest
- ESLint and Prettier
- PostgreSQL via Docker Compose
- Changesets configured for package versioning and publication readiness

Remove the Python source, `uv` configuration, and Python CI.

## 2. Define the Protocol Contract

Create versioned JSON Schemas as the protocol's portable source of truth.

### Manifest Schema

Include:

- Protocol version
- Submission URL
- Accepted event types
- Payload-size limit
- Privacy capabilities
- Anonymous-agent policy
- Optional authentication metadata

Use these experimental version `0.1` conventions:

- Discovery relation: `rel="agent-feedback"`
- Well-known endpoint: `/.well-known/breadcrumb`
- Repository file: `.breadcrumb.json`

### Report Schema

Model:

- Event type
- Target metadata
- Task category, without raw prompts
- Outcome and confidence
- Four experience dimensions
- Typed friction entries
- Objective metrics
- Agent and runtime metadata
- Privacy declarations
- Attribution
- Dedupe hash and issue key

Use `additionalProperties: false` wherever practical.

### Initial Event Policy

Submit only:

- `task_failed`
- `task_degraded`
- `task_succeeded_with_friction`

Do not report ordinary low-friction success.

## 3. Implement `@breadcrumb/core`

Responsibilities:

- TypeScript protocol types
- JSON Schema validation
- URL and path normalization
- Manifest discovery
- Agent-declared feedback validation
- Privacy enforcement
- Secret redaction
- Payload-size enforcement
- Stable deduplication generation
- Submission client

Important APIs:

```ts
discoverManifest(context): Promise<DiscoveredManifest | null>
validateReport(value): ValidationResult
sanitizeReport(report, policy): BreadcrumbReport
computeDeduplication(report): Deduplication
submitReport(report, manifest): Promise<SubmissionResult>
```

### Privacy Rules

The client must never collect or serialize:

- User prompts
- Tool arguments
- Tool output
- File contents
- Environment variables
- Authentication values
- Full transcripts
- Screenshots

Only retain safe metadata such as tool name, timestamp, success or failure, and aggregate counts.

Apply privacy controls twice:

1. Before submission in the agent adapter
2. During ingestion on the owner server

## 4. Implement Owner Ingestion

### `@breadcrumb/server`

Provide a framework-neutral Fetch API handler:

```ts
createBreadcrumbHandler({
  storage,
  policy,
});
```

The handler will:

1. Enforce body-size limits
2. Parse JSON safely
3. Validate the schema
4. Confirm the event is accepted
5. Apply server-side sanitization
6. Recompute or verify deduplication
7. Apply basic rate limiting
8. Store the accepted report
9. Return a report ID

Expected responses:

- `202` accepted
- `400` malformed report
- `413` oversized report
- `422` schema or policy violation
- `429` rate limited

Expose a rate-limiter interface and ship an in-memory reference implementation. The later
Vercel slice adds HMAC-keyed distributed PostgreSQL buckets.

### `@breadcrumb/postgres`

Implement:

```ts
postgresAdapter({
  connectionString,
}): BreadcrumbStorage
```

Start with append-only storage:

```text
breadcrumb_reports
  id
  schema_version
  event_type
  target_origin
  outcome_status
  dedupe_hash
  issue_key
  report JSONB
  received_at
```

Include:

- SQL migration
- Indexes on deduplication, origin, event type, and timestamp
- Integration tests against PostgreSQL

## 5. Implement the Codex CLI Adapter

### Initial Technical Spike

Before finalizing the adapter, verify the current Codex CLI hook contract for:

- Session identification
- Tool completion and failure events
- Stop and end-of-task events
- Hook configuration and installation
- Whether hooks expose reliable command failure metadata

The implementation should degrade safely if a particular metric is unavailable.

### Hook Architecture

```text
Codex CLI hooks
  → collector CLI
  → per-session state file
  → end-of-task assessor
  → core discovery, sanitization, and submission
```

The session state should contain only aggregate-safe data:

```ts
{
  (sessionIdHash,
    startedAt,
    toolCalls,
    commandCalls,
    commandFailures,
    retries,
    searches,
    filesInspected,
    elapsedMs);
}
```

Do not persist transcript content, tool arguments, command text, or file paths unless explicitly proven safe and required.

### Agent-Declared Assessment

There is no numeric reporting threshold. Trusted `SessionStart` hook output tells the agent
about an optional structured feedback command. The agent invokes it only when it independently
has meaningful, target-attributable feedback. Trusted code validates, redacts, queues, and
submits that declaration at `Stop`.

- No declared feedback → no report or network request
- Declared feedback with normal completion → `success_with_friction`
- Declared feedback with unresolved failures → `partial_success`
- Detectable target-attributable failure → `failure`

The feedback command must reject prompts, file content, credentials, private resources, and
invalid categories before data enters session state.

### Installation CLI

Provide:

```bash
pnpm dlx @breadcrumb/codex install
pnpm dlx @breadcrumb/codex doctor
pnpm dlx @breadcrumb/codex uninstall
```

Installation must:

- Merge hooks without overwriting unrelated Codex hooks
- Be idempotent
- Explain every hook it adds
- Support a user-level installation that discovers repository manifests
- Preserve a backup before modifying configuration

## 6. Build the End-to-End Demo

### `examples/confusing-docs`

Create a small documentation target involving webhook verification:

- Primary guide omits a prerequisite
- Legacy page contains stale instructions
- Working example is elsewhere
- Verification command initially fails

Add `.breadcrumb.json` pointing to the demo owner manifest.

### `examples/owner-server`

Provide:

- `GET /.well-known/breadcrumb`
- `POST /api/agent-feedback`
- PostgreSQL-backed storage
- A minimal report-listing endpoint for demo verification
- No analytics dashboard

### One-Command Startup

Target developer flow:

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm demo
```

Documentation should keep owner adoption under ten minutes.

## 7. Testing Strategy

### Unit Tests

Cover:

- Schema validation
- URL normalization
- Discovery precedence
- Policy handling
- Redaction
- Payload limits
- Feedback declaration and validation
- Deduplication stability
- Hook configuration merging
- Session metric aggregation

### Integration Tests

Cover:

- Server handler with an in-memory adapter
- PostgreSQL save and retrieval
- Duplicate dedupe hashes
- Rejected event types
- Malformed and oversized payloads
- Client and server deduplication disagreement
- Manifest discovery and submission

### End-to-End Test

Simulate Codex hook events without requiring Codex CLI in CI:

1. Start owner server and PostgreSQL
2. Create a repository manifest
3. Emit synthetic session, tool, and stop hook events
4. Queue a structured semantic outcome, attribution, and significant-friction declaration
5. Submit automatically at Stop
6. Query PostgreSQL
7. Assert sanitized report contents
8. Repeat and assert the same deduplication metadata

A manual Codex CLI demo remains a release acceptance check.

## 8. CI and Documentation

CI should run:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:coverage
pnpm test:integration
pnpm build
```

Add PostgreSQL as a CI service.

Document:

- Ten-minute owner setup
- Codex CLI installation
- Protocol schemas
- Privacy guarantees
- Collected versus prohibited data
- Agent-declared reporting behavior
- Local demo procedure
- Current `0.1` limitations

## Acceptance Criteria

The vertical slice is complete when:

- Codex CLI can discover `.breadcrumb.json` automatically.
- No task-specific reporting instruction is needed.
- Low-friction tasks do not generate reports.
- A friction-heavy demo task generates a valid report.
- The report reaches the advertised owner endpoint.
- The endpoint validates and stores it in PostgreSQL.
- No prompts, file contents, tool arguments, or tool outputs are present.
- Malformed, disallowed, and oversized reports are rejected.
- Repeated equivalent runs produce the same dedupe hash.
- Installation and owner setup each take less than ten minutes.
- The complete flow is reproducible from repository documentation.

## Explicit Deferrals

After this slice:

- Native runtime adoption beyond public web instructions
- Browser script package
- Model-assisted semantic friction classification
- Authentication and signed agents
- Hosted dashboard
- Multi-target tasks
- Public package publication
- MySQL, DynamoDB, and Supabase adapters
- Compatibility scoring
- Production distributed rate limiting
