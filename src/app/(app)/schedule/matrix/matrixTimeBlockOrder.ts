const CREATOR_DAY_START_MINUTES = 4 * 60;
const MINUTES_PER_DAY = 24 * 60;

function clockMinutes(value: string): number | null {
  const match = value.match(/(?:^|T|\s)(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function matrixTimeBlockSortValue(value: unknown): number {
  let minutes: number | null = null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    minutes = value.getHours() * 60 + value.getMinutes();
  } else if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    minutes = date.getHours() * 60 + date.getMinutes();
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    minutes = clockMinutes(trimmed);

    if (minutes === null && trimmed) {
      const timestamp = Number(trimmed);
      const date = Number.isFinite(timestamp)
        ? new Date(timestamp)
        : new Date(trimmed);
      if (!Number.isNaN(date.getTime())) {
        minutes = date.getHours() * 60 + date.getMinutes();
      }
    }
  }

  if (minutes === null) return Number.POSITIVE_INFINITY;
  return minutes < CREATOR_DAY_START_MINUTES
    ? minutes + MINUTES_PER_DAY
    : minutes;
}

export function compareMatrixTimeBlockStarts(
  left: unknown,
  right: unknown
): number {
  const leftValue = matrixTimeBlockSortValue(left);
  const rightValue = matrixTimeBlockSortValue(right);
  if (leftValue === rightValue) return 0;
  return leftValue < rightValue ? -1 : 1;
}
