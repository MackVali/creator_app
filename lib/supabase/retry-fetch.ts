const RETRY_BACKOFFS_MS = [250, 750, 1500];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeContentType(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

function extractCloudflareRayId(body: string): string | null {
  const strongMatch = /Cloudflare Ray ID:\s*<[^>]*>([^<]+)<\/[^>]*>/i.exec(body);
  if (strongMatch?.[1]) {
    return strongMatch[1].trim();
  }
  const fallbackMatch = /Cloudflare Ray ID:\s*([A-Za-z0-9-]+)/i.exec(body);
  if (fallbackMatch?.[1]) {
    return fallbackMatch[1].trim();
  }
  return null;
}

function buildShortMessage(status: number, rayId: string | null) {
  const base = `Upstream Supabase error (HTTP ${status})`;
  return rayId ? `${base} RayID=${rayId}` : base;
}

function isNetworkError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const name = error.name;
  if (name === "FetchError" || name === "TypeError") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("network") || message.includes("fetch");
}

function isRetryableError(error: unknown) {
  if (error instanceof TransientResponseError) return true;
  return isNetworkError(error);
}

function shouldRetryResponse(status: number, contentType: string) {
  return status >= 500 || contentType.includes("text/html");
}

export class TransientResponseError extends Error {
  readonly status: number;
  readonly rayId: string | null;
  readonly shortMessage: string;

  private constructor(status: number, rayId: string | null, shortMessage: string) {
    super(shortMessage);
    this.status = status;
    this.rayId = rayId;
    this.shortMessage = shortMessage;
  }

  static async fromResponse(response: Response) {
    const status = response.status ?? 0;
    const contentType = normalizeContentType(
      response.headers.get("content-type")
    );
    let rayId: string | null = null;
    if (contentType.includes("text/html")) {
      const body = await response.text().catch(() => "");
      if (body) {
        rayId = extractCloudflareRayId(body);
      }
    }

    const shortMessage = buildShortMessage(status, rayId);
    return new TransientResponseError(status, rayId, shortMessage);
  }
}

export async function withTransientRetry<T>(fn: () => Promise<T>) {
  const maxAttempts = RETRY_BACKOFFS_MS.length + 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (
        attempt === maxAttempts - 1 ||
        !isRetryableError(error)
      ) {
        throw error;
      }
      await delay(RETRY_BACKOFFS_MS[attempt]);
    }
  }
  throw lastError;
}

export function createTransientRetryFetch(fetchImpl: typeof fetch) {
  return async function fetchWithRetry(
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) {
    return withTransientRetry(async () => {
      const response = await fetchImpl(input, init);
      const contentType = normalizeContentType(
        response.headers.get("content-type")
      );
      if (shouldRetryResponse(response.status, contentType)) {
        throw await TransientResponseError.fromResponse(response);
      }
      return response;
    });
  };
}
