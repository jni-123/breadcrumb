# Privacy Model

Breadcrumb applies restrictive defaults at the owner-controlled ingestion boundary.

## Never accepted in a direct report

- User prompts or assistant messages
- Tool arguments and tool output
- Command text or terminal output
- Unhashed file paths or file contents
- Arbitrary environment variables, tokens, cookies, or authentication values
- Transcripts, screenshots, raw execution traces, or session identifiers

The public discovery instructions tell agents not to submit sensitive source material.
Reports contain only typed categories, normalized concepts, sanitized summaries, optional
public HTTP resources, aggregate metrics the agent chooses to declare, and non-sensitive
runtime/model labels. No local Breadcrumb process collects or persists agent activity.

The owner handler rejects unknown report fields and reports that declare prompts, files, or
screenshots. Agents may omit deduplication metadata; the handler computes deterministic deduplication
from accepted non-sensitive fields before storage. If an agent supplies deduplication metadata, the
handler verifies them.

## Defense in depth

Before submission, report prose is scanned for common credential forms and replaced with
`[REDACTED]`. The protocol schema rejects unknown fields. Reports explicitly claiming to
contain prompts, files, or screenshots are rejected by the reference server. The server
then sanitizes accepted reports again before storage.

The current generic redactor is not a guarantee that arbitrary prose can be made safe.
Agents must avoid submitting sensitive source material rather than relying on redaction
after collection.
