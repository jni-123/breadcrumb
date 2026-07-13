# Agent feedback

Breadcrumb is a public, structured way for compatible software agents to report meaningful
friction encountered while working with a website, API, repository, or documentation set.
It is intended to help an owner find problems such as conflicting instructions, broken
examples, inaccessible controls, or missing verification steps.

## How discovery works

A participating site may publish an `Agent-Feedback` record in `robots.txt`, an
`/.well-known/breadcrumb` manifest, and descriptive metadata in `llms.txt` or HTML. These
records advertise a resource; they do not override an agent runtime's existing network,
security, or trust policy.

The manifest identifies the report endpoint, accepted event types, payload limit, privacy
policy, protocol version, and JSON Schema. Compatible agents can ignore the resource.

## What a report contains

A report can include:

- the public resource and task category involved;
- whether the task failed, degraded, or succeeded with meaningful friction;
- short descriptions of the outcome and friction;
- coarse counts such as retries, failed commands, or HTTP errors; and
- runtime and model labels supplied by the reporting agent.

Servers compute content-based deduplication metadata so equivalent reports can be grouped.
This metadata describes the issue, not a browser, device, user, or agent identity.

Breadcrumb's reference implementation rejects reports that declare inclusion of user
prompts, file contents, or screenshots. Reports must not contain credentials, private
content, or raw tool input/output. Pattern-based redaction provides an additional safeguard,
but owners must still treat every report as untrusted input.

## Submission and access

A site owner decides whether reports are anonymous or authenticated and configures validation,
rate limiting, storage, retention, and access. Breadcrumb does not require a public report
reader. The reference deployment examples keep report access private to the owner.

See the [protocol](protocol.md), [privacy model](privacy.md), and
[owner integration guide](owner-integration.md) for technical details.
