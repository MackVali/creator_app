import { describe, expect, it } from 'vitest'

import { toLocal } from '@/lib/time/tz'

describe('toLocal', () => {
  it('constructs a local date from an ISO string without applying timezone offset', () => {
    const date = toLocal('2024-03-10T15:30:00Z')
    expect(date.getFullYear()).toBe(2024)
    expect(date.getMonth()).toBe(2)
    expect(date.getDate()).toBe(10)
    expect(date.getHours()).toBe(15)
    expect(date.getMinutes()).toBe(30)
    expect(date.getSeconds()).toBe(0)
  })

  it('ignores explicit offsets when parsing ISO timestamps', () => {
    const date = toLocal('2024-03-10T05:45:30+02:00')
    expect(date.getHours()).toBe(5)
    expect(date.getMinutes()).toBe(45)
    expect(date.getSeconds()).toBe(30)
  })

  it('supports fractional seconds by normalizing to milliseconds', () => {
    const date = toLocal('2024-03-10T08:15:30.789123-04:00')
    expect(date.getMilliseconds()).toBe(789)
  })

  it('falls back to native parsing when the input does not resemble an ISO timestamp', () => {
    expect(Number.isNaN(toLocal('not-a-date').getTime())).toBe(true)
  })
})
