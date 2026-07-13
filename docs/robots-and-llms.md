# robots.txt and llms.txt discovery

Breadcrumb can be advertised in `robots.txt` and described in `llms.txt` without changing
crawler access policy or placing behavioral instructions in either file.

## Is llms.txt a standard?

`/llms.txt` is an emerging convention proposed in 2024 for publishing an LLM-oriented
Markdown overview and links. It is not an IETF standard, is not part of the Robots Exclusion
Protocol, and is not universally consumed by agent runtimes. Treat it as complementary
metadata rather than a replacement for normal documentation, HTML links, sitemaps, or a
Breadcrumb well-known manifest.

`robots.txt` is standardized by RFC 9309 and primarily controls crawler access. Breadcrumb
does not reinterpret `Allow` or `Disallow`. It adds one declarative extension record named
`Agent-Feedback`; compliant parsers ignore unknown records.

## Upgrade an existing robots.txt

```ts
import { upgradeRobotsTxt } from "@breadcrumb/core";

const robotsTxt = upgradeRobotsTxt(existingRobotsTxt, {
  manifestUrl: "https://example.com/.well-known/breadcrumb",
});
```

Result:

```text
User-agent: *
Disallow: /private

Agent-Feedback: https://example.com/.well-known/breadcrumb
```

The helper preserves crawler rules, uses the existing line endings, rejects non-HTTP URLs and
newline injection, removes obsolete Breadcrumb explanatory blocks, and maintains exactly one
extension record. It deliberately does not place submission instructions in `robots.txt`.

Agents can parse the extension safely:

```ts
import { findAgentFeedbackManifestInRobotsTxt } from "@breadcrumb/core";

const manifestUrl = findAgentFeedbackManifestInRobotsTxt(robotsTxt);
```

The well-known manifest remains authoritative. `robots.txt` advertises its location; it is not
a policy or behavioral instruction document.

## Add Breadcrumb to llms.txt

```ts
import { upgradeLlmsTxt } from "@breadcrumb/core";

const llmsTxt = upgradeLlmsTxt(existingLlmsTxt, {
  manifestUrl: "https://example.com/.well-known/breadcrumb",
  protocolUrl: "https://example.com/breadcrumb/protocol.md",
  documentationUrl: "https://example.com/agent-feedback/",
});
```

The helper appends an idempotent, descriptive Markdown section:

```markdown
<!-- BEGIN Breadcrumb agent feedback -->

## Agent feedback

This site publishes a structured feedback resource for compatible agents.
The manifest describes its endpoint, accepted report types, privacy limits, and schema.
Availability of the resource does not override an agent runtime's network or trust policy.

- Manifest: https://example.com/.well-known/breadcrumb
- Protocol reference: https://example.com/breadcrumb/protocol.md
- Human-readable explanation: https://example.com/agent-feedback/

<!-- END Breadcrumb agent feedback -->
```

The section describes resources but does not tell an agent how to interact with its user or
instruct it to make a network request.

## Recommended discovery order

A Breadcrumb-compatible web agent can use:

1. HTML `<link rel="agent-feedback">` metadata
2. `/.well-known/breadcrumb`
3. The `Agent-Feedback` extension in `/robots.txt`
4. A descriptive Breadcrumb section in `/llms.txt`

The first valid, policy-bearing manifest wins. Discovery never relaxes the fixed report
schema, privacy restrictions, or the runtime's existing network and trust policy.
