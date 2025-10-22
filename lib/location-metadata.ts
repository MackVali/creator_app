export type LocationMetadataMode = "id" | "legacy";

function extractErrorText(maybeError?: unknown) {
  if (!maybeError || typeof maybeError !== "object") {
    return "";
  }

  const parts: string[] = [];

  if ("message" in maybeError && typeof maybeError.message === "string") {
    parts.push(maybeError.message.toLowerCase());
  }

  if ("details" in maybeError && typeof maybeError.details === "string") {
    parts.push(maybeError.details.toLowerCase());
  }

  return parts.join(" ");
}

export function isLocationMetadataError(maybeError?: unknown) {
  const haystack = extractErrorText(maybeError);
  if (!haystack) {
    return false;
  }

  return (
    haystack.includes("location_context_id") ||
    haystack.includes("location_contexts")
  );
}

export function normalizeLocationValue(value: string | null | undefined) {
  const normalized = value ? value.trim().toUpperCase() : "";
  if (!normalized || normalized === "ANY") {
    return null;
  }
  return normalized;
}
