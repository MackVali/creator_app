export const MAX_MONUMENTS = 8;

export const MONUMENT_LIMITS_BY_TIER = {
  CREATOR: MAX_MONUMENTS,
  "CREATOR PLUS": MAX_MONUMENTS,
  ADMIN: MAX_MONUMENTS,
} as const;

export function getMaxMonumentsForTier(tier?: string | null) {
  const normalizedTier = tier?.trim().toUpperCase();
  if (
    normalizedTier &&
    normalizedTier in MONUMENT_LIMITS_BY_TIER
  ) {
    return MONUMENT_LIMITS_BY_TIER[
      normalizedTier as keyof typeof MONUMENT_LIMITS_BY_TIER
    ];
  }

  return MAX_MONUMENTS;
}
