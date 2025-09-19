const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
] as const;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getFormatter(timeZone: string) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      timeZoneName: "shortOffset",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function parseOffset(value: string | undefined): number {
  if (!value) return 0;
  const match = value.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/i);
  if (!match) return 0;
  const sign = match[1].startsWith("-") ? -1 : 1;
  const hours = Math.abs(parseInt(match[1], 10)) || 0;
  const minutes = match[2] ? parseInt(match[2], 10) || 0 : 0;
  return sign * (hours * 60 + minutes);
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function toMillis(fractional?: string): number {
  if (!fractional) return 0;
  const normalized = `${fractional}000`.slice(0, 3);
  const value = parseInt(normalized, 10);
  return Number.isFinite(value) ? value : 0;
}

function toNumber(value?: string): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface ZonedDateTimeParts {
  readonly date: Date;
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
  readonly offsetMinutes: number;
  readonly weekday: number;
  readonly dayKey: string;
}

export function getZonedDateTimeParts(
  date: Date,
  timeZone: string
): ZonedDateTimeParts {
  const formatter = getFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const record: Record<string, string> = {};
  for (const part of parts) {
    if (part.type === "literal") continue;
    if (record[part.type] === undefined) {
      record[part.type] = part.value;
    }
  }

  const year = toNumber(record.year);
  const month = toNumber(record.month);
  const day = toNumber(record.day);
  const hour = toNumber(record.hour);
  const minute = toNumber(record.minute);
  const second = toNumber(record.second);
  const millisecond = toMillis(record.fractionalSecond);
  const offsetMinutes = parseOffset(record.timeZoneName);
  const weekday = WEEKDAY_INDEX[record.weekday as keyof typeof WEEKDAY_INDEX] ?? 0;
  const dayKey = `${year}-${pad(month)}-${pad(day)}`;

  return {
    date,
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    offsetMinutes,
    weekday,
    dayKey,
  };
}

export function zonedTimeToUtc(
  fields: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
    millisecond?: number;
  },
  timeZone: string
): Date {
  const {
    year,
    month,
    day,
    hour = 0,
    minute = 0,
    second = 0,
    millisecond = 0,
  } = fields;
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const initial = new Date(utcMillis);
  const actual = getZonedDateTimeParts(initial, timeZone);
  const actualUtc = Date.UTC(
    actual.year,
    actual.month - 1,
    actual.day,
    actual.hour,
    actual.minute,
    actual.second,
    actual.millisecond
  );
  const diff = utcMillis - actualUtc;
  return new Date(utcMillis + diff);
}

export function normalizeTimezone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: value });
    const resolved = formatter.resolvedOptions().timeZone;
    return resolved ?? null;
  } catch (error) {
    console.warn("normalizeTimezone: invalid timezone", value, error);
    return null;
  }
}

export function getTimezoneOptions(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }
  return [...FALLBACK_TIMEZONES];
}

export function getDayKey(date: Date, timeZone: string): string {
  return getZonedDateTimeParts(date, timeZone).dayKey;
}

export function localWindowToUTC(dateLocalISO: string): string {
  if (!dateLocalISO) throw new Error("Expected local ISO string");
  const [datePart, timePart = "00:00:00"] = dateLocalISO.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart
    .split(":")
    .map(value => Number(value));
  const localDate = new Date(year, (month ?? 1) - 1, day ?? 1, hour, minute, second);
  return localDate.toISOString();
}

export function toLocal(isoUTC: string): Date {
  return new Date(isoUTC);
}
