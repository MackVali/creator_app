import { describe, it, expect } from 'vitest';
import { windowRect } from '../../../src/lib/scheduler/windowRect';

describe('windowRect', () => {
  const startHour = 0;
  const pxPerMin = 2;

  it('computes layout for a normal window', () => {
    const w = { start_local: '09:00', end_local: '10:00' } as const;
    const { top, height } = windowRect(w, startHour, pxPerMin);
    expect(top).toBe(9 * 60 * pxPerMin);
    expect(height).toBe(60 * pxPerMin);
  });

  it('handles window crossing midnight from current day', () => {
    const w = { start_local: '22:00', end_local: '02:00' } as const;
    const { top, height } = windowRect(w, startHour, pxPerMin);
    expect(top).toBe(22 * 60 * pxPerMin);
    expect(height).toBe((24 * 60 - 22 * 60) * pxPerMin);
  });

  it('handles window carrying over from previous day', () => {
    const w = { start_local: '22:00', end_local: '02:00', fromPrevDay: true } as const;
    const { top, height } = windowRect(w, startHour, pxPerMin);
    expect(top).toBe(0);
    expect(height).toBe(2 * 60 * pxPerMin);
  });
});
