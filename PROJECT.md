# Breadcrumb

> Product vision and design rationale. For implemented 0.1 behavior, use
> [`README.md`](README.md) and [`docs/`](docs/README.md); future-looking sections below are
> not current API guarantees.

> An open protocol and integration toolkit for agents to report how easily they discovered, understood, used, and verified software.

## Overview

Breadcrumb gives software owners a machine-readable feedback channel for AI agents.

A website, documentation portal, API, SDK, payment protocol, repository, or other software system exposes a Breadcrumb endpoint. Compatible agents discover that endpoint automatically and submit structured reports about their experience.

These reports can describe:

- Whether the agent completed its task
- How difficult the task was
- What resources the agent had to inspect
- Whether information was ambiguous, missing, stale, or contradictory
- Whether the agent could execute the documented workflow
- Whether the agent could verify that the task succeeded
- What measurable friction occurred, such as retries, searches, failed commands, or navigation loops

Its core goal is to define an open, storage-independent protocol that routes agent experience reports directly into infrastructure controlled by the software owner.

## Problem

Existing analytics systems can observe requests, page views, tool calls, latency, and failures. They are useful, but they often cannot explain the semantic reason an agent struggled.

For example, passive analytics may show that an agent:

- Visited seven documentation pages
- Repeated a search four times
- Received two HTTP errors
- Called an MCP tool several times
- Eventually completed the task

That data does not necessarily reveal:

- Two documentation pages contradicted each other
- A prerequisite was only mentioned in an unrelated guide
- The agent found the correct endpoint but could not determine the required authentication format
- The workflow succeeded, but there was no reliable way to verify the result
- A payment or API protocol was technically available but difficult to discover

Breadcrumb lets the agent report these conclusions directly and in a structured format.

## Core Idea

The software owner integrates Breadcrumb once.

```html
<script
  src="https://cdn.example.com/breadcrumb.js"
  data-endpoint="https://example.com/api/agent-feedback">
</script>
```

The integration exposes machine-readable discovery metadata, such as:

```html
<link
  rel="agent-feedback"
  href="https://example.com/.well-known/breadcrumb">
```

A compatible agent discovers the manifest:

```json
{
  "version": "0.1",
  "submission_url": "https://example.com/api/agent-feedback",
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
  }
}
```

The agent then submits a structured experience report when:

- The task fails
- The task partially succeeds
- The task succeeds with significant friction
- The agent encounters ambiguity, conflicting information, or excessive retries
- The agent cannot verify whether the task succeeded

## Product Positioning

Breadcrumb is best understood as:

> Usability telemetry for machine users.

It is not limited to websites. Potential targets include:

- Documentation
- APIs
- SDKs
- Repositories
- Authentication flows
- MCP servers
- Payment protocols
- Forms
- Developer portals
- Command-line tools
- Agent-facing services

## Design Principles

### 1. Agent-originated

The report is created by the agent that attempted the task.

This differs from traditional analytics, where the software owner instruments the server or client and infers what happened from logs.

### 2. Storage-independent

Breadcrumb should not require software owners to send data through a hosted Breadcrumb service.

The owner should be able to store reports in:

- PostgreSQL
- MySQL
- DynamoDB
- Supabase
- SQLite
- A webhook
- A message queue
- A custom internal system

PostgreSQL should be the first reference adapter, not the protocol itself. PostgreSQL is the
MVP storage adapter; integrate the others later.

### 3. Owner-controlled

Reports are visible only to the owner of the target system by default.

Breadcrumb is not intended to create public comment sections or public agent reviews.

### 4. Structured

Reports should use a versioned schema rather than unrestricted text.

Free-form explanations are useful, but they should be attached to typed outcomes, friction categories, metrics, and target metadata.

### 5. Privacy-preserving

Breadcrumb should prohibit sensitive content by default.

Agents should not submit:

- Raw user prompts
- Passwords
- Authentication tokens
- Cookies
- Payment details
- Form values
- Full private file contents
- Full DOM captures
- Hidden reasoning
- Unredacted screenshots
- Private communications

