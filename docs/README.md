# Breadcrumb documentation

Breadcrumb is an experimental protocol and toolkit. Start with the document that matches
your goal:

| Goal                                        | Document                                  |
| ------------------------------------------- | ----------------------------------------- |
| Understand the protocol                     | [Protocol 0.1](protocol.md)               |
| Understand published agent feedback         | [Agent feedback](agent-feedback.md)       |
| Advertise through robots.txt and llms.txt   | [Text discovery](robots-and-llms.md)      |
| See the system boundaries and data flow     | [Architecture](architecture.md)           |
| Add an ingestion endpoint                   | [Owner integration](owner-integration.md) |
| Enable zero-install reporting for any agent | [Text discovery](robots-and-llms.md)      |
| Use the optional legacy Codex adapter       | [Codex CLI integration](codex.md)         |
| Run the complete local demonstration        | [Demo walkthrough](demo.md)               |
| Review collection and redaction guarantees  | [Privacy model](privacy.md)               |
| Contribute changes                          | [Contributing guide](../CONTRIBUTING.md)  |

The product rationale, scope, and long-term direction live in [`PROJECT.md`](../PROJECT.md).
The implementation sequence and explicit deferrals live in [`PLAN.md`](../PLAN.md).

## Stability

The packages, owner manifest, protocol, and experience reports remain version `0.1`. All
protocol documents and APIs are experimental, and schema changes may be breaking until a
stability policy is published. The JSON Schemas in
[`protocol/schemas/`](../protocol/schemas/) are canonical when prose and implementation
differ.
