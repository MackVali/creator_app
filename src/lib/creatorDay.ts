import { fromZonedTime } from "date-fns-tz";

export const CREATOR_DAY_BOUNDARY_HOUR = 4;

export type CreatorDayTimezoneSource = "profile" | "device" | "utc";

export type CreatorDay = {
  creatorDayDate: string;
  timezone: string;
  timezoneSource: CreatorDayTimezoneSource;
  boundaryHour: 4;
  startsAt: string;
  endsAt: string;
};

export function isValidIanaTimezone(value?: string | null): value is string {
  if (!value?.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).format();
    return true;
  } catch {
    return false;
  }
}

export function resolveCreatorDayTimezone(
  profileTimezone?: string | null,
  deviceTimezone?: string | null,
) {
  if (isValidIanaTimezone(profileTimezone)) {
    return { timezone: profileTimezone.trim(), timezoneSource: "profile" as const };
  }
  if (isValidIanaTimezone(deviceTimezone)) {
    return { timezone: deviceTimezone.trim(), timezoneSource: "device" as const };
  }
  return { timezone: "UTC", timezoneSource: "utc" as const };
}

function localParts(instant: Date, timezone: string) {
  const values: Record<string, number> = {};
  for (const part of new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  }).formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return values as { year: number; month: number; day: number; hour: number };
}

function dateKey(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftDateKey(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return dateKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export function resolveCreatorDayForDate(
  creatorDayDate: string,
  timezone: string,
  timezoneSource: CreatorDayTimezoneSource,
): CreatorDay {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(creatorDayDate) || !isValidIanaTimezone(timezone)) {
    throw new Error("Invalid Creator-day date or timezone.");
  }
  const startsAt = fromZonedTime(`${creatorDayDate} 04:00:00`, timezone);
  const endsAt = fromZonedTime(`${shiftDateKey(creatorDayDate, 1)} 04:00:00`, timezone);
  return {
    creatorDayDate,
    timezone,
    timezoneSource,
    boundaryHour: CREATOR_DAY_BOUNDARY_HOUR,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
}

export function resolveCreatorDay({
  instant = new Date(),
  profileTimezone,
  deviceTimezone,
}: {
  instant?: Date;
  profileTimezone?: string | null;
  deviceTimezone?: string | null;
} = {}): CreatorDay {
  if (Number.isNaN(instant.getTime())) throw new Error("Invalid instant.");
  const resolved = resolveCreatorDayTimezone(profileTimezone, deviceTimezone);
  const parts = localParts(instant, resolved.timezone);
  let key = dateKey(parts.year, parts.month, parts.day);
  if (parts.hour < CREATOR_DAY_BOUNDARY_HOUR) key = shiftDateKey(key, -1);
  return resolveCreatorDayForDate(key, resolved.timezone, resolved.timezoneSource);
}
