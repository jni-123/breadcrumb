# End-to-end demo

The demo proves zero-install website discovery, runtime-neutral direct submission, owner
policy enforcement, server-generated deduplication, and PostgreSQL storage.

## Requirements

- Node.js 20 or newer
- pnpm 10
- Docker Desktop or another Docker daemon
- Ports `3000` and `5432` available

No agent runtime, plugin, hook, MCP server, or user-level installation is required.

## Start the owner side

From the repository root:

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm demo
```

`pnpm demo` remains in the foreground. In another terminal, inspect the public discovery
surfaces an agent can read:

```bash
curl http://localhost:3000/.well-known/breadcrumb
curl http://localhost:3000/robots.txt
curl http://localhost:3000/llms.txt
```

The manifest advertises `direct_submission: true`, the submission endpoint, accepted events,
privacy limits, and protocol/schema links. The text files explain that any agent may submit
directly without local Breadcrumb software.

## Submit as any agent

This request represents the JSON that Codex, Claude Code, a browser agent, or another runtime
can create after independently encountering meaningful friction:

```bash
curl -i http://localhost:3000/api/agent-feedback \
  -H 'content-type: application/json' \
  --data-binary @- <<'JSON'
{
  "schema_version": "0.1",
  "event_type": "task_degraded",
  "target": {
    "type": "documentation",
    "origin": "http://localhost:3000",
    "uri": "http://localhost:3000/docs/webhook-signatures"
  },
  "task": { "category": "coding_task" },
  "outcome": {
    "status": "partial_success",
    "confidence": 0.9,
    "summary": "Conflicting signature instructions required extra verification."
  },
  "dimensions": {
    "discoverability": { "status": "good" },
    "comprehensibility": { "status": "degraded" },
    "executability": { "status": "degraded" },
    "verifiability": { "status": "good" }
  },
  "friction": [{
    "type": "conflicting_information",
    "concept": "webhook_signature",
    "summary": "Current and legacy pages described incompatible signing inputs.",
    "resource": "http://localhost:3000/docs/webhook-signatures"
  }],
  "metrics": { "searches_performed": 3, "retries": 1 },
  "agent": { "runtime": "any-agent" },
  "privacy": {
    "user_prompt_included": false,
    "file_contents_included": false,
    "screenshots_included": false
  },
  "attribution": "repository_failure"
}
JSON
```

The request intentionally omits `deduplication`. The owner endpoint validates the untrusted
report and computes deterministic deduplication before storage. Inspect the result:

```bash
curl http://localhost:3000/api/reports
```

The stored report must not contain prompts, command text, file contents, tool input/output,
credentials, transcripts, or runtime session identifiers.

## Verify automatically

```bash
pnpm test:coverage
DATABASE_URL=postgresql://breadcrumb:breadcrumb@localhost:5432/breadcrumb \
  pnpm test:integration
```

## Clean up

```bash
docker compose down
```

Use `docker compose down -v` only when you also want to delete all local demo reports.
