# Contributing

Breadcrumb is currently an experimental protocol and reference implementation. Changes to
schemas, privacy behavior, discovery, or deduplication should be treated as protocol design
changes rather than ordinary refactors.

## Setup

Requirements: Node.js 20+, pnpm 10+, and Docker for PostgreSQL tests.

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate
```

## Required checks

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:coverage
DATABASE_URL=postgresql://breadcrumb:breadcrumb@localhost:5432/breadcrumb \
  pnpm test:integration
pnpm build
pnpm test:packages
```

## Protocol changes

When changing a schema:

1. Edit the canonical schema under `protocol/schemas/`.
2. Update corresponding TypeScript types and validation tests.
3. Run `pnpm build`; the core build generates the package schema directory from the
   canonical files. Do not commit generated package copies.
4. Update `docs/protocol.md` and any affected integration guides.
5. Add compatibility tests and explicitly document whether the change is breaking.

PostgreSQL migration SQL under `packages/postgres/migrations/` is canonical and loaded by the
adapter at runtime. Add a new numbered migration rather than editing an already released
migration; applied identifiers are recorded in `breadcrumb_migrations`.

Do not silently change deduplication inputs or normalization. Stable grouping across repeated
runs is part of the protocol contract.

## Privacy changes

Collection must remain allowlist-based. Do not add prompts, assistant messages, tool
arguments, tool output, command text, unhashed file paths, file contents, arbitrary
environment variables, credential values, transcripts, or screenshots to runtime state or
reports. Protocol-approved runtime metadata, such as an explicit runtime version, is the
narrow exception. Any other proposed exception requires an explicit protocol policy, threat
analysis, tests, and documentation.

## Package changes

Run `pnpm changeset` for user-visible changes to public packages and commit the generated
Markdown file. Maintainers use `pnpm version-packages` to apply versions and changelogs;
`pnpm release` builds, smoke-tests, and publishes packages. Publishing still requires an
explicit maintainer release and registry credentials.

## Pull requests

Keep changes focused, include tests for behavior, and explain protocol or privacy effects.
Do not commit generated `dist/` output, local Codex hooks, credentials, or database
volumes.
