export interface WindowMinutesRange {
  visibleStart: number;
  visibleEnd: number;
}

export function windowRect(
  window: WindowMinutesRange,
  startHour: number,
  pxPerMin: number,
) {
  const timelineStart = startHour * 60;
  const start = Math.max(window.visibleStart, timelineStart);
  const end = Math.max(start, window.visibleEnd);
  return {
    top: (start - timelineStart) * pxPerMin,
    height: (end - start) * pxPerMin,
  };
}
