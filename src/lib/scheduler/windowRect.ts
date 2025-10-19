import type { WindowLite } from "./repo";

export function timeToMin(t: string): number {
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
}

export function windowRectMinutes(
  w: Pick<WindowLite, "start_local" | "end_local" | "fromPrevDay">,
  startHour: number
) {
  const startMin = timeToMin(w.start_local);
  const endMin = timeToMin(w.end_local);
  const dayStartMin = startHour * 60;
  let topMinutes: number;
  let heightMinutes: number;
  if (w.fromPrevDay) {
    topMinutes = 0;
    heightMinutes = endMin - dayStartMin;
  } else if (endMin <= startMin) {
    topMinutes = startMin - dayStartMin;
    heightMinutes = 24 * 60 - startMin;
  } else {
    topMinutes = startMin - dayStartMin;
    heightMinutes = endMin - startMin;
  }
  return {
    topMinutes: Math.max(0, topMinutes),
    heightMinutes: Math.max(0, heightMinutes),
  };
}

export function windowRect(
  w: Pick<WindowLite, "start_local" | "end_local" | "fromPrevDay">,
  startHour: number,
  pxPerMin: number
) {
  const { topMinutes, heightMinutes } = windowRectMinutes(w, startHour);
  return {
    top: topMinutes * pxPerMin,
    height: heightMinutes * pxPerMin,
  };
}
