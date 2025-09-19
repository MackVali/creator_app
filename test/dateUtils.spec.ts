import { describe, expect, it } from 'vitest'

import {
  computeTimelinePlacement,
  formatDateParam,
  parseDateParam,
  startOfLocalDay,
  utcDayRange,
} from '@/lib/scheduler/dateUtils'

describe('schedule date utilities', () => {
  it('parses valid YYYY-MM-DD strings at local midnight', () => {
    const date = parseDateParam('2024-03-05')
    expect(date).toBeInstanceOf(Date)
    expect(date?.getFullYear()).toBe(2024)
    expect(date?.getMonth()).toBe(2)
    expect(date?.getDate()).toBe(5)
    expect(date?.getHours()).toBe(0)
    expect(date?.getMinutes()).toBe(0)
  })

  it('returns null for invalid date params', () => {
    expect(parseDateParam('invalid')).toBeNull()
    expect(parseDateParam('2024-13-01')).toBeNull()
    expect(parseDateParam('2024-02-31')).toBeNull()
  })

  it('formats dates as YYYY-MM-DD with zero padding', () => {
    const date = new Date(2024, 0, 3)
    expect(formatDateParam(date)).toBe('2024-01-03')
  })

  it('computes local day range boundaries in UTC', () => {
    const date = new Date(2024, 2, 5, 12, 0, 0, 0)
    const { startUTC, endUTC } = utcDayRange(date)
    const start = startOfLocalDay(date)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    expect(new Date(startUTC).getTime()).toBe(start.getTime())
    expect(new Date(endUTC).getTime()).toBe(end.getTime())
  })

  it('returns the start of the local day', () => {
    const date = new Date(2024, 5, 12, 15, 45)
    const start = startOfLocalDay(date)
    expect(start.getFullYear()).toBe(2024)
    expect(start.getMonth()).toBe(5)
    expect(start.getDate()).toBe(12)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
  })

  describe('computeTimelinePlacement', () => {
    const timelineStart = new Date(2024, 2, 5, 0, 0)
    const timelineEnd = new Date(2024, 2, 6, 0, 0)

    it('positions intervals fully inside the timeline', () => {
      const start = new Date(2024, 2, 5, 9, 0)
      const end = new Date(2024, 2, 5, 10, 0)
      const { top, height } = computeTimelinePlacement({
        start,
        end,
        timelineStart,
        timelineEnd,
        pxPerMin: 2,
      })
      expect(top).toBe(9 * 60 * 2)
      expect(height).toBe(60 * 2)
    })

    it('clips intervals that start before the timeline', () => {
      const start = new Date(2024, 2, 4, 23, 30)
      const end = new Date(2024, 2, 5, 1, 0)
      const { top, height } = computeTimelinePlacement({
        start,
        end,
        timelineStart,
        timelineEnd,
        pxPerMin: 1,
      })
      expect(top).toBe(0)
      expect(height).toBe(60)
    })

    it('returns zero height for intervals outside the timeline', () => {
      const start = new Date(2024, 2, 6, 1, 0)
      const end = new Date(2024, 2, 6, 2, 0)
      const result = computeTimelinePlacement({
        start,
        end,
        timelineStart,
        timelineEnd,
        pxPerMin: 1,
      })
      expect(result).toEqual({ top: 0, height: 0 })
    })
  })
})
