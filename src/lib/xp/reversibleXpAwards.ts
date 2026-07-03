import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

type Client = SupabaseClient<Database>;
type XpEventRow = Database["public"]["Tables"]["xp_events"]["Row"];
type XpEventInsert = Database["public"]["Tables"]["xp_events"]["Insert"];

export type ActiveXpAward = XpEventRow & { award_key: string };

export type ActiveXpLookupResult = {
  activePositiveEvents: ActiveXpAward[];
  activePositiveCount: number;
  alreadyReversedCount: number;
  reversedAwardKeys: string[];
};

export type ReverseXpAwardsResult = ActiveXpLookupResult & {
  reversed: number;
  insertedReversalKeys: string[];
};

function normalizeStem(stem: string) {
  return stem.trim().replace(/:+$/, "");
}

function isAwardForOccurrence(awardKey: string, stems: string[]) {
  return stems.some((stem) => {
    if (awardKey === stem) return true;
    return awardKey.startsWith(`${stem}:`);
  });
}

function isReversalKey(awardKey: string) {
  return awardKey.startsWith("reverse:");
}

function reversalKeyFor(awardKey: string) {
  return `reverse:${awardKey}`;
}

export async function findActivePositiveXpAwards({
  client,
  userId,
  occurrenceStem,
  legacyOccurrenceStems = [],
  scheduleInstanceId = null,
}: {
  client: Client;
  userId: string;
  occurrenceStem: string;
  legacyOccurrenceStems?: string[];
  scheduleInstanceId?: string | null;
}): Promise<ActiveXpLookupResult> {
  const stems = Array.from(
    new Set(
      [occurrenceStem, ...legacyOccurrenceStems]
        .map(normalizeStem)
        .filter(Boolean)
    )
  );

  if (stems.length === 0 && !scheduleInstanceId) {
    return {
      activePositiveEvents: [],
      activePositiveCount: 0,
      alreadyReversedCount: 0,
      reversedAwardKeys: [],
    };
  }

  const positiveRows: ActiveXpAward[] = [];
  for (const stem of stems) {
    const { data, error } = await client
      .from("xp_events")
      .select("*")
      .eq("user_id", userId)
      .gt("amount", 0)
      .like("award_key", `${stem}%`);

    if (error) throw error;

    for (const row of (data ?? []) as XpEventRow[]) {
      const awardKey = row.award_key;
      if (
        typeof awardKey !== "string" ||
        !awardKey ||
        isReversalKey(awardKey) ||
        !isAwardForOccurrence(awardKey, stems)
      ) {
        continue;
      }
      positiveRows.push({ ...row, award_key: awardKey });
    }
  }
  if (scheduleInstanceId) {
    const { data, error } = await client
      .from("xp_events")
      .select("*")
      .eq("user_id", userId)
      .eq("schedule_instance_id", scheduleInstanceId)
      .gt("amount", 0);

    if (error) throw error;

    for (const row of (data ?? []) as XpEventRow[]) {
      const awardKey = row.award_key;
      if (
        typeof awardKey !== "string" ||
        !awardKey ||
        isReversalKey(awardKey)
      ) {
        continue;
      }
      positiveRows.push({ ...row, award_key: awardKey });
    }
  }

  const positiveByKey = new Map<string, ActiveXpAward>();
  for (const row of positiveRows) {
    positiveByKey.set(row.award_key, row);
  }
  const positives = Array.from(positiveByKey.values());
  const expectedReversalKeys = positives.map((row) =>
    reversalKeyFor(row.award_key)
  );

  const existingReversalKeys = new Set<string>();
  if (expectedReversalKeys.length > 0) {
    const { data, error } = await client
      .from("xp_events")
      .select("award_key")
      .eq("user_id", userId)
      .in("award_key", expectedReversalKeys);

    if (error) throw error;

    for (const row of data ?? []) {
      if (typeof row.award_key === "string") {
        existingReversalKeys.add(row.award_key);
      }
    }
  }

  const activePositiveEvents = positives.filter(
    (row) => !existingReversalKeys.has(reversalKeyFor(row.award_key))
  );

  return {
    activePositiveEvents,
    activePositiveCount: activePositiveEvents.length,
    alreadyReversedCount: positives.length - activePositiveEvents.length,
    reversedAwardKeys: positives
      .filter((row) => existingReversalKeys.has(reversalKeyFor(row.award_key)))
      .map((row) => row.award_key),
  };
}

