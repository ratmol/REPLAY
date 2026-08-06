// Network transport for the SDK: a single JSON request helper with a timeout
// and one retry. Every failure mode - network error, non-2xx response, a hung
// request - resolves to `false` rather than throwing or rejecting, so callers
// never need their own try/catch (invariant 1: never throw into the host).
//
// The retry is safe to repeat blindly: the collector's unique index on
// (run_id, seq) makes a re-sent event batch a no-op (docs/EVENT_SCHEMA.md
// section 5), POST /runs with the same id is likewise a no-op via its
// primary key, and PATCH /runs/:id with the same status/endedAt is naturally
// idempotent (same write twice, same result).

const FETCH_TIMEOUT_MS = 5000;

type HttpMethod = "POST" | "PATCH";

async function sendJsonOnce(method: HttpMethod, url: string, body: unknown): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendJsonWithRetry(method: HttpMethod, url: string, body: unknown): Promise<boolean> {
  if (await sendJsonOnce(method, url, body)) {
    return true;
  }
  return sendJsonOnce(method, url, body);
}

export function postJsonWithRetry(url: string, body: unknown): Promise<boolean> {
  return sendJsonWithRetry("POST", url, body);
}

export function patchJsonWithRetry(url: string, body: unknown): Promise<boolean> {
  return sendJsonWithRetry("PATCH", url, body);
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
