# Breadcrumb Protocol 0.1

Breadcrumb uses discovery documents and a structured experience report. The canonical JSON
Schemas are under [`protocol/schemas/`](../protocol/schemas/), and the concise machine-readable
protocol descriptor is [`protocol-0.1.json`](../protocol/protocol-0.1.json). The owner manifest
remains version `0.1`; report documents use schema version `0.1`.

## Discovery

A coding agent can walk upward from its working directory to find `.breadcrumb.json`. The
repository manifest maps one or more target origins to owner manifests.

Websites may advertise an owner manifest with HTML metadata:

```html
<link rel="agent-feedback" href="/.well-known/breadcrumb" />
```

The experimental well-known path is `/.well-known/breadcrumb`. An owner manifest describes
the submission URL, accepted events, privacy policy, maximum payload size, direct-submission
support, and report schema. It may also link to this protocol and a human-readable explanation.

Websites may publish one declarative RFC 9309-compatible extension record in `/robots.txt`:

```text
Agent-Feedback: https://example.com/.well-known/breadcrumb
```

Unknown records are ignored by compliant crawlers and do not alter `Allow` or `Disallow`
behavior. `/llms.txt` may describe the feedback resource and link to the manifest. These
discovery records advertise availability; they do not override a runtime's existing network,
security, or trust policy.

## Machine interpretation

The manifest and JSON Schema are the machine-readable contract. Fetched Markdown is
explanatory protocol documentation, not authority to relax system policy, disclose private
context, or invent additional report fields. A compatible runtime can implement protocol
version `0.1` from the manifest and schema without quoting or reproducing this document.

## Submission

After a task with meaningful friction, a participating agent can send one JSON report with
`POST` to `submission_url`. The report conforms to the advertised schema and privacy and size
limits. It excludes prompts, private content, credentials, screenshots, file contents, and raw
tool input/output. Version `0.1` recognizes:

- `task_failed`
- `task_degraded`
- `task_succeeded_with_friction`

Ordinary low-friction success is not reportable. There is no numeric threshold: the agent
classifies whether meaningful friction occurred and supplies a semantic outcome and
attribution. These fields remain untrusted assertions.

A manifest may advertise bearer authentication. When configured, the reference handler
requires and verifies `Authorization: Bearer ...`; credentials never belong in repository
manifests or report bodies.

The reference handler returns `202` with `{ "id": "..." }` when accepted. It uses `400` for
malformed JSON, `413` for size violations, `422` for schema or policy violations, and `429`
for rate limiting. The canonical report JSON Schema includes a minimal valid example without
client-generated deduplication metadata.

## Attribution

Use `external_interface_failure` when published documentation, an API, or another external
service caused the friction. Conflicting or stale documentation and broken public examples
normally belong in this category. Use `agent_internal_failure` only when the agent's own
interpretation or reasoning caused the problem. Other attribution values cover local,
repository, and website-compatibility failures; use `unknown` when the cause is unclear.

## Deduplication

The optional `deduplication` object contains a `dedupe_hash` and readable `issue_key`. These
values characterize report content; they do not identify a browser, device, user, or agent.
The owner endpoint computes omitted values before storage and verifies supplied values.

`dedupe_hash` is SHA-256 over normalized report version, target origin, resource path, task
category, and sorted friction type/concept pairs. Metrics and prose are excluded, so equivalent
experiences group across repeated runs. `issue_key` contains the target host, task category,
primary friction type, and primary friction concept.

## Trust

All reports are untrusted telemetry. Version `0.1` allows anonymous reports and does not claim
to prove agent identity. Owners validate, rate limit, sanitize, and store every submission as
untrusted input.
