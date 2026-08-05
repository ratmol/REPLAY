// Network transport for the SDK: a single POST helper with a timeout and one
// retry. Every failure mode - network error, non-2xx response, a hung
// request - resolves to `false` rather than throwing or rejecting, so callers
// never need their own try/catch (invariant 1: never throw into the host).
//
// The retry is safe to repeat blindly: the collector's unique index on
// (run_id, seq) makes a re-sent event batch a no-op (docs/EVENT_SCHEMA.md
// section 5), and POST /runs with the same id is likewise a no-op via its
// primary key.

const FETCH_TIMEOUT_MS = 5000;

async function postJsonOnce(url: string, body: unknown): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
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

export async function postJsonWithRetry(url: string, body: unknown): Promise<boolean> {
  if (await postJsonOnce(url, body)) {
    return true;
  }
  return postJsonOnce(url, body);
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