### 6. Deterministic where possible

The SDK should collect objective metrics and combine them with the agent's structured assessment.

Objective signals may include:

- Tool-call count
- Search count
- Pages visited
- Retries
- Command failures
- HTTP errors
- Elapsed time
- Human approvals
- Navigation loops
- Test failures

The agent can then explain why those events occurred.

### 7. Easy to adopt

The website or system owner should be able to integrate Breadcrumb in under ten minutes.

The agent user should install nothing and should not need task-specific human instructions
such as:

> Submit feedback if this task is difficult.

The system owner publishes the discovery metadata once.

## Initial Target Agents

The first integration targets any action-capable agent because these runtimes can browse
public website instructions, call APIs, and produce structured task assessments. Codex,
Claude Code, OpenClaw, Hermes, Pi, browser agents, and future runtimes all use the same
public discovery and direct-submission contract.

Agent users must not need to install a Breadcrumb package, plugin, hook, skill, or MCP
server. Runtime-specific adapters may remain optional enhancements, but they are not the
primary distribution or compatibility boundary.

## Automatic Reporting Model

Breadcrumb should let an agent leave feedback itself after meaningful task friction, with no
per-task human command and no local installation.

The preferred architecture is:

```text
Website well-known manifest, robots.txt, llms.txt, or HTML metadata
    |
    v
Any participating agent
    |
    +--> Discover owner policy and report schema
    +--> Assess outcome, attribution, and friction
    +--> Exclude private task material
    +--> POST directly to the owner endpoint
    |
    v
Owner-controlled validation, deduplicating, sanitization, rate limiting, and storage
```

A website cannot force arbitrary third-party runtime behavior. Zero-install reporting
therefore depends on compatible agents choosing to use the advertised resource or on runtimes
adopting the protocol natively. The owner endpoint treats every report as
untrusted and controls privacy validation, payload limits, deduplication, and rate limits.

## Outcome Model

Breadcrumb should support more than binary success and failure.

Recommended outcomes:

```text
success
success_with_friction
partial_success
failure
abandoned
```

A successful task may still be highly valuable to report.

Example:

> The agent successfully configured webhook verification, but only after checking three conflicting documentation pages and running two failed examples.

## Experience Dimensions

Breadcrumb should evaluate four primary dimensions.

### Discoverability

Could the agent find the relevant resource or capability?

Possible signals:

- Number of searches
- Number of pages visited
- Misleading navigation labels
- Poor site-search results
- Missing machine-readable metadata
- Multiple competing or duplicate pages
- Important content hidden in unrelated documentation

### Comprehensibility

Could the agent understand the information it found?

Possible signals:

- Ambiguous terminology
- Undefined fields
- Missing prerequisites
- Conflicting instructions
- Version mismatches
- Examples inconsistent with prose
- Unclear error semantics
- Missing edge-case documentation

### Executability

Could the agent act on the information?

Possible signals:

- Sample code failed
- API endpoint did not exist
- Required parameters were undocumented
- Authentication instructions were incomplete
- Commands were not copyable or runnable
- UI controls were not machine-operable
- Payment or protocol steps could not be invoked

### Verifiability

Could the agent confirm that the operation succeeded?

Possible signals:

- No machine-readable success state
- Ambiguous response
- Missing confirmation identifier
- Documentation does not explain completion semantics
- UI changes are not observable
- The agent cannot distinguish pending from completed state

## Friction Categories

An initial schema could support:

```text
poor_discoverability
missing_information
ambiguous_instruction
conflicting_information
stale_documentation
version_mismatch
broken_example
undocumented_parameter
authentication_blocked
inaccessible_control
unexpected_state
navigation_loop
excessive_retries
verification_missing
human_intervention_required
unsupported_capability
other
```

## Example Report

