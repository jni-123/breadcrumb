# Verify webhook signatures

Compute an HMAC-SHA256 over the JSON request body with your endpoint secret and compare
it with the `X-Demo-Signature` header.

```ts
const expected = createHmac("sha256", secret)
  .update(JSON.stringify(body))
  .digest("hex");
```

The signature matches when `expected === signature`.

> This guide does not explain that signatures use the raw request bytes. The working
> approach is only mentioned in the troubleshooting guide.
