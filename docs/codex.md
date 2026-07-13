# Codex CLI integration

The experimental `@breadcrumb/codex` package is an optional legacy adapter that installs
user-level Codex command hooks for deterministic local metrics. It is not required for
Breadcrumb reporting: Codex can use the same zero-install website discovery and direct
submission path as any other participating agent. The adapter supports Codex CLI `0.144.1`
and later versions with the stable `hooks` feature.

## Optional installation

Published-package usage will be:

```bash
pnpm dlx @breadcrumb/codex install
pnpm dlx @breadcrumb/codex doctor
pnpm dlx @breadcrumb/codex uninstall
```

For this unpublished workspace build:

```bash
pnpm build
pnpm codex:hooks install \
  --command "node $PWD/packages/codex/dist/cli.js"
pnpm codex:hooks doctor --cwd examples/confusing-docs
```

The installer merges command handlers into `$CODEX_HOME/hooks.json` (normally
`~/.codex/hooks.json`) for:

- `SessionStart` — initialize aggregate state and expose the optional feedback command
- `PostToolUse` — collect safe aggregate metrics
- `Stop` — submit only feedback the agent explicitly queued

It preserves unrelated hook groups, is idempotent, and creates a timestamped backup before
changing an existing file.

## Trust the hooks

Codex protects command hooks with a trust prompt. Review `~/.codex/hooks.json` and approve
Breadcrumb's commands when Codex first asks. Breadcrumb does not bypass this protection.

For non-interactive local testing only, Codex offers
`--dangerously-bypass-hook-trust`. Do not make that flag part of normal usage or shared
scripts.

## Agent-declared reporting

There is no numeric reporting threshold and ordinary successful turns are not documented.
At `SessionStart`, the trusted hook adds private runtime context explaining that the agent
may queue feedback only when it independently encounters a meaningful, target-attributable
usability issue. The agent can invoke the structured `breadcrumb-codex feedback` command with a category,
concept, sanitized summary, semantic outcome, attribution, optional confidence, and optional
public resource URL. Failed or abandoned outcomes become `task_failed`; partial success
becomes `task_degraded`; successful friction becomes `task_succeeded_with_friction`.

Queued feedback is validated, redacted, and held in private per-session state. `Stop`
submits it with aggregate metrics. If the agent queues nothing, state is deleted and no
manifest discovery or network request occurs.

## Privacy behavior

Codex includes sensitive fields such as `tool_input`, `tool_response`, transcript paths,
and the last assistant message in hook payloads. Breadcrumb does not persist or submit any
of them.

For `PostToolUse`, trusted adapter code examines only status-shaped response data—numeric
exit-code fields, a success/status field, or a short exit-code prefix in a string—then
discards the payload. It stores counters, pending failure classes, declared feedback, model metadata, timestamps,
and hashes of the runtime session and working directory. It never stores command text,
response output, transcript paths, prompts, messages, raw session IDs, or unhashed file paths.

Session state is mode `0600` in a mode-`0700` operating-system temporary directory and keyed
by a hash of the Codex session ID. It is removed when no feedback exists, after successful
submission, or after a definitive client rejection. Transient discovery, network, and server
failures retain state so a later Stop can retry.

## Failure behavior

Hook errors are written to stderr and never intentionally interrupt the Codex session.
Discovery and submission each use five-second network timeouts; installed hooks allow twenty
seconds for the complete operation. No report is sent when the agent declares
no feedback, discovery fails, or the owner rejects the inferred event.

## Known limitations

- `PostToolUse` response shapes vary by tool. Codex CLI 0.144.1 emits an empty response for
  ordinary shell calls, so their exit status cannot currently be counted. Unknown shapes count
  as successful unless a recognized failure status is present.
- Codex `Stop` is turn-scoped, so Breadcrumb treats each completed user turn as a task.
- Semantic success, ambiguity, and documentation contradictions are declared by the agent,
  not inferred from transcript content.
- `retries` counts same-tool-class recovery signals, not proven repetitions of an identical
  operation; `files_inspected` counts read-tool invocations rather than distinct paths.
- Runtime version is included only when the hook environment supplies `CODEX_CLI_VERSION`.