```json
{
  "schema_version": "0.1",
  "event_type": "task_succeeded_with_friction",
  "target": {
    "type": "documentation",
    "origin": "https://docs.example.com",
    "uri": "https://docs.example.com/webhooks/signatures",
    "provider": "Example",
    "version": "2026-07"
  },
  "task": {
    "category": "webhook_authentication",
    "description": "Find and implement webhook signature verification"
  },
  "outcome": {
    "status": "success_with_friction",
    "confidence": 0.94,
    "summary": "The implementation succeeded, but the required header format was only documented in a troubleshooting page."
  },
  "friction": [
    {
      "type": "poor_discoverability",
      "resource": "https://docs.example.com/troubleshooting/webhooks",
      "summary": "The required signature header format was absent from the primary guide."
    },
    {
      "type": "conflicting_information",
      "resource": "https://docs.example.com/webhooks/legacy",
      "summary": "The legacy page described a different hashing algorithm without clearly marking the page as outdated."
    }
  ],
  "metrics": {
    "pages_visited": 7,
    "searches_performed": 4,
    "tool_calls": 13,
    "retries": 2,
    "elapsed_ms": 84000
  },
  "agent": {
    "runtime": "codex",
    "runtime_version": "example",
    "model": "example-model"
  },
  "privacy": {
    "user_prompt_included": false,
    "file_contents_included": false,
    "screenshots_included": false
  },
  "deduplication": {
    "dedupe_hash": "sha256:...",
    "issue_key": "docs.example.com:webhook_authentication:conflicting_information:signature_header"
  }
}
```

## Deduplicationing

Breadcrumb should generate stable deduplication metadata that makes downstream deduplication straightforward.

The SDK does not need to own clustering or aggregation in the MVP.

Deterministic deduplication inputs may include:

```text
target origin
+ normalized resource path
+ task category
+ friction category
+ affected concept or element
+ schema version
```

Breadcrumb may generate two values:

### Dedupe hash

A deterministic hash used to identify highly similar reports.

### Grouping key

A readable normalized key that downstream systems can use for broader aggregation or semantic clustering.

Example:

```text
docs.example.com:webhook_authentication:missing_information:signature_header
```

## Storage Architecture

Agents should never connect directly to the owner's database.

The secure architecture is:

```text
Agent
    |
    v
POST /api/agent-feedback
    |
    +--> Validate schema
    +--> Enforce policy
    +--> Redact sensitive fields
    +--> Rate limit
    +--> Compute or verify deduplication
    |
    v
Owner-selected storage adapter
```

Suggested package structure:

```text
@breadcrumb/core
@breadcrumb/browser
@breadcrumb/server
@breadcrumb/postgres
@breadcrumb/webhook
@breadcrumb/claude-code
@breadcrumb/codex
```

Later adapters might include:

```text
@breadcrumb/mysql
@breadcrumb/dynamodb
@breadcrumb/supabase
@breadcrumb/openclaw
@breadcrumb/hermes
```

## Storage Adapter Interface

```ts
export interface BreadcrumbStorage {
  save(report: BreadcrumbReport): Promise<{ id: string }>;
}
```

Optional extensions:

```ts
export interface BreadcrumbStorage {
  save(report: BreadcrumbReport): Promise<{ id: string }>;
  list?(query: BreadcrumbQuery): Promise<BreadcrumbReport[]>;
  updateStatus?(
    id: string,
    status: "open" | "acknowledged" | "resolved" | "rejected"
  ): Promise<void>;
}
```

Example PostgreSQL integration:

```ts
import { createBreadcrumbHandler } from "@breadcrumb/server";
import { postgresAdapter } from "@breadcrumb/postgres";

export const POST = createBreadcrumbHandler({
  storage: postgresAdapter({
    connectionString: process.env.DATABASE_URL
  }),
  policy: {
    acceptedOrigins: ["https://example.com"],
    acceptedEvents: [
      "task_failed",
      "task_degraded",
      "task_succeeded_with_friction"
    ],
    allowScreenshots: false,
    allowUserPrompt: false
  }
});
```