export async function reverseActiveXpAwards({
  client,
  userId,
  occurrenceStem,
  legacyOccurrenceStems = [],
  scheduleInstanceId = null,
}: {
  client: Client;
  userId: string;
  occurrenceStem: string;
  legacyOccurrenceStems?: string[];
  scheduleInstanceId?: string | null;
}): Promise<ReverseXpAwardsResult> {
  const lookup = await findActivePositiveXpAwards({
    client,
    userId,
    occurrenceStem,
    legacyOccurrenceStems,
    scheduleInstanceId,
  });

  const reversalRows: XpEventInsert[] = lookup.activePositiveEvents.map(
    (event) => ({
      user_id: userId,
      kind: event.kind,
      amount: -event.amount,
      schedule_instance_id: event.schedule_instance_id,
      completion_event_id: event.completion_event_id,
      skill_id: event.skill_id,
      monument_id: event.monument_id,
      award_key: reversalKeyFor(event.award_key),
      source: event.source,
    })
  );

  if (reversalRows.length === 0) {
    return {
      ...lookup,
      reversed: 0,
      insertedReversalKeys: [],
    };
  }

  const { data, error } = await client
    .from("xp_events")
    .insert(reversalRows)
    .select("award_key");

  if (error) {
    if (error.code !== "23505") throw error;
    const refreshed = await findActivePositiveXpAwards({
      client,
      userId,
      occurrenceStem,
      legacyOccurrenceStems,
      scheduleInstanceId,
    });
    return {
      ...refreshed,
      reversed: 0,
      insertedReversalKeys: [],
    };
  }

  const insertedReversalKeys = (data ?? [])
    .map((row) => row.award_key)
    .filter((key): key is string => typeof key === "string");

  return {
    ...lookup,
    reversed: insertedReversalKeys.length || reversalRows.length,
    insertedReversalKeys,
  };
}

export async function resolveNextReversibleAwardKeyBase({
  client,
  userId,
  occurrenceStem,
  legacyOccurrenceStems = [],
  scheduleInstanceId = null,
}: {
  client: Client;
  userId: string;
  occurrenceStem: string;
  legacyOccurrenceStems?: string[];
  scheduleInstanceId?: string | null;
}) {
  const stem = normalizeStem(occurrenceStem);
  const lookup = await findActivePositiveXpAwards({
    client,
    userId,
    occurrenceStem: stem,
    legacyOccurrenceStems,
    scheduleInstanceId,
  });

  if (lookup.activePositiveCount > 0) {
    return {
      awardKeyBase: stem,
      activePositiveCount: lookup.activePositiveCount,
      alreadyReversedCount: lookup.alreadyReversedCount,
      blockedByActivePositive: true,
    };
  }

  const { data, error } = await client
    .from("xp_events")
    .select("award_key")
    .eq("user_id", userId)
    .like("award_key", `${stem}%`);

  if (error) throw error;

  let maxCycle = 0;
  for (const row of data ?? []) {
    const awardKey = row.award_key;
    if (typeof awardKey !== "string" || !isAwardForOccurrence(awardKey, [stem])) {
      continue;
    }
    const match = awardKey.match(/:cycle:(\d+)(?::|$)/);
    if (match) {
      maxCycle = Math.max(maxCycle, Number(match[1]));
    } else if (!isReversalKey(awardKey)) {
      maxCycle = Math.max(maxCycle, 1);
    }
  }

  const nextCycle = Math.max(1, maxCycle + 1);
  return {
    awardKeyBase: `${stem}:cycle:${nextCycle}`,
    activePositiveCount: 0,
    alreadyReversedCount: lookup.alreadyReversedCount,
    blockedByActivePositive: false,
  };
}
