# replay-shared

Zod event schemas and shared TypeScript types. The single source of truth for
the wire format between `replay-sdk`, `replay-collector`, and `replay-dashboard`.

Not published to npm. Consumed through the pnpm workspace.

**Import rule:** the SDK imports from this package with `import type` only, so it
keeps zero runtime dependencies. The collector and dashboard may import the Zod
values.

Spec: [`../docs/EVENT_SCHEMA.md`](../docs/EVENT_SCHEMA.md). Status: event
schemas and the run/batch request schemas are implemented and tested.