## Discovery

Breadcrumb should support multiple discovery mechanisms.

### Browser metadata

This is a future runtime/browser integration route; the current core package does not parse
HTML metadata.

```html
<link
  rel="agent-feedback"
  href="https://example.com/.well-known/breadcrumb">
```

### Well-known manifest

```text
/.well-known/breadcrumb
```

### Repository manifest

```text
.breadcrumb.json
```

Example:

```json
{
  "version": "0.1",
  "targets": [
    {
      "origin": "https://example.com",
      "manifest": "https://example.com/.well-known/breadcrumb"
    }
  ]
}
```

The repository manifest helps coding agents discover feedback capabilities while working locally.

### robots.txt extension

```text
Agent-Feedback: https://example.com/.well-known/breadcrumb
```

This is an optional RFC 9309 extension record. It must not modify or override crawler access
rules. Unknown records are ignored by compliant robots parsers.

### llms.txt guidance

An optional `/llms.txt` Markdown section can explain the feedback capability and link to the
manifest. `llms.txt` is an emerging convention rather than a formal standard and should
remain a secondary discovery route.

## Owner Policy

The owner should control what the endpoint accepts.

```ts
createBreadcrumbHandler({
  storage,
  policy: {
    acceptedOrigins: ["https://example.com"],
    acceptedEvents: [
      "task_failed",
      "task_degraded",
      "task_succeeded_with_friction"
    ],
    allowAnonymousAgents: true,
    allowScreenshots: false,
    allowFileContents: false,
    allowUserPrompt: false,
    maxPayloadBytes: 32768,
    maxReportsPerMinute: 20
  }
});
```

The manifest should advertise these capabilities before submission.

## Trust Model

Breadcrumb should treat every report as untrusted telemetry.

Possible trust levels:

```text
anonymous
domain_associated
registered_agent
signed_provider
verified_test_run
```

The MVP should not claim that it can prove a request came from a philosophical or authentic AI agent.

Authentication may establish that a report came from:

- A registered runtime
- A known provider
- A signed integration
- A verified synthetic test

It cannot necessarily prove that no human initiated or modified the request.

## Initial MVP

The first MVP should prove two things:

1. A software owner can integrate Breadcrumb in under ten minutes.
2. A supported agent can discover and use the endpoint without task-specific reporting instructions.

### MVP Scope

- Versioned report schema
- Well-known and robots.txt web discovery
- Repository manifest
- Server-side ingestion handler
- PostgreSQL adapter
- Custom storage adapter interface
- Codex integration
- Automatic turn-end reporting
- Failure and significant-friction outcomes
- Objective interaction metrics
- Structured agent assessment
- Privacy defaults and redaction
- Stable deduplication
- Example documentation site
- End-to-end demo

### Explicitly Out of Scope

- Hosted analytics dashboard
- Billing
- Public feedback
- Complex organization permissions
- Semantic clustering
- Screenshots or video
- Raw execution traces
- Full support for every agent framework
- Formal standards-body work
- Strong agent identity guarantees
- Payment data collection
- Automatic issue creation across many platforms

## Recommended First Demo

Create an intentionally confusing documentation site.

Example task:

> Find and implement webhook signature verification.

The documentation should contain:

- A missing prerequisite
- A stale legacy page
- A working example hidden in a troubleshooting page
- An unclear success-verification step

Then run the task through Codex. Additional runtime comparisons, including Claude Code, are
follow-on work.

The agent should:

1. Discover the Breadcrumb manifest
2. Attempt the task
3. Eventually succeed or partially succeed
4. Detect meaningful friction
5. Submit a sanitized structured report
6. Write the report into the owner's PostgreSQL database
7. Produce a stable deduplication across repeated runs

This demonstrates that Breadcrumb captures information passive traffic analytics cannot easily infer.

## Competitive Positioning

Breadcrumb overlaps with several adjacent categories.

### Agent traffic analytics

