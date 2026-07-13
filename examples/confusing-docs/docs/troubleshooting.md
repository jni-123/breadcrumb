# Webhook troubleshooting

If signatures do not match, calculate HMAC-SHA256 over the exact raw request bytes.
Do not parse and reserialize JSON first. The incoming header has the form:

```text
X-Demo-Signature: sha256=<lowercase hex digest>
```

Strip the `sha256=` prefix and use a constant-time comparison. A successful verifier
returns `{ "verified": true }`, although no separate completion identifier is provided.
