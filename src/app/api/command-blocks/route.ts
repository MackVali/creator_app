import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase";
import {
  formatDateKeyInTimeZone,
  getDatePartsInTimeZone,
  makeDateInTimeZone,
  normalizeTimeZone,
} from "@/lib/scheduler/timezone";

const commandBlockColumns =
  "id, offer_id, circle_id, member_id, user_id, starts_at, ends_at, timezone, status, created_at, updated_at";

const commandBlockRuleColumns =
  "id, offer_id, circle_id, member_id, user_id, mode, status, starts_on, ends_on, days_of_week, start_local, end_local, required_minutes_per_day, required_minutes_per_week, timezone, terms, created_at, updated_at";

const weekdayValues = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

type CommandBlockRow = {
  id: string;
  offer_id: string | null;
  circle_id: string;
  member_id: string;
  user_id: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type CommandBlockRuleRow = {
  id: string;
  offer_id: string | null;
  circle_id: string;
  member_id: string;
  user_id: string;
  mode: string;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  days_of_week: string[] | null;
  start_local: string | null;
  end_local: string | null;
  required_minutes_per_day: number | null;
  required_minutes_per_week: number | null;
  timezone: string | null;
  terms: unknown;
  created_at: string;
  updated_at: string;
};

type CircleDisplayRow = {
  id: string;
  name: string;
  icon_emoji: string | null;
};

type CommandBlockOccurrence = CommandBlockRow & {
  command_block_rule_id: string;
  occurrence_date: string;
};

async function getServerClient() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(
    cookieStore as unknown as Parameters<typeof getSupabaseServer>[0]
  );

  return supabase ? (supabase as unknown as SupabaseClient) : null;
}

function parseRangeDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateKey(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
}

function formatDateKey(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;
}

function addDaysToDateKey(value: string, amount: number) {
  const parts = parseDateKey(value);
  if (!parts) return value;
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + amount, 12, 0, 0, 0)
  );
  return formatDateKey({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function parseLocalTime(value: string | null | undefined) {
  if (!value) return null;
  // PostgreSQL time values can come back from Supabase as HH:mm:ss.
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(value);
  if (!match) return null;
  const [, hourValue, minuteValue, secondValue] = match;
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const second = secondValue === undefined ? 0 : Number(secondValue);
  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }
  return { hour, minute };
}

function getWeekdayValue(dateKey: string) {
  const parts = parseDateKey(dateKey);
  if (!parts) return null;
  const dayIndex = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day)
  ).getUTCDay();
  return weekdayValues[dayIndex] ?? null;
}

function getRuleDateKeysForRange(
  rangeStart: Date,
  rangeEnd: Date,
  timeZone: string
) {
  const firstParts = getDatePartsInTimeZone(rangeStart, timeZone);
  const lastInstant = new Date(
    Math.max(rangeStart.getTime(), rangeEnd.getTime() - 1)
  );
  const lastParts = getDatePartsInTimeZone(lastInstant, timeZone);
  const firstKey = addDaysToDateKey(formatDateKey(firstParts), -1);
  const lastKey = addDaysToDateKey(formatDateKey(lastParts), 1);
  const keys: string[] = [];
  let cursor = firstKey;

  for (let guard = 0; cursor <= lastKey && guard < 370; guard += 1) {
    keys.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }

  return keys;
}

function buildCommandBlockRuleOccurrences({
  rules,
  rangeStart,
  rangeEnd,
  fallbackTimeZone,
}: {
  rules: CommandBlockRuleRow[];
  rangeStart: Date;
  rangeEnd: Date;
  fallbackTimeZone: string;
}) {
  const occurrences: CommandBlockOccurrence[] = [];

  for (const rule of rules) {
    if (rule.mode !== "FIXED" || rule.status !== "ACTIVE") continue;
    if (!rule.starts_on || !rule.start_local || !rule.end_local) continue;
    if (!Array.isArray(rule.days_of_week) || rule.days_of_week.length === 0) {
      continue;
    }

    const startsOn = parseDateKey(rule.starts_on);
    if (!startsOn) continue;

    const startTime = parseLocalTime(rule.start_local);
    const endTime = parseLocalTime(rule.end_local);
    if (!startTime || !endTime) continue;

    const ruleTimeZone = normalizeTimeZone(
      rule.timezone?.trim() ? rule.timezone : fallbackTimeZone
    );
    const selectedWeekdays = new Set(rule.days_of_week);
    const candidateDateKeys = getRuleDateKeysForRange(
      rangeStart,
      rangeEnd,
      ruleTimeZone
    );

    for (const dateKey of candidateDateKeys) {
      if (dateKey < rule.starts_on) continue;
      if (rule.ends_on && dateKey > rule.ends_on) continue;

      const weekday = getWeekdayValue(dateKey);
      if (!weekday || !selectedWeekdays.has(weekday)) continue;

      const dateParts = parseDateKey(dateKey);
      if (!dateParts) continue;

      const start = makeDateInTimeZone(
        { ...dateParts, hour: startTime.hour, minute: startTime.minute },
        ruleTimeZone
      );
      let end = makeDateInTimeZone(
        { ...dateParts, hour: endTime.hour, minute: endTime.minute },
        ruleTimeZone
      );

      if (end.getTime() <= start.getTime()) {
        const nextDateParts = parseDateKey(addDaysToDateKey(dateKey, 1));
        if (!nextDateParts) continue;
        end = makeDateInTimeZone(
          { ...nextDateParts, hour: endTime.hour, minute: endTime.minute },
          ruleTimeZone
        );
      }

      if (end.getTime() <= rangeStart.getTime()) continue;
      if (start.getTime() >= rangeEnd.getTime()) continue;

      occurrences.push({
        id: `rule:${rule.id}:${dateKey}`,
        command_block_rule_id: rule.id,
        occurrence_date: dateKey,
        offer_id: rule.offer_id,
        circle_id: rule.circle_id,
        member_id: rule.member_id,
        user_id: rule.user_id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        timezone: ruleTimeZone,
        status: rule.status,
        created_at: rule.created_at,
        updated_at: rule.updated_at,
      });
    }
  }

  return occurrences.sort((a, b) => {
    const aStart = a.starts_at ? new Date(a.starts_at).getTime() : 0;
    const bStart = b.starts_at ? new Date(b.starts_at).getTime() : 0;
    return aStart - bStart;
  });
}

