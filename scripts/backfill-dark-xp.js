import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const [, , rawUserId, ...rawArgs] = process.argv;

const options = new Set(
  rawArgs
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => arg.toLowerCase())
);

const userId = rawUserId && !rawUserId.startsWith("--") ? rawUserId : undefined;
const isDryRun = options.has("--dry-run");
const isVerbose = options.has("--verbose");

if (!userId) {
  console.error(
    "Usage: node scripts/backfill-dark-xp.js <user-id> [--dry-run] [--verbose]"
  );
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function snapshotFromIncrements(count) {
  if (count < 0) {
    throw new Error(`Cannot compute snapshot for negative increment count: ${count}`);
  }

  const prestige = Math.floor(count / 100);
  const level = (count % 100) + 1;

  return { level, prestige };
}

function calculateExpectedFromProgress({ level, prestige }) {
  return prestige * 100 + (level - 1);
}

async function fetchSkillProgress(userId) {
  const { data, error } = await supabase
    .from("skill_progress")
    .select("skill_id, level, prestige")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to fetch skill_progress: ${error.message}`);
  }

  return data ?? [];
}

async function fetchDarkXpTotals(userId) {
  const { data, error } = await supabase
    .from("dark_xp_events")
    .select("skill_id, amount")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to fetch dark_xp_events: ${error.message}`);
  }

  const totals = new Map();
  let overall = 0;

  for (const row of data ?? []) {
    totals.set(row.skill_id, (totals.get(row.skill_id) ?? 0) + row.amount);
    overall += row.amount;
  }

  return { totals, overall };
}

function buildBackfillEvents({
  userId,
  skillId,
  currentTotal,
  expectedTotal,
}) {
  const delta = expectedTotal - currentTotal;
  if (delta === 0) {
    return [];
  }

  const events = [];

  if (delta > 0) {
    let runningTotal = currentTotal;
    for (let i = 0; i < delta; i += 1) {
      const snapshot = snapshotFromIncrements(runningTotal);
      const newLevel = snapshot.level === 100 ? 101 : snapshot.level + 1;
      events.push({
        user_id: userId,
        skill_id: skillId,
        amount: 1,
        new_skill_level: newLevel,
      });
      runningTotal += 1;
    }
  } else {
    let runningTotal = currentTotal;
    for (let i = 0; i < Math.abs(delta); i += 1) {
      const nextTotal = runningTotal - 1;
      if (nextTotal < 0) {
        throw new Error(
          `Attempting to roll back below zero dark XP for skill ${skillId}`
        );
      }
      const snapshot = snapshotFromIncrements(nextTotal);
      events.push({
        user_id: userId,
        skill_id: skillId,
        amount: -1,
        new_skill_level: snapshot.level,
      });
      runningTotal = nextTotal;
    }
  }

  return events;
}

async function insertDarkXpEvents(events) {
  if (events.length === 0) {
    return;
  }

  const { error } = await supabase.from("dark_xp_events").insert(events);
  if (error) {
    throw new Error(`Failed to insert dark_xp_events: ${error.message}`);
  }
}

function summarizeDifferences({ skillProgress, totalsBySkill }) {
  return skillProgress
    .map((row) => {
      const expected = calculateExpectedFromProgress(row);
      const current = totalsBySkill.get(row.skill_id) ?? 0;
      const delta = expected - current;
      return {
        skill_id: row.skill_id,
        level: row.level,
        prestige: row.prestige,
        expected_total: expected,
        current_total: current,
        delta,
      };
    })
    .filter((entry) => entry.delta !== 0);
}

async function main() {
  console.log(`Backfilling dark XP for user ${userId}${isDryRun ? " (dry run)" : ""}`);

  const skillProgress = await fetchSkillProgress(userId);

  if (skillProgress.length === 0) {
    console.log("No skill_progress rows found for this user. Nothing to do.");
    return;
  }

  const { totals: totalsBySkill, overall: currentOverall } =
    await fetchDarkXpTotals(userId);

  const diffs = summarizeDifferences({ skillProgress, totalsBySkill });

  if (diffs.length === 0) {
    console.log("Dark XP already matches skill progress. Nothing to do.");
    return;
  }

  const eventsToInsert = diffs.flatMap((diff) =>
    buildBackfillEvents({
      userId,
      skillId: diff.skill_id,
      currentTotal: diff.current_total,
      expectedTotal: diff.expected_total,
    })
  );

  const expectedOverall = skillProgress.reduce(
    (acc, row) => acc + calculateExpectedFromProgress(row),
    0
  );
  const totalDelta = expectedOverall - currentOverall;

  console.table(
    diffs.map((diff) => ({
      skill_id: diff.skill_id,
      level: diff.level,
      prestige: diff.prestige,
      current_total: diff.current_total,
      expected_total: diff.expected_total,
      delta: diff.delta,
    }))
  );

  console.log(
    `Will insert ${eventsToInsert.length} dark_xp_events (total delta: ${totalDelta}).`
  );

  if (isVerbose) {
    console.log("Planned events:");
    console.dir(eventsToInsert, { depth: null });
  }

  if (isDryRun) {
    console.log("Dry run complete. No changes were made.");
    return;
  }

  await insertDarkXpEvents(eventsToInsert);

  console.log("Insertion complete. dark_xp_events trigger will update user_progress.");
}

main().catch((error) => {
  console.error(error.message);
  if (isVerbose) {
    console.error(error);
  }
  process.exit(1);
});