Products such as Cloudflare, Scrunch, and TollBit can observe which agents or crawlers access a site and which resources they request.

Breadcrumb adds an explicit semantic account from the agent:

- What it was trying to accomplish
- Whether it succeeded
- Why it struggled
- Which information was contradictory
- Whether the result was verifiable

### Agent observability

Products such as PostHog, LangSmith, Langfuse, Braintrust, Galileo, and AgentOps instrument agents or agent-facing systems.

These systems generally serve the developer who owns the agent or the instrumented service.

Breadcrumb is designed for cross-organizational reporting:

```text
Independent agent
    |
    v
External documentation, API, website, or protocol
    |
    v
Report delivered to the external system owner
```

### Agent readiness auditing

Cloudflare and others can audit whether a website is machine-readable or agent-friendly.

Breadcrumb complements this with real interaction reports from agents performing actual tasks.

## Key Differentiator

Breadcrumb's defining feature is the direction and ownership of the signal.

```text
Traditional analytics:
System owner observes the agent.

Breadcrumb:
Agent reports its experience to the system owner.
```

The protocol is:

- Agent-originated
- Cross-organizational
- Structured
- Storage-independent
- Owner-controlled
- Privacy-preserving
- Broader than MCP, websites, or coding documentation

## Risks

### Adoption

Public machine-readable instructions cannot force arbitrary agents to participate. Agents
must voluntarily inspect and follow website discovery metadata, or runtimes must adopt the
protocol natively.

The MVP controls the owner manifest, direct endpoint, validation, and reference discovery
text. Long-term adoption may require support from agent frameworks, hosting providers,
browser runtimes, or infrastructure companies, but agent users should not install a
Breadcrumb-specific integration.

### Self-report reliability

Agents may be poorly calibrated or produce incorrect explanations.

Breadcrumb should combine agent assessment with objective metrics and clearly mark confidence.

### Noise

Ordinary successful tasks are not reported. There is no numeric threshold: the agent must
explicitly choose to provide meaningful, target-attributable feedback through a structured
runtime capability. Owners still control accepted event types and downstream retention.

### Privacy

Agents may accidentally include sensitive context.

The protocol and SDK must enforce restrictive defaults and redaction before submission.

### Attribution

Not every failure is caused by the target system.

Reports should distinguish:

```text
agent_internal_failure
local_environment_failure
repository_failure
external_interface_failure
website_compatibility_failure
```

Only failures attributable to the target should normally be submitted.

## Open Questions

- How should runtime hooks determine semantic task success?
- Which objective metrics can Claude Code and Codex expose reliably?
- How should owners authenticate known agent runtimes?
- Should the protocol include optional response messages from owners?
- Should the specification use `rel="agent-feedback"` or a Breadcrumb-specific relation?
- Should the well-known path remain generic or use `/.well-known/breadcrumb`?
- How should payment and other sensitive workflows be supported safely?
- How should the protocol represent multi-system tasks?
- Should Breadcrumb define compatibility scores, or leave scoring downstream?

## Long-Term Vision

Breadcrumb can evolve into an open feedback layer between agents and the systems they use.

A system declares:

> Here is where agents can report their experience, what events I accept, and what privacy constraints apply.

An agent reports:

> I attempted this task, this was the outcome, these measurable friction signals occurred, and this is what made the task difficult.

Over time, Breadcrumb could support:

- Documentation quality analytics
- API usability reporting
- MCP capability feedback
- Payment protocol compatibility
- Agent-ready authentication
- SDK integration quality
- Cross-model compatibility comparisons
- Synthetic agent usability testing
- Release-over-release agent experience measurement
- Open ecosystem standards for machine-user feedback

## One-Sentence Description

> Breadcrumb is an open protocol and toolkit that lets AI agents report how easily they discovered, understood, executed, and verified tasks across software systems.

## Tagline Options

- See where agents get lost.
- Feedback from the agents using your software.
- Understand your software's machine-user experience.
- Agent experience, reported at the source.
- Make your software easier for agents to use.
