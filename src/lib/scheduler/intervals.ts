export function overlapsHalfOpen(
  aStartMs: number,
  aEndMs: number,
  bStartMs: number,
  bEndMs: number
): boolean {
  return aStartMs < bEndMs && aEndMs > bStartMs;
}
