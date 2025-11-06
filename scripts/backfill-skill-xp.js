#!/usr/bin/env node

/**
 * Backfill XP events for skills whose levels were manually edited.
 *
 * Usage: node scripts/backfill-skill-xp.js [--dry-run] [--user <uuid>]
 *
 * The script compares the canonical skill level stored in `public.skills`
 * with the leveling snapshot in `public.skill_progress`. When it finds a
 * skill whose snapshot is behind the skill's displayed level it inserts a
 * compensating `xp_events` row so the regular leveling triggers can replay
 * the missing progress. Each insert emits the appropriate `dark_xp_events`
 * rows which, in turn, re-sync the `user_progress` totals.
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * @typedef {Object} SkillRow
 * @property {string} id
 * @property {string | null} user_id
 * @property {number | null} level
 */

/**
 * @typedef {Object} SkillProgressRow
 * @property {string} skill_id
 * @property {string} user_id
 * @property {number | null} level
 * @property {number | null} prestige
 * @property {number | null} xp_into_level
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase configuration. Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const userFilterIndex = args.indexOf("--user");
const userFilter =
  userFilterIndex >= 0 && args[userFilterIndex + 1]
    ? args[userFilterIndex + 1]
    : null;

/**
 * @param {number | string | null | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function coerceInteger(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return fallback;
}

/**
 * @param {number} level
 * @returns {number}
 */
function baseBracket(level) {
  if (level >= 1 && level <= 9) return 10;
  if (level >= 10 && level <= 19) return 14;
  if (level >= 20 && level <= 29) return 20;
  if (level >= 30 && level <= 39) return 24;
  if (level >= 40 && level <= 99) return 30;
  if (level === 100) return 50;
  return 30;
}

/**
 * @param {number} level
 * @param {number} prestige
 * @returns {number}
 */
function skillCost(level, prestige) {
  const prestigeBonus = Math.max(0, prestige) * 2;
  return baseBracket(level) + prestigeBonus;
}

/**
 * @typedef {Object} ProgressSnapshot
 * @property {number} level
 * @property {number} prestige
 * @property {number} xpIntoLevel
 */

/**
 * @param {ProgressSnapshot} snapshot
 * @param {number} targetLevel
 * @returns {number}
 */
function computeXpNeeded(snapshot, targetLevel) {
  if (targetLevel <= snapshot.level) {
    return 0;
  }

  let xpNeeded = 0;
  let level = snapshot.level;
  let prestige = snapshot.prestige;
  let xpIntoLevel = Math.max(0, snapshot.xpIntoLevel);

  while (level < targetLevel) {
    const cost = skillCost(level, prestige);
    const remaining = Math.max(0, cost - xpIntoLevel);
    xpNeeded += remaining;
    xpIntoLevel = 0;
    level += 1;

    if (level === 101) {
      level = 1;
      prestige = Math.min(prestige + 1, 10);
    }
  }

  return xpNeeded;
}

/**
 * @returns {Promise<SkillRow[]>}
 */
async function fetchSkills() {
  const query = supabase.from("skills").select("id,user_id,level");

  if (userFilter) {
    query.eq("user_id", userFilter);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load skills: ${error.message}`);
  }

  return data ?? [];
}

/**
 * @param {string[]} skillIds
 * @returns {Promise<Map<string, SkillProgressRow>>}
 */
async function fetchProgress(skillIds) {
  if (skillIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("skill_progress")
    .select("skill_id,user_id,level,prestige,xp_into_level")
    .in("skill_id", skillIds);

  if (error) {
    throw new Error(`Failed to load skill_progress rows: ${error.message}`);
  }

  const map = new Map();
  for (const row of data ?? []) {
    if (row?.skill_id) {
      map.set(row.skill_id, row);
    }
  }
  return map;
}

/**
 * @param {SkillProgressRow | undefined} row
 * @returns {ProgressSnapshot}
 */
function snapshotFromRow(row) {
  if (!row) {
    return { level: 1, prestige: 0, xpIntoLevel: 0 };
  }

  return {
    level: Math.max(1, coerceInteger(row.level, 1)),
    prestige: Math.max(0, coerceInteger(row.prestige, 0)),
    xpIntoLevel: Math.max(0, coerceInteger(row.xp_into_level, 0)),
  };
}

/**
 * @param {string} userId
 * @param {string} awardKey
 * @returns {Promise<boolean>}
 */
async function ensureUniqueAward(userId, awardKey) {
  const { data, error } = await supabase
    .from("xp_events")
    .select("id")
    .eq("user_id", userId)
    .eq("award_key", awardKey)
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to check existing xp_event for ${awardKey}: ${error.message}`);
  }

  return Boolean(data?.id);
}

/**
 * @param {{user_id: string; skill_id: string; amount: number; award_key: string}} event
 */
async function insertXpEvent(event) {
  const payload = {
    ...event,
    kind: "manual",
    schedule_instance_id: null,
    monument_id: null,
    source: "xp-backfill",
  };

  const { error } = await supabase.from("xp_events").insert(payload);

  if (error) {
    throw new Error(
      `Failed to insert xp_event for skill ${event.skill_id}: ${error.message}`
    );
  }
}

async function main() {
  console.log("\n🎯 Backfilling skill XP via xp_events");
  console.log("   Dry run:", isDryRun ? "yes" : "no");
  if (userFilter) {
    console.log(`   Restricting to user: ${userFilter}`);
  }

  const skills = await fetchSkills();
  console.log(`\n📚 Loaded ${skills.length} skills to inspect.`);

  const skillIds = skills.map((skill) => skill.id);
  const progressBySkill = await fetchProgress(skillIds);

  let totalXp = 0;
  let pendingInserts = 0;

  for (const skill of skills) {
    if (!skill.user_id) {
      continue;
    }

    const targetLevel = Math.max(1, coerceInteger(skill.level, 1));
    const progressRow = progressBySkill.get(skill.id);
    const snapshot = snapshotFromRow(progressRow);
    const xpNeeded = computeXpNeeded(snapshot, targetLevel);

    if (xpNeeded <= 0) {
      continue;
    }

    const awardKey = `backfill:${skill.id}:lvl${targetLevel}`;

    const alreadyInserted = await ensureUniqueAward(skill.user_id, awardKey);
    if (alreadyInserted) {
      console.log(
        `⏭️  Skipping skill ${skill.id} (user ${skill.user_id}) — award ${awardKey} already exists.`
      );
      continue;
    }

    console.log(
      `➡️  Skill ${skill.id} (user ${skill.user_id}) is at level ${snapshot.level} but should be ${targetLevel}. Needs ${xpNeeded} XP.`
    );

    totalXp += xpNeeded;
    pendingInserts += 1;

    if (!isDryRun) {
      await insertXpEvent({
        user_id: skill.user_id,
        skill_id: skill.id,
        amount: xpNeeded,
        award_key: awardKey,
      });
    }
  }

  if (pendingInserts === 0) {
    console.log("\n✅ No backfill needed. All skill_progress snapshots are up to date.");
  } else {
    console.log(
      `\n✅ ${isDryRun ? "Would insert" : "Inserted"} ${pendingInserts} xp_events totalling ${totalXp} XP.`
    );
    if (isDryRun) {
      console.log("   Re-run without --dry-run to apply the changes.");
    } else {
      console.log("   dark_xp_events and user_progress will be updated by database triggers.");
    }
  }
}

main().catch((error) => {
  console.error("\n💥 Backfill script failed:", error.message);
  process.exit(1);
});
