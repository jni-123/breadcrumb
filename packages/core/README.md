# @breadcrumb/core

Core protocol types, schema validation, discovery, privacy sanitization, deduplicating, and submission for [Breadcrumb](https://github.com/jni-123/breadcrumb).

See the [protocol documentation](https://github.com/jni-123/breadcrumb/blob/main/docs/protocol.md) for the experimental report 0.1 contract.

## Agent-facing Markdown

Owners that already produce Markdown representations can opt in to a concise capability block:

```ts
import { appendAgentFeedback } from "@breadcrumb/core";

const agentMarkdown = appendAgentFeedback(markdown, {
  manifestUrl: "https://example.com/.well-known/breadcrumb",
  resourceUrl: "https://example.com/docs/getting-started",
});
```

The helper appends or updates exactly one managed `<AgentFeedback>` block, removes query strings
and fragments from the resource URL, and rejects non-web or credential-bearing URLs. It does not
generate Markdown from HTML. Apply it only to agent-facing Markdown; normal HTML should remain
unchanged.
