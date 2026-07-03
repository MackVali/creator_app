import type { Json } from "@/types/supabase";

export type ScheduleEventSkillResolution = {
  skillIds: string[];
  source: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addSkillIdCandidate(target: Set<string>, value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) {
    target.add(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      addSkillIdCandidate(target, item);
    }
  }
}

function firstSkillId(value: unknown) {
  const ids = new Set<string>();
  addSkillIdCandidate(ids, value);
  return Array.from(ids)[0] ?? null;
}

export function resolveScheduleEventSkillContext(
  metadata: Json | null | undefined
): ScheduleEventSkillResolution {
  if (!isRecord(metadata)) {
    return { skillIds: [], source: null };
  }

  const sourceCandidates: Array<[string, unknown]> = [
    ["instance.metadata.skillId", metadata.skillId],
    ["instance.metadata.skill_id", metadata.skill_id],
    ["instance.metadata.skillIds", metadata.skillIds],
    ["instance.metadata.skill_ids", metadata.skill_ids],
  ];

  if (isRecord(metadata.skill)) {
    sourceCandidates.push(
      ["instance.metadata.skill.id", metadata.skill.id],
      ["instance.metadata.skill.skill_id", metadata.skill.skill_id]
    );
  }

  if (isRecord(metadata.context)) {
    sourceCandidates.push(
      ["instance.metadata.context.skillId", metadata.context.skillId],
      ["instance.metadata.context.skill_id", metadata.context.skill_id],
      ["instance.metadata.context.skillIds", metadata.context.skillIds],
      ["instance.metadata.context.skill_ids", metadata.context.skill_ids]
    );
  }

  const ids = new Set<string>();
  let source: string | null = null;
  for (const [candidateSource, value] of sourceCandidates) {
    const first = firstSkillId(value);
    addSkillIdCandidate(ids, value);
    if (!source && first) {
      source = candidateSource;
    }
  }

  return { skillIds: Array.from(ids), source };
}

export function buildScheduleEventSkillMetadata(skillId: string | null | undefined) {
  const normalizedSkillId =
    typeof skillId === "string" && skillId.trim().length > 0
      ? skillId.trim()
      : null;
  if (!normalizedSkillId) return null;
  return {
    skillId: normalizedSkillId,
    skillIds: [normalizedSkillId],
  } satisfies Json;
}
