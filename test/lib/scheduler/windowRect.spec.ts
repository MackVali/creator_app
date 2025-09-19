import { describe, it, expect } from 'vitest';
import { windowRect } from '../../../src/lib/scheduler/windowRect';

describe('windowRect', () => {
  const startHour = 0;
  const pxPerMin = 2;

  it('computes layout for a normal window', () => {
    const w = { visibleStart: 9 * 60, visibleEnd: 10 * 60 } as const;
    const { top, height } = windowRect(w, startHour, pxPerMin);
    expect(top).toBe(9 * 60 * pxPerMin);
    expect(height).toBe(60 * pxPerMin);
  });

  it('handles window crossing midnight from current day', () => {
    const w = { visibleStart: 22 * 60, visibleEnd: 24 * 60 } as const;
    const { top, height } = windowRect(w, startHour, pxPerMin);
    expect(top).toBe(22 * 60 * pxPerMin);
    expect(height).toBe((24 * 60 - 22 * 60) * pxPerMin);
  });

  it('handles window carrying over from previous day', () => {
    const w = { visibleStart: 0, visibleEnd: 2 * 60 } as const;
    const { top, height } = windowRect(w, startHour, pxPerMin);
    expect(top).toBe(0);
    expect(height).toBe(2 * 60 * pxPerMin);
  });

  it('clamps windows starting before the visible timeline', () => {
    const w = { visibleStart: 60, visibleEnd: 180 } as const;
    const timelineStartHour = 2; // 120 minutes
    const { top, height } = windowRect(w, timelineStartHour, pxPerMin);
    expect(top).toBe(0);
    expect(height).toBe((180 - 120) * pxPerMin);
  });
});
