// Payload truncation, per docs/EVENT_SCHEMA.md section 4. Truncation happens
// here, before anything is buffered or sent, to protect memory and bandwidth
// - not at the collector, which only sees whatever the SDK already decided to
// keep.

// "50KB" read as 50 * 1024 bytes (kibibytes), the conventional meaning in a
// computing context, rather than 50000.
const MAX_PAYLOAD_BYTES = 50 * 1024;
const PREVIEW_CHARS = 2000;

const encoder = new TextEncoder();

export function truncatePayload(payload: Record<string, unknown>): Record<string, unknown> {
  let serialized: string;
  try {
    // JSON.stringify throws on circular references or BigInt values. A
    // payload the host handed us must never be able to crash the host by
    // being unserializable - invariant 1 (CLAUDE.md) names serialization
    // explicitly as an operation that must be wrapped.
    serialized = JSON.stringify(payload) ?? "null";
  } catch {
    return { _truncated: true, _originalBytes: 0, _preview: "[unserializable payload]" };
  }

  const byteLength = encoder.encode(serialized).length;
  if (byteLength <= MAX_PAYLOAD_BYTES) {
    // Return a deep copy, not the caller's object by reference. The buffered
    // event outlives this call (it waits in the ring buffer until the next
    // flush), so aliasing the host's live object would let a mutation between
    // logEvent and flush ship the mutated value, and would pin the host's
    // object graph in the buffer until then. We already serialized it for the
    // size check above, so a snapshot costs one extra parse and nothing more.
    return JSON.parse(serialized) as Record<string, unknown>;
  }

  return {
    _truncated: true,
    _originalBytes: byteLength,
    _preview: serialized.slice(0, PREVIEW_CHARS),
  };
}
