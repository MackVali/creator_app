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
const shouldSyncSkillProgress = options.has("--sync-skill-progress");

if (!userId) {
  console.error(
    "Usage: node scripts/backfill-dark-xp.js <user-id> [--dry-run] [--verbose] [--sync-skill-progress]"
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

function coerceInteger(value, fallback) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : Number.NaN;

  if (Number.isFinite(numeric)) {
    return Math.trunc(numeric);
  }

  return fallback;
}

function normalizeProgressRow(row) {
  const rawLevel = coerceInteger(row.level, 1);
  const rawPrestige = coerceInteger(row.prestige, 0);

  return {
    skill_id: row.skill_id,
    level: Math.max(1, rawLevel),
    prestige: Math.max(0, rawPrestige),
  };
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

  return (data ?? []).map(normalizeProgressRow);
}

async function fetchSkillMetadata(userId) {
  const { data, error } = await supabase
    .from("skills")
    .select("id, name, level")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to fetch skills: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    skill_id: row.id,
    name: typeof row.name === "string" && row.name.trim() ? row.name : null,
    level: Math.max(1, Math.min(100, coerceInteger(row.level, 1))),
  }));
}

function analyzeSkillAlignment({ skillProgress, skillMetadata }) {
  const progressBySkill = new Map(skillProgress.map((row) => [row.skill_id, row]));
  const skillsById = new Map(skillMetadata.map((row) => [row.skill_id, row]));

  const needsSync = [];
  const otherMismatches = [];

  for (const skill of skillMetadata) {
    const progress = progressBySkill.get(skill.skill_id);

    if (!progress) {
      if (skill.level > 1) {
        needsSync.push({
          type: "missing_progress",
          skill_id: skill.skill_id,
          skill_name: skill.name,
          skills_table_level: skill.level,
          progress_level: null,
          progress_prestige: null,
        });
      }
      continue;
    }

    if (skill.level !== progress.level) {
      const mismatch = {
        type: "level_mismatch",
        skill_id: skill.skill_id,
        skill_name: skill.name,
        skills_table_level: skill.level,
        progress_level: progress.level,
        progress_prestige: progress.prestige,
      };

      if (skill.level > progress.level) {
        needsSync.push(mismatch);
      } else {
        otherMismatches.push(mismatch);
      }
    }
  }

  return { needsSync, otherMismatches, skillsById };
}

