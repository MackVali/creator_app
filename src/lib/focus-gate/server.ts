import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveCreatorDay } from "@/lib/creatorDay";
import type { Database } from "@/types/supabase";
import { isReversalKey, reversalKeyFor } from "@/lib/xp/reversibleXpAwards";
import {
  DEFAULT_FOCUS_GATE_SETTINGS,
  type FocusGateSettings,
  type FocusGateStatus,
} from "./types";

type Client = SupabaseClient<Database>;
type FocusGateSettingsRow =
  Database["public"]["Tables"]["focus_gate_settings"]["Row"];
type FocusGateXpEventRow = Pick<
  Database["public"]["Tables"]["xp_events"]["Row"],
  "amount" | "award_key"
>;

export function mapFocusGateSettingsRow(
  row?: FocusGateSettingsRow | null
): FocusGateSettings {
  return {
    enabled: row?.enabled ?? DEFAULT_FOCUS_GATE_SETTINGS.enabled,
    minutesPerXp:
      row?.minutes_per_xp ?? DEFAULT_FOCUS_GATE_SETTINGS.minutesPerXp,
    dailyMaxMinutes:
      row?.daily_max_minutes ?? DEFAULT_FOCUS_GATE_SETTINGS.dailyMaxMinutes,
  };
}

export function deriveFocusGateAllowance({
  xpToday,
  settings,
}: {
  xpToday: number;
  settings: FocusGateSettings;
}) {
  const safeXpToday = Math.max(0, Math.trunc(xpToday));
  const minutesPerXp = Math.max(1, Math.trunc(settings.minutesPerXp));
  const baseAllowedMinutes = safeXpToday * minutesPerXp;
  const allowedMinutes =
    settings.dailyMaxMinutes === null
      ? baseAllowedMinutes
      : Math.min(baseAllowedMinutes, Math.max(0, Math.trunc(settings.dailyMaxMinutes)));

  return {
    xpToday: safeXpToday,
    baseAllowedMinutes,
    allowedMinutes,
  };
}

export async function getFocusGateSettings(
  client: Client,
  userId: string
): Promise<FocusGateSettings> {
  const { data, error } = await client
    .from("focus_gate_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  return mapFocusGateSettingsRow(data as FocusGateSettingsRow | null);
}

export async function upsertFocusGateSettings(
  client: Client,
  userId: string,
  settings: FocusGateSettings
): Promise<FocusGateSettings> {
  const { data, error } = await client
    .from("focus_gate_settings")
    .upsert(
      {
        user_id: userId,
        enabled: settings.enabled,
        minutes_per_xp: settings.minutesPerXp,
        daily_max_minutes: settings.dailyMaxMinutes,
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error) throw error;

  return mapFocusGateSettingsRow(data as FocusGateSettingsRow);
}

export async function calculateFocusGateXpToday({
  client,
  userId,
  startsAt,
  endsAt,
}: {
  client: Client;
  userId: string;
  startsAt: string;
  endsAt: string;
}): Promise<number> {
  const { data, error } = await client
    .from("xp_events")
    .select("amount, award_key")
    .eq("user_id", userId)
    .gt("amount", 0)
    .gte("created_at", startsAt)
    .lt("created_at", endsAt);

  if (error) throw error;

  const currentDayAwards = ((data ?? []) as FocusGateXpEventRow[]).filter(
    (row) =>
      typeof row.amount === "number" &&
      row.amount > 0 &&
      (typeof row.award_key !== "string" || !isReversalKey(row.award_key))
  );
  const reversibleAwardKeys = currentDayAwards
    .map((row) => row.award_key)
    .filter(
      (awardKey): awardKey is string =>
        typeof awardKey === "string" && awardKey.length > 0
    );
  const expectedReversalKeys = reversibleAwardKeys.map(reversalKeyFor);

  const reversedAwardKeys = new Set<string>();
  if (expectedReversalKeys.length > 0) {
    const { data: reversalRows, error: reversalError } = await client
      .from("xp_events")
      .select("award_key")
      .eq("user_id", userId)
      .in("award_key", expectedReversalKeys);

    if (reversalError) throw reversalError;

    for (const row of reversalRows ?? []) {
      if (typeof row.award_key === "string") {
        reversedAwardKeys.add(row.award_key.replace(/^reverse:/, ""));
      }
    }
  }

  const activeXp = currentDayAwards.reduce((total, row) => {
    const awardKey = row.award_key;
    if (
      typeof awardKey === "string" &&
      reversedAwardKeys.has(awardKey)
    ) {
      return total;
    }
    return total + row.amount;
  }, 0);

  return Math.max(0, Math.trunc(activeXp));
}

export async function getFocusGateStatus({
  client,
  userId,
  profileTimezone,
  deviceTimezone,
  instant = new Date(),
}: {
  client: Client;
  userId: string;
  profileTimezone?: string | null;
  deviceTimezone?: string | null;
  instant?: Date;
}): Promise<FocusGateStatus> {
  const creatorDay = resolveCreatorDay({
    instant,
    profileTimezone,
    deviceTimezone,
  });
  const settings = await getFocusGateSettings(client, userId);
  const xpToday = await calculateFocusGateXpToday({
    client,
    userId,
    startsAt: creatorDay.startsAt,
    endsAt: creatorDay.endsAt,
  });
  const derived = deriveFocusGateAllowance({ xpToday, settings });

  return {
    ...settings,
    ...derived,
    creatorDay: {
      startsAt: creatorDay.startsAt,
      endsAt: creatorDay.endsAt,
      timezone: creatorDay.timezone,
    },
  };
}
