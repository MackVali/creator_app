import type { OperatorProposedAction } from "@/lib/ai/operatorContext";
import {
  getDatePartsInTimeZone,
  getDateTimeParts,
  makeDateInTimeZone,
} from "@/lib/scheduler/timezone";

const MAX_TITLE_LENGTH = 120;
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 12 * 60;

const CREATE_EVENT_PATTERN =
  /^\s*(?:please\s+)?(?:create|schedule|add|make)\s+(?:an?\s+)?event\s+(?:to|for)\s+(.+?)\s+(today|tomorrow)\s+at\s+(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?\s+for\s+(\d+)\s+(minutes?|hours?)\s*[.!?]?\s*$/i;

type BuildOperatorProposedActionsInput = {
  message: string;
  now: Date;
  timezone: string;
};

function isValidTimeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTitle(value: string) {
  const compact = normalizeWhitespace(value)
    .replace(/[\s,.;:!?-]+$/g, "")
    .trim();
  if (!compact || compact.length > MAX_TITLE_LENGTH) return null;

  return compact
    .split(" ")
    .map((word) => {
      if (!word) return word;
      if (/[A-Z]/.test(word.slice(1))) return word;
      return `${word.charAt(0).toLocaleUpperCase("en-US")}${word.slice(1)}`;
    })
    .join(" ");
}

function parseHour(hourText: string, amPmText?: string) {
  const hour = Number.parseInt(hourText, 10);
  if (!Number.isInteger(hour)) return null;

  if (amPmText) {
    if (hour < 1 || hour > 12) return null;
    const normalized = amPmText.toLowerCase().replace(/\./g, "");
    if (normalized === "am") return hour === 12 ? 0 : hour;
    if (normalized === "pm") return hour === 12 ? 12 : hour + 12;
    return null;
  }

  if (hour >= 1 && hour <= 7) return hour + 12;
  return null;
}

function parseDurationMinutes(amountText: string, unitText: string) {
  const amount = Number.parseInt(amountText, 10);
  if (!Number.isInteger(amount) || amount <= 0) return null;
  const unit = unitText.toLowerCase();
  const minutes = unit.startsWith("hour") ? amount * 60 : amount;
  if (minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) {
    return null;
  }
  return minutes;
}

function getTargetDateParts(now: Date, timezone: string, dayWord: string) {
  const todayParts = getDatePartsInTimeZone(now, timezone);
  if (dayWord.toLowerCase() === "today") return todayParts;

  const localNoon = makeDateInTimeZone(
    { ...todayParts, hour: 12, minute: 0 },
    timezone
  );
  localNoon.setUTCDate(localNoon.getUTCDate() + 1);
  return getDatePartsInTimeZone(localNoon, timezone);
}

function isExactLocalTime(
  date: Date,
  timezone: string,
  expected: { year: number; month: number; day: number; hour: number; minute: number }
) {
  const actual = getDateTimeParts(date, timezone);
  return (
    actual.year === expected.year &&
    actual.month === expected.month &&
    actual.day === expected.day &&
    actual.hour === expected.hour &&
    actual.minute === expected.minute
  );
}

function formatTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDisplayRange(
  dayWord: string,
  start: Date,
  end: Date,
  timezone: string
) {
  const dayLabel =
    dayWord.toLowerCase() === "today" ? "Today" : "Tomorrow";
  return `${dayLabel}, ${formatTime(start, timezone)}–${formatTime(
    end,
    timezone
  )}`;
}

export function buildOperatorProposedActions({
  message,
  now,
  timezone,
}: BuildOperatorProposedActionsInput): OperatorProposedAction[] {
  const resolvedTimeZone = timezone.trim();
  if (!resolvedTimeZone || !isValidTimeZone(resolvedTimeZone)) return [];

  const match = CREATE_EVENT_PATTERN.exec(message);
  if (!match) return [];

  const [, rawTitle, dayWord, hourText, minuteText, amPmText, durationText, unit] =
    match;
  const title = normalizeTitle(rawTitle);
  const hour = parseHour(hourText, amPmText);
  const minute = minuteText ? Number.parseInt(minuteText, 10) : 0;
  const durationMinutes = parseDurationMinutes(durationText, unit);
  if (!title || hour === null || !Number.isInteger(minute) || durationMinutes === null) {
    return [];
  }

  const targetParts = getTargetDateParts(now, resolvedTimeZone, dayWord);
  const start = makeDateInTimeZone(
    { ...targetParts, hour, minute },
    resolvedTimeZone
  );
  if (
    !isExactLocalTime(start, resolvedTimeZone, {
      ...targetParts,
      hour,
      minute,
    })
  ) {
    return [];
  }
  if (start.getTime() <= now.getTime()) return [];

  const end = new Date(start.getTime() + durationMinutes * 60_000);

  return [
    {
      kind: "create_schedule_event",
      status: "proposed",
      title,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      timezone: resolvedTimeZone,
      notes: null,
      display: {
        title,
        timeRange: formatDisplayRange(dayWord, start, end, resolvedTimeZone),
        typeLabel: "Event",
      },
    },
  ];
}
