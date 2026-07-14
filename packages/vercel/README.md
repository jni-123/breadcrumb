# @breadcrumb/vercel

Vercel Functions and managed PostgreSQL integration for [Breadcrumb](https://github.com/jni-123/breadcrumb).

See the [Vercel gateway example](https://github.com/jni-123/breadcrumb/tree/main/examples/vercel-gateway).

## Opt-in agent-facing Markdown

Enable capability-block generation when constructing the gateway, then pass each Markdown page
response through `decoratePage`:

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

The option defaults off. Decoration applies only to `text/markdown` responses from the configured
target origin; HTML is returned unchanged. The gateway does not create Markdown representations or
intercept unrelated routes, so use the decorator in the central page renderer or framework adapter
that handles every agent-facing Markdown page.
