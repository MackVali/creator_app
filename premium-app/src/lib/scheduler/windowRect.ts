import type { WindowLite } from './repo';

export function timeToMin(t: string): number {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return h * 60 + m;
}

export function windowRect(
  w: Pick<WindowLite, 'start_local' | 'end_local' | 'fromPrevDay'>,
  startHour: number,
  pxPerMin: number,
) {
  const startMin = timeToMin(w.start_local);
  const endMin = timeToMin(w.end_local);
  const dayStartMin = startHour * 60;
  let top: number;
  let height: number;
  if (w.fromPrevDay) {
    top = 0;
    height = (endMin - dayStartMin) * pxPerMin;
  } else if (endMin <= startMin) {
    top = (startMin - dayStartMin) * pxPerMin;
    height = (24 * 60 - startMin) * pxPerMin;
  } else {
    top = (startMin - dayStartMin) * pxPerMin;
    height = (endMin - startMin) * pxPerMin;
  }
  return { top, height };
}