function getCommandBlockDedupKey(
  block: Pick<CommandBlockRow, "offer_id" | "starts_at" | "ends_at">
) {
  if (!block.offer_id || !block.starts_at || !block.ends_at) return null;
  const start = new Date(block.starts_at).getTime();
  const end = new Date(block.ends_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return `${block.offer_id}:${start}:${end}`;
}

export async function GET(request: Request) {
  const supabase = await getServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const rangeStart = parseRangeDate(url.searchParams.get("start"));
  const rangeEnd = parseRangeDate(url.searchParams.get("end"));
  const requestTimeZone = normalizeTimeZone(url.searchParams.get("timezone"));

  if (!rangeStart || !rangeEnd || rangeEnd.getTime() <= rangeStart.getTime()) {
    return NextResponse.json(
      { error: "A valid start and end range is required." },
      { status: 400 }
    );
  }

  const requestedStartDateKey = formatDateKeyInTimeZone(
    rangeStart,
    requestTimeZone
  );
  const requestedEndDateKey = formatDateKeyInTimeZone(
    new Date(rangeEnd.getTime() - 1),
    requestTimeZone
  );

  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Command block service is not configured." },
      { status: 503 }
    );
  }

  const { data: commandBlocks, error: commandBlocksError } = await admin
    .from("command_blocks")
    .select(commandBlockColumns)
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .not("starts_at", "is", null)
    .not("ends_at", "is", null)
    .lt("starts_at", rangeEnd.toISOString())
    .gt("ends_at", rangeStart.toISOString())
    .order("starts_at", { ascending: true })
    .limit(200)
    .returns<CommandBlockRow[]>();

  if (commandBlocksError) {
    console.error("Failed to load command blocks", commandBlocksError);
    return NextResponse.json(
      { error: "Unable to load command blocks." },
      { status: 500 }
    );
  }

  const { data: commandBlockRules, error: commandBlockRulesError } = await admin
    .from("command_block_rules")
    .select(commandBlockRuleColumns)
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .eq("mode", "FIXED")
    .not("starts_on", "is", null)
    .not("start_local", "is", null)
    .not("end_local", "is", null)
    .lte("starts_on", requestedEndDateKey)
    .or(`ends_on.is.null,ends_on.gte.${requestedStartDateKey}`)
    .order("starts_on", { ascending: true })
    .limit(200)
    .returns<CommandBlockRuleRow[]>();

  if (commandBlockRulesError) {
    console.error("Failed to load command block rules", commandBlockRulesError);
    return NextResponse.json(
      { error: "Unable to load command block rules." },
      { status: 500 }
    );
  }

  const rows = commandBlocks ?? [];
  const ruleRows = commandBlockRules ?? [];
  const circleIds = Array.from(
    new Set(
      [...rows, ...ruleRows].map((row) => row.circle_id).filter(Boolean)
    )
  );
  const circleById = new Map<string, CircleDisplayRow>();

  if (circleIds.length > 0) {
    const { data: circles, error: circlesError } = await admin
      .from("circles")
      .select("id, name, icon_emoji")
      .in("id", circleIds)
      .returns<CircleDisplayRow[]>();

    if (circlesError) {
      console.error("Failed to load command block circles", circlesError);
    } else {
      for (const circle of circles ?? []) {
        circleById.set(circle.id, circle);
      }
    }
  }

  const commandBlockRuleOccurrences = buildCommandBlockRuleOccurrences({
    rules: ruleRows,
    rangeStart,
    rangeEnd,
    fallbackTimeZone: requestTimeZone,
  });
  const ruleOccurrenceKeys = new Set(
    commandBlockRuleOccurrences
      .map((occurrence) => getCommandBlockDedupKey(occurrence))
      .filter((key): key is string => key !== null)
  );
  const compatibilityRows = rows.filter((row) => {
    const key = getCommandBlockDedupKey(row);
    return !key || !ruleOccurrenceKeys.has(key);
  });

  return NextResponse.json(
    {
      commandBlocks: compatibilityRows.map((row) => {
        const circle = circleById.get(row.circle_id);

        return {
          ...row,
          circle_name: circle?.name ?? null,
          circle_icon_emoji: circle?.icon_emoji ?? null,
        };
      }),
      commandBlockRuleOccurrences: commandBlockRuleOccurrences.map((row) => {
        const circle = circleById.get(row.circle_id);

        return {
          ...row,
          circle_name: circle?.name ?? null,
          circle_icon_emoji: circle?.icon_emoji ?? null,
        };
      }),
    },
    { status: 200 }
  );
}
