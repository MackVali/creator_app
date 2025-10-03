const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!UUID_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function isValidUuid(value: unknown): value is string {
  return normalizeUuid(value) !== null;
}

export { UUID_REGEX };