async function syncSkillProgressWithSkills({ userId, mismatches }) {
  if (mismatches.length === 0) {
    return;
  }

  const upsertRows = mismatches.map((entry) => {
    const increments = Math.max(0, entry.skills_table_level - 1);
    const snapshot = snapshotFromIncrements(increments);

    return {
      user_id: userId,
      skill_id: entry.skill_id,
      level: snapshot.level,
      prestige: snapshot.prestige,
      xp_into_level: 0,
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from("skill_progress")
    .upsert(upsertRows, { onConflict: "user_id,skill_id" });

  if (error) {
    throw new Error(`Failed to sync skill_progress: ${error.message}`);
  }
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

function summarizeDifferences({ skillProgress, totalsBySkill, skillsById }) {
  return skillProgress
    .map((row) => {
      const expected = calculateExpectedFromProgress(row);
      const current = totalsBySkill.get(row.skill_id) ?? 0;
      const delta = expected - current;
      const skillMeta = skillsById.get(row.skill_id);

      return {
        skill_id: row.skill_id,
        skill_name: skillMeta?.name ?? null,
        progress_level: row.level,
        progress_prestige: row.prestige,
        skills_table_level: skillMeta?.level ?? null,
        expected_total: expected,
        current_total: current,
        delta,
      };
    })
    .filter((entry) => entry.delta !== 0);
}

async function fetchUserProgress(userId) {
  const { data, error } = await supabase
    .from("user_progress")
    .select("total_dark_xp, current_level")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch user_progress: ${error.message}`);
  }

  return data ?? { total_dark_xp: 0, current_level: 0 };
}

function describeUserLevel(totalDarkXp) {
  return {
    total_dark_xp: totalDarkXp,
    // User level currently mirrors dark XP 1:1.
    inferred_level: totalDarkXp,
  };
}

async function main() {
  console.log(`Backfilling dark XP for user ${userId}${isDryRun ? " (dry run)" : ""}`);

  let skillProgress = await fetchSkillProgress(userId);
  const skillMetadata = await fetchSkillMetadata(userId);

  let alignment = analyzeSkillAlignment({
    skillProgress,
    skillMetadata,
  });

  if (alignment.needsSync.length > 0) {
    console.warn(
      "Found skills where skills.level exceeds skill_progress.level. The backfill relies on skill_progress,"
    );
    console.table(
      alignment.needsSync.map((entry) => ({
        skill_id: entry.skill_id,
        skill_name: entry.skill_name,
        skills_table_level: entry.skills_table_level,
        progress_level: entry.progress_level,
        progress_prestige: entry.progress_prestige,
        issue: entry.type,
      }))
    );

    if (!shouldSyncSkillProgress) {
      console.warn(
        "Run again with --sync-skill-progress to copy skills.level into skill_progress before computing dark XP."
      );
      return;
    }

    if (isDryRun) {
      console.warn(
        "--sync-skill-progress requires a non-dry run to update skill_progress. Remove --dry-run to proceed."
      );
      return;
    }

    await syncSkillProgressWithSkills({
      userId,
      mismatches: alignment.needsSync,
    });
    console.log(
      `Synchronized ${alignment.needsSync.length} skill_progress row(s) using values from the skills table.`
    );

    skillProgress = await fetchSkillProgress(userId);
    alignment = analyzeSkillAlignment({
      skillProgress,
      skillMetadata,
    });
  }

  if (alignment.otherMismatches.length > 0) {
    console.warn(
      "Detected skills where skill_progress is ahead of the skills table. Proceeding with skill_progress as the canonical source."
    );
    if (isVerbose) {
      console.table(
        alignment.otherMismatches.map((entry) => ({
          skill_id: entry.skill_id,
          skill_name: entry.skill_name,
          skills_table_level: entry.skills_table_level,
          progress_level: entry.progress_level,
          progress_prestige: entry.progress_prestige,
          issue: entry.type,
        }))
      );
    }
  }

  if (skillProgress.length === 0) {
    console.log("No skill_progress rows found for this user. Nothing to do.");
    return;
  }

  const preUserProgress = await fetchUserProgress(userId);

  const { totals: totalsBySkill, overall: currentOverall } =
    await fetchDarkXpTotals(userId);

  const diffs = summarizeDifferences({
    skillProgress,
    totalsBySkill,
    skillsById: alignment.skillsById,
  });

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
      skill_name: diff.skill_name,
      progress_level: diff.progress_level,
      progress_prestige: diff.progress_prestige,
      skills_table_level: diff.skills_table_level,
      current_total: diff.current_total,
      expected_total: diff.expected_total,
      delta: diff.delta,
    }))
  );

  console.log(
    `Will insert ${eventsToInsert.length} dark_xp_events (total delta: ${totalDelta}).`
  );

  const expectedUserLevel = describeUserLevel(expectedOverall);

  console.log(
    `Current user_progress snapshot: total_dark_xp=${preUserProgress.total_dark_xp}, level=${preUserProgress.current_level}`
  );
  console.log(
    `Expected snapshot after backfill: total_dark_xp=${expectedUserLevel.total_dark_xp}, level=${expectedUserLevel.inferred_level}`
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

  const postUserProgress = await fetchUserProgress(userId);
  console.log(
    "Insertion complete. dark_xp_events trigger will update user_progress."
  );
  console.log(
    `Updated user_progress snapshot: total_dark_xp=${postUserProgress.total_dark_xp}, level=${postUserProgress.current_level}`
  );
}

main().catch((error) => {
  console.error(error.message);
  if (isVerbose) {
    console.error(error);
  }
  process.exit(1);
});
