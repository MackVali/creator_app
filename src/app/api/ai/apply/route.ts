import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { SCHEDULER_PRIORITY_LABELS } from "@/lib/types/ai";
import type {
  AiApplyCandidate,
  AiApplyErrorResponse,
  AiApplyField,
  AiApplySuggestedOverrides,
  AiIntent,
  AiSchedulerOp,
  SchedulerOpPreview,
} from "@/lib/types/ai";
import type { SupabaseClient } from "@supabase/supabase-js";

const BASE_INTENT_SCHEMA = z.object({
  confidence: z.number(),
  title: z.string(),
  message: z.string(),
});

const DRAFT_CREATE_GOAL_SCHEMA = BASE_INTENT_SCHEMA.extend({
  type: z.literal("DRAFT_CREATE_GOAL"),
  draft: z.object({
    name: z.string(),
    priority: z.string().optional(),
  }),
});

const DRAFT_CREATE_PROJECT_SCHEMA = BASE_INTENT_SCHEMA.extend({
  type: z.literal("DRAFT_CREATE_PROJECT"),
  draft: z.object({
    name: z.string(),
  }),
});

const DRAFT_CREATE_TASK_SCHEMA = BASE_INTENT_SCHEMA.extend({
  type: z.literal("DRAFT_CREATE_TASK"),
  draft: z.object({
    name: z.string(),
    projectId: z.string().optional(),
  }),
});

const SUGGEST_SCHEDULE_CHANGE_SCHEMA = BASE_INTENT_SCHEMA.extend({
  type: z.literal("SUGGEST_SCHEDULE_CHANGE"),
  suggestion: z.object({
    summary: z.string(),
  }),
});

const NEEDS_CLARIFICATION_SCHEMA = BASE_INTENT_SCHEMA.extend({
  type: z.literal("NEEDS_CLARIFICATION"),
  missing: z.array(z.string()),
  questions: z.array(z.string()),
});

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DAY_TYPE_BLOCK_TYPES = ["FOCUS", "PRACTICE", "BREAK"] as const;
const DAY_TYPE_BLOCK_ENERGY_LEVELS = [
  "NO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "ULTRA",
  "EXTREME",
] as const;

const SET_DAY_TYPE_ASSIGNMENT_SCHEMA = z.object({
  type: z.literal("SET_DAY_TYPE_ASSIGNMENT"),
  date: z.string().regex(DATE_PATTERN),
  day_type_name: z.string().trim().min(1),
});

const SET_GOAL_PRIORITY_BY_NAME_SCHEMA = z.object({
  type: z.literal("SET_GOAL_PRIORITY_BY_NAME"),
  goal_title: z.string().trim().min(1),
  priority: z
    .number()
    .int()
    .min(1)
    .max(SCHEDULER_PRIORITY_LABELS.length),
});

const SET_PROJECT_PRIORITY_BY_NAME_SCHEMA = z.object({
  type: z.literal("SET_PROJECT_PRIORITY_BY_NAME"),
  project_title: z.string().trim().min(1),
  priority: z
    .number()
    .int()
    .min(1)
    .max(SCHEDULER_PRIORITY_LABELS.length),
});

const TIME_BLOCK_PATCH_SCHEMA = z
  .object({
    start_local: z.string().trim().min(1).optional(),
    end_local: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.start_local || value.end_local), {
    message: "patch must include at least start_local or end_local",
  });

const UPDATE_DAY_TYPE_TIME_BLOCK_SCHEMA = z.object({
  type: z.literal("UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL"),
  day_type_name: z.string().trim().min(1),
  block_label: z.string().trim().min(1),
  patch: TIME_BLOCK_PATCH_SCHEMA,
});

const CREATE_DAY_TYPE_SCHEMA = z.object({
  type: z.literal("CREATE_DAY_TYPE"),
  name: z.string().trim().min(1),
});

const CREATE_DAY_TYPE_TIME_BLOCK_SCHEMA = z.object({
  type: z.literal("CREATE_DAY_TYPE_TIME_BLOCK"),
  day_type_name: z.string().trim().min(1),
  label: z.string().trim().min(1),
  start_local: z.string().trim().min(1),
  end_local: z.string().trim().min(1),
  block_type: z.enum(DAY_TYPE_BLOCK_TYPES).optional(),
  energy: z.enum(DAY_TYPE_BLOCK_ENERGY_LEVELS).optional(),
  days: z
    .array(z.number().int().min(1).max(7))
    .optional(),
});

const SCHEDULER_OP_SCHEMA = z.discriminatedUnion("type", [
  SET_DAY_TYPE_ASSIGNMENT_SCHEMA,
  SET_GOAL_PRIORITY_BY_NAME_SCHEMA,
  SET_PROJECT_PRIORITY_BY_NAME_SCHEMA,
  UPDATE_DAY_TYPE_TIME_BLOCK_SCHEMA,
  CREATE_DAY_TYPE_SCHEMA,
  CREATE_DAY_TYPE_TIME_BLOCK_SCHEMA,
]);

const DRAFT_SCHEDULER_INPUT_OPS_SCHEMA = BASE_INTENT_SCHEMA.extend({
  type: z.literal("DRAFT_SCHEDULER_INPUT_OPS"),
  ops: z.array(SCHEDULER_OP_SCHEMA).min(1),
});

const NO_OP_SCHEMA = BASE_INTENT_SCHEMA.extend({
  type: z.literal("NO_OP"),
});

const LINK_OVERRIDES_SCHEMA = z
  .object({
    goal_id: z.string().trim().min(1).optional(),
    project_id: z.string().trim().min(1).optional(),
    day_type_id: z.string().trim().min(1).optional(),
    day_type_time_block_id: z.string().trim().min(1).optional(),
  })
  .optional();

const AI_INTENT_SCHEMA = z.discriminatedUnion("type", [
  NO_OP_SCHEMA,
  DRAFT_CREATE_GOAL_SCHEMA,
  DRAFT_CREATE_PROJECT_SCHEMA,
  DRAFT_CREATE_TASK_SCHEMA,
  SUGGEST_SCHEDULE_CHANGE_SCHEMA,
  NEEDS_CLARIFICATION_SCHEMA,
  DRAFT_SCHEDULER_INPUT_OPS_SCHEMA,
]);

const AI_APPLY_SCHEMA = z.object({
  scope: z.enum(["read_only", "draft_creation", "schedule_edit"]),
  intent: AI_INTENT_SCHEMA,
  idempotency_key: z.string().trim().min(1).optional(),
  dry_run: z.boolean().optional(),
  link_overrides: LINK_OVERRIDES_SCHEMA,
});

const allowDraftCreation = new Set<AiIntent["type"]>([
  "DRAFT_CREATE_GOAL",
  "DRAFT_CREATE_PROJECT",
  "DRAFT_CREATE_TASK",
]);

const scheduleEditAllowed = new Set<AiIntent["type"]>([
  "SUGGEST_SCHEDULE_CHANGE",
  "DRAFT_SCHEDULER_INPUT_OPS",
]);

type Candidate = {
  id: string;
  title: string;
  score: number;
};

type PreviewResult = {
  warnings: string[];
  candidates?: {
    goals?: Candidate[];
    projects?: Candidate[];
  };
  suggested_links?: {
    goal_id?: string;
    project_id?: string;
  };
  ops?: SchedulerOpPreview[];
};

type AppliedActionRow = {
  intent_type: string;
  created_ids: string[] | null;
  message: string | null;
};

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const computeScore = (source: string, target: string) => {
  if (!source || !target) return 0;
  const baseSource = normalizeText(source);
  const baseTarget = normalizeText(target);
  if (!baseSource || !baseTarget) return 0;
  const sourceWords = new Set(baseSource.split(" ").filter(Boolean));
  const targetWords = new Set(baseTarget.split(" ").filter(Boolean));
  const intersection = [...sourceWords].filter((word) => targetWords.has(word));
  const union = new Set([...sourceWords, ...targetWords]);
  let score = union.size > 0 ? intersection.length / union.size : 0;
  if (baseSource.includes(baseTarget) || baseTarget.includes(baseSource)) {
    score += 0.15;
  }
  return Math.min(1, score);
};

const buildCandidates = (
  targetTitle: string,
  records: { id: string; title: string }[]
): Candidate[] => {
  const normalizedTarget = normalizeText(targetTitle);
  if (!normalizedTarget) return [];
  return records
    .map((record) => ({
      id: record.id,
      title: record.title,
      score: computeScore(targetTitle, record.title),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
};

const toSimpleCandidates = (candidates: Candidate[]): AiApplyCandidate[] =>
  candidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
  }));

const buildSimilarityCandidates = (
  title: string,
  records: { id: string; title: string }[]
): AiApplyCandidate[] => toSimpleCandidates(buildCandidates(title, records));

const respondFieldError = ({
  errorCode,
  message,
  field,
  candidates,
  suggestedOverrides,
}: {
  errorCode: AiApplyErrorResponse["error_code"];
  message: string;
  field: AiApplyField;
  candidates?: AiApplyCandidate[];
  suggestedOverrides?: AiApplySuggestedOverrides;
}) => {
  const payload: AiApplyErrorResponse = {
    ok: false,
    error_code: errorCode,
    message,
    field,
  };
  if (candidates && candidates.length > 0) {
    payload.candidates = candidates;
  }
  if (suggestedOverrides && Object.keys(suggestedOverrides).length > 0) {
    payload.suggested_overrides = suggestedOverrides;
  }
  return NextResponse.json(payload, { status: 400 });
};

const ALLOWED_SCHEDULER_WRITE_TABLES = new Set([
  "day_type_assignments",
  "day_type_time_blocks",
  "day_types",
  "goals",
  "projects",
  "time_blocks",
]);

const SCHEDULER_OP_WRITE_TABLES: Record<AiSchedulerOp["type"], string[]> = {
  SET_DAY_TYPE_ASSIGNMENT: ["day_type_assignments"],
  SET_GOAL_PRIORITY_BY_NAME: ["goals"],
  SET_PROJECT_PRIORITY_BY_NAME: ["projects"],
  UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL: ["time_blocks"],
  CREATE_DAY_TYPE: ["day_types"],
  CREATE_DAY_TYPE_TIME_BLOCK: ["time_blocks", "day_type_time_blocks"],
};

const findDisallowedOpTable = (
  ops: AiSchedulerOp[]
): { op: AiSchedulerOp; table: string } | null => {
  for (const op of ops) {
    const tables = SCHEDULER_OP_WRITE_TABLES[op.type] ?? [];
    for (const table of tables) {
      if (!ALLOWED_SCHEDULER_WRITE_TABLES.has(table)) {
        return { op, table };
      }
    }
  }
  return null;
};

async function fetchCandidates(
  supabase: SupabaseClient,
  userId: string,
  table: "goals" | "projects",
  columns: string
) {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) {
    console.error(`Failed to load ${table}`, error);
    return [];
  }
  return (data ?? []) as { id: string; [key: string]: any }[];
}

async function findAppliedAction(
  supabase: SupabaseClient,
  userId: string,
  key: string
): Promise<AppliedActionRow | null> {
  const { data, error } = await supabase
    .from("ai_applied_actions")
    .select("intent_type, created_ids, message")
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) {
    console.error("AI apply idempotency lookup error", error);
    return null;
  }
  return data ?? null;
}

async function recordAppliedAction(
  supabase: SupabaseClient,
  userId: string,
  key: string,
  intentType: AiIntent["type"],
  createdIds: string[],
  message: string
) {
  const { error } = await supabase.from("ai_applied_actions").insert({
    user_id: userId,
    idempotency_key: key,
    intent_type: intentType,
    created_ids: createdIds,
    message,
  });
  if (error) {
    console.error("Failed to record applied action", error);
  }
}

const respondDryRun = (payload: PreviewResult) =>
  NextResponse.json({ ok: true, dry_run: true, preview: payload });

const VALID_GOAL_OVERRIDE = "goal_id";
const VALID_PROJECT_OVERRIDE = "project_id";

const validateGoalOwnership = async (
  supabase: SupabaseClient,
  userId: string,
  goalId: string
) => {
  const { data, error } = await supabase
    .from("goals")
    .select("id")
    .eq("id", goalId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("Goal override lookup failed", error);
    return false;
  }
  return Boolean(data?.id);
};

const validateProjectOwnership = async (
  supabase: SupabaseClient,
  userId: string,
  projectId: string
) => {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("Project override lookup failed", error);
    return false;
  }
  return Boolean(data?.id);
};

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client unavailable" },
      { status: 500 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const payload = await request.json().catch(() => null);
  const parseResult = AI_APPLY_SCHEMA.safeParse(payload);
  if (!parseResult.success) {
    console.error("Invalid AI apply payload", parseResult.error);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { scope, intent, idempotency_key, dry_run, link_overrides } =
    parseResult.data;
  const idempotencyKey = idempotency_key?.trim() || null;
  const isDryRun = Boolean(dry_run);

  if (scope === "read_only") {
    return NextResponse.json(
      { error: "Read-only scope cannot apply intents" },
      { status: 400 }
    );
  }

  if (intent.type === "NO_OP" || intent.type === "NEEDS_CLARIFICATION") {
    return NextResponse.json(
      { error: "Intent cannot be applied" },
      { status: 400 }
    );
  }

  if (scope === "draft_creation" && !allowDraftCreation.has(intent.type)) {
    return NextResponse.json(
      {
        error:
          "Draft creation scope only supports DRAFT_CREATE_GOAL/PROJECT/TASK intents",
      },
      { status: 400 }
    );
  }

  if (scope === "schedule_edit" && !scheduleEditAllowed.has(intent.type)) {
    return NextResponse.json(
      {
        error: `Schedule edit scope only supports ${Array.from(
          scheduleEditAllowed
        ).join("/")} intents`,
      },
      { status: 400 }
    );
  }

  if (idempotencyKey) {
    const existing = await findAppliedAction(supabase, user.id, idempotencyKey);
    if (existing) {
      const applied = {
        type: existing.intent_type as AiIntent["type"],
        ids: existing.created_ids ?? [],
      };
      const message = existing.message || "Intent already applied";
      if (isDryRun) {
        return NextResponse.json({
          ok: true,
          dry_run: true,
          preview: {
            warnings: [],
            matches: { applied, message },
          } as PreviewResult,
        });
      }
      return NextResponse.json({ ok: true, applied, message });
    }
  }

const derivePreviewCandidates = async (
  title: string,
  table: "goals" | "projects"
): Promise<Candidate[]> => {
  const records = await fetchCandidates(supabase, user.id, table, "id,name");
  return buildCandidates(
    title,
    records.map((row) => ({
      id: row.id,
      title: row.name ?? row.title ?? "",
    }))
  );
};

  const dryRunResponse = (payload: PreviewResult) => respondDryRun(payload);

  try {
    switch (intent.type) {
      case "DRAFT_CREATE_GOAL": {
        const warnings: string[] = [];
        const trimmedName = intent.draft.name.trim();
        if (!trimmedName) {
          return NextResponse.json(
            { error: "Goal name is required" },
            { status: 400 }
          );
        }
        if (trimmedName !== intent.draft.name) {
          warnings.push("Goal name was trimmed for validation.");
        }
        if (isDryRun) {
          return dryRunResponse({ warnings });
        }
        const priority = intent.draft.priority?.trim() || "NO";
        const { data, error } = await supabase
          .from("goals")
          .insert({
            user_id: user.id,
            name: trimmedName,
            priority,
            energy: "NO",
          })
          .select("id")
          .single();
        if (error) {
          console.error("Failed to insert goal", error);
          return NextResponse.json(
            { error: "Unable to create goal" },
            { status: 500 }
          );
        }
        const createdIds = data?.id ? [data.id] : [];
        const appliedResult = { type: intent.type, ids: createdIds };
        const message = "Goal creation confirmed";
        if (idempotencyKey) {
          await recordAppliedAction(
            supabase,
            user.id,
            idempotencyKey,
            intent.type,
            createdIds,
            message
          );
        }
        return NextResponse.json({ ok: true, applied: appliedResult, message });
      }
      case "DRAFT_CREATE_PROJECT": {
        const warnings: string[] = [];
        const trimmedName = intent.draft.name.trim();
        if (!trimmedName) {
          return NextResponse.json(
            { error: "Project name is required" },
            { status: 400 }
          );
        }
        if (trimmedName !== intent.draft.name) {
          warnings.push("Project name was trimmed for validation.");
        }
        const goalOverride = link_overrides?.goal_id?.trim();
        if (goalOverride && !(await validateGoalOwnership(supabase, user.id, goalOverride))) {
          return NextResponse.json(
            { error: "Invalid or unauthorized goal override" },
            { status: 400 }
          );
        }
        if (isDryRun) {
          const goalCandidates = await derivePreviewCandidates(trimmedName, "goals");
          const suggestedGoal = goalCandidates[0]?.score >= 0.15 ? goalCandidates[0].id : undefined;
          return dryRunResponse({
            warnings,
            candidates: { goals: goalCandidates },
            suggested_links: { goal_id: suggestedGoal },
          });
        }
        const { data, error } = await supabase
          .from("projects")
          .insert({
            user_id: user.id,
            name: trimmedName,
            stage: "BUILD",
            priority: "NO",
            energy: "MEDIUM",
            goal_id: goalOverride || null,
          })
          .select("id")
          .single();
        if (error) {
          console.error("Failed to insert project", error);
          return NextResponse.json(
            { error: "Unable to create project" },
            { status: 500 }
          );
        }
        const createdIds = data?.id ? [data.id] : [];
        const appliedResult = { type: intent.type, ids: createdIds };
        const message = "Project creation confirmed";
        if (idempotencyKey) {
          await recordAppliedAction(
            supabase,
            user.id,
            idempotencyKey,
            intent.type,
            createdIds,
            message
          );
        }
        return NextResponse.json({ ok: true, applied: appliedResult, message });
      }
      case "DRAFT_CREATE_TASK": {
        const warnings: string[] = [];
        const trimmedName = intent.draft.name.trim();
        const trimmedProjectId = intent.draft.projectId?.trim();
        const projectOverride = link_overrides?.project_id?.trim();
        if (!trimmedName) {
          return NextResponse.json(
            { error: "Task name is required" },
            { status: 400 }
          );
        }
        const linkedProjectId = projectOverride || trimmedProjectId;
        if (!linkedProjectId) {
          return NextResponse.json(
            { error: "Task must be linked to a project" },
            { status: 400 }
          );
        }
        if (trimmedName !== intent.draft.name) {
          warnings.push("Task name was trimmed for validation.");
        }
        if (
          projectOverride &&
          !(await validateProjectOwnership(supabase, user.id, projectOverride))
        ) {
          return NextResponse.json(
            { error: "Invalid or unauthorized project override" },
            { status: 400 }
          );
        }
        if (isDryRun) {
          const projectCandidates = await derivePreviewCandidates(trimmedName, "projects");
          const suggestedProject = projectCandidates[0]?.score >= 0.15 ? projectCandidates[0].id : undefined;
          return dryRunResponse({
            warnings,
            candidates: { projects: projectCandidates },
            suggested_links: { project_id: suggestedProject },
          });
        }
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            user_id: user.id,
            name: trimmedName,
            project_id: linkedProjectId,
            stage: "RESEARCH",
          })
          .select("id")
          .single();
        if (error) {
          console.error("Failed to insert task", error);
          return NextResponse.json(
            { error: "Unable to create task" },
            { status: 500 }
          );
        }
        const createdIds = data?.id ? [data.id] : [];
        const appliedResult = { type: intent.type, ids: createdIds };
        const message = "Task creation confirmed";
        if (idempotencyKey) {
          await recordAppliedAction(
            supabase,
            user.id,
            idempotencyKey,
            intent.type,
            createdIds,
            message
          );
        }
        return NextResponse.json({ ok: true, applied: appliedResult, message });
      }

      case "DRAFT_SCHEDULER_INPUT_OPS": {
        const schedulerOps = intent.ops ?? [];
        if (schedulerOps.length === 0) {
          return NextResponse.json(
            { error: "Scheduler intent must include at least one operation" },
            { status: 400 }
          );
        }
        const disallowed = findDisallowedOpTable(schedulerOps);
        if (disallowed) {
          console.error(
            "Scheduler op attempted to touch disallowed table",
            disallowed.table,
            disallowed.op
          );
          return NextResponse.json(
            { error: "Op not permitted" },
            { status: 400 }
          );
        }

        const [
          dayTypesResponse,
          dayTypeTimeBlocksResponse,
          goalResponse,
          projectResponse,
        ] = await Promise.all([
          supabase
            .from("day_types")
            .select("id,name")
            .eq("user_id", user.id),
          supabase
            .from("day_type_time_blocks")
            .select(
              "id,day_type_id,time_blocks(id,label,start_local,end_local)"
            )
            .eq("user_id", user.id),
          supabase
            .from("goals")
            .select("id,name,priority,priority_code")
            .eq("user_id", user.id),
          supabase
            .from("projects")
            .select("id,name,priority")
            .eq("user_id", user.id),
        ]);

        if (dayTypesResponse.error) {
          console.error(
            "AI apply snapshot error loading day types",
            dayTypesResponse.error
          );
          return NextResponse.json(
            { error: "Unable to load day type metadata" },
            { status: 500 }
          );
        }
        if (dayTypeTimeBlocksResponse.error) {
          console.error(
            "AI apply snapshot error loading day type time blocks",
            dayTypeTimeBlocksResponse.error
          );
          return NextResponse.json(
            { error: "Unable to load day type time blocks" },
            { status: 500 }
          );
        }
        if (goalResponse.error) {
          console.error(
            "AI apply snapshot error loading goals",
            goalResponse.error
          );
          return NextResponse.json(
            { error: "Unable to load goals" },
            { status: 500 }
          );
        }
        if (projectResponse.error) {
          console.error(
            "AI apply snapshot error loading projects",
            projectResponse.error
          );
          return NextResponse.json(
            { error: "Unable to load projects" },
            { status: 500 }
          );
        }

        const dayTypes = dayTypesResponse.data ?? [];
        const dayTypesById = new Map(dayTypes.map((row) => [row.id, row]));
        const dayTypeNameMap = new Map<string, typeof dayTypes[number][]>();
        for (const row of dayTypes) {
          const normalized = normalizeText(row.name ?? "");
          if (!normalized) continue;
          const bucket = dayTypeNameMap.get(normalized) ?? [];
          bucket.push(row);
          dayTypeNameMap.set(normalized, bucket);
        }

        const dayTypeTimeBlocks = (
          dayTypeTimeBlocksResponse.data ?? []
        )
          .map((row) => {
            const timeBlock = row.time_blocks;
            if (!timeBlock?.id) return null;
            return {
              joinId: row.id,
              dayTypeId: row.day_type_id,
              timeBlockId: timeBlock.id,
              label: timeBlock.label ?? "",
              start_local: timeBlock.start_local ?? "",
              end_local: timeBlock.end_local ?? "",
            };
          })
          .filter(
            (item): item is {
              joinId: string;
              dayTypeId: string;
              timeBlockId: string;
              label: string;
              start_local: string;
              end_local: string;
            } => Boolean(item && item.label)
          );
        const dayTypeTimeBlockMap = new Map<
          string,
          (typeof dayTypeTimeBlocks)[number][]
        >();
        for (const block of dayTypeTimeBlocks) {
          const key = `${block.dayTypeId}|${normalizeText(block.label)}`;
          const bucket = dayTypeTimeBlockMap.get(key) ?? [];
          bucket.push(block);
          dayTypeTimeBlockMap.set(key, bucket);
        }
        const dayTypeCandidateRecords = dayTypes.map((row) => ({
          id: row.id,
          title: row.name ?? "Unnamed day type",
        }));
        const timeBlockById = new Map(
          dayTypeTimeBlocks.map((block) => [block.timeBlockId, block])
        );
        const timeBlockCandidateRecords = dayTypeTimeBlocks.map((block) => {
          const typeName =
            dayTypesById.get(block.dayTypeId)?.name ?? "Day type";
          const timeRange =
            block.start_local && block.end_local
              ? ` (${block.start_local}-${block.end_local})`
              : "";
          return {
            id: block.timeBlockId,
            title: `${typeName} – ${block.label}${timeRange}`,
          };
        });

        const goals = goalResponse.data ?? [];
        const projects = projectResponse.data ?? [];
        const goalById = new Map(goals.map((row) => [row.id, row]));
        const projectById = new Map(projects.map((row) => [row.id, row]));
        const goalNameMap = new Map<string, typeof goals[number][]>();
        const projectNameMap = new Map<string, typeof projects[number][]>();
        for (const goal of goals) {
          if (!goal.name) continue;
          const normalized = normalizeText(goal.name);
          if (!normalized) continue;
          const bucket = goalNameMap.get(normalized) ?? [];
          bucket.push(goal);
          goalNameMap.set(normalized, bucket);
        }
        for (const project of projects) {
          if (!project.name) continue;
          const normalized = normalizeText(project.name);
          if (!normalized) continue;
          const bucket = projectNameMap.get(normalized) ?? [];
          bucket.push(project);
          projectNameMap.set(normalized, bucket);
        }
        const goalCandidateRecords = goals
          .filter((goal) => Boolean(goal.name))
          .map((goal) => ({
            id: goal.id,
            title: goal.name ?? "Untitled goal",
          }));
        const projectCandidateRecords = projects
          .filter((project) => Boolean(project.name))
          .map((project) => ({
            id: project.id,
            title: project.name ?? "Untitled project",
          }));

        const assignmentDates = Array.from(
          new Set(
            schedulerOps
              .filter(
                (
                  op
                ): op is Extract<
                  AiSchedulerOp,
                  { type: "SET_DAY_TYPE_ASSIGNMENT" }
                > => op.type === "SET_DAY_TYPE_ASSIGNMENT"
              )
              .map((op) => op.date)
          )
        );
        let assignmentRecords: {
          id: string;
          date_key: string;
          day_type_id: string;
        }[] = [];
        if (assignmentDates.length > 0) {
          const assignmentResponse = await supabase
            .from("day_type_assignments")
            .select("id,date_key,day_type_id")
            .eq("user_id", user.id)
            .in("date_key", assignmentDates);
          if (assignmentResponse.error) {
            console.error(
              "AI apply snapshot error loading day type assignments",
              assignmentResponse.error
            );
            return NextResponse.json(
              { error: "Unable to load day type assignments" },
              { status: 500 }
            );
          }
          assignmentRecords = assignmentResponse.data ?? [];
        }
        const assignmentMap = new Map(
          assignmentRecords.map((record) => [record.date_key, record])
        );

        const goalOverrideId =
          typeof link_overrides?.goal_id === "string" &&
          link_overrides.goal_id.trim()
            ? link_overrides.goal_id.trim()
            : null;
        const projectOverrideId =
          typeof link_overrides?.project_id === "string" &&
          link_overrides.project_id.trim()
            ? link_overrides.project_id.trim()
            : null;
        const dayTypeOverrideId =
          typeof link_overrides?.day_type_id === "string" &&
          link_overrides.day_type_id.trim()
            ? link_overrides.day_type_id.trim()
            : null;
        const dayTypeTimeBlockOverrideId =
          typeof link_overrides?.day_type_time_block_id === "string" &&
          link_overrides.day_type_time_block_id.trim()
            ? link_overrides.day_type_time_block_id.trim()
            : null;

        const pendingDayTypeNames = new Set<string>();
        for (const op of schedulerOps) {
          if (op.type === "CREATE_DAY_TYPE") {
            const normalized = normalizeText(op.name);
            if (normalized) {
              pendingDayTypeNames.add(normalized);
            }
          }
        }
        const seenCreateDayTypeNames = new Set<string>();

        const resolvedOps: Array<
          | {
              type: "SET_DAY_TYPE_ASSIGNMENT";
              date: string;
              dayTypeId: string;
              dayTypeName: string;
              beforeLabel: string;
              afterLabel: string;
              assignmentId?: string;
            }
          | {
              type: "SET_GOAL_PRIORITY_BY_NAME";
              goalId: string;
              goalTitle: string;
              beforeLabel: string;
              afterLabel: string;
            }
          | {
              type: "SET_PROJECT_PRIORITY_BY_NAME";
              projectId: string;
              projectTitle: string;
              beforeLabel: string;
              afterLabel: string;
            }
          | {
              type: "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL";
              timeBlockId: string;
              dayTypeName: string;
              blockLabel: string;
              beforeLabel: string;
              afterLabel: string;
              startUpdate?: string;
              endUpdate?: string;
            }
          | {
              type: "CREATE_DAY_TYPE";
              dayTypeName: string;
              normalizedDayTypeName: string;
              beforeLabel: string;
              afterLabel: string;
            }
          | {
              type: "CREATE_DAY_TYPE_TIME_BLOCK";
              dayTypeName: string;
              normalizedDayTypeName: string;
              blockLabel: string;
              startLocal: string;
              endLocal: string;
              blockType: string;
              energy: string;
              days?: number[];
              beforeLabel: string;
              afterLabel: string;
            }
        > = [];

        for (const op of schedulerOps) {
          switch (op.type) {
            case "SET_DAY_TYPE_ASSIGNMENT": {
              const normalizedDayType = normalizeText(op.day_type_name);
              if (!normalizedDayType) {
                return NextResponse.json(
                  {
                    error:
                      "Day type name is required for assignment operations.",
                  },
                  { status: 400 }
                );
              }
              const matches = dayTypeNameMap.get(normalizedDayType) ?? [];
              const overrideDayType =
                dayTypeOverrideId && dayTypesById.get(dayTypeOverrideId);
              let selectedDayType =
                overrideDayType ?? (matches.length === 1 ? matches[0] : null);
              if (!selectedDayType) {
                if (matches.length > 1) {
                  const matchCandidates = matches.map((match) => ({
                    id: match.id,
                    title: match.name ?? "Unnamed day type",
                  }));
                  return respondFieldError({
                    errorCode: "AMBIGUOUS_MATCH",
                    message: `Ambiguous day type name "${op.day_type_name}".`,
                    field: "day_type_name",
                    candidates: matchCandidates,
                    suggestedOverrides: matchCandidates[0]
                      ? { day_type_id: matchCandidates[0].id }
                      : undefined,
                  });
                }
                const similarityCandidates = buildSimilarityCandidates(
                  op.day_type_name,
                  dayTypeCandidateRecords
                );
                return respondFieldError({
                  errorCode: "NOT_FOUND",
                  message: `Day type "${op.day_type_name}" not found.`,
                  field: "day_type_name",
                  candidates: similarityCandidates,
                  suggestedOverrides: similarityCandidates[0]
                    ? { day_type_id: similarityCandidates[0].id }
                    : undefined,
                });
              }
              const assignment = assignmentMap.get(op.date);
              const beforeLabel = assignment
                ? dayTypesById.get(assignment.day_type_id)?.name ?? "Unknown"
                : "None";
              const afterLabel = selectedDayType.name ?? op.day_type_name;
              resolvedOps.push({
                type: op.type,
                date: op.date,
                dayTypeId: selectedDayType.id,
                dayTypeName: selectedDayType.name ?? op.day_type_name,
                beforeLabel,
                afterLabel,
                assignmentId: assignment?.id,
              });
              break;
            }
            case "SET_GOAL_PRIORITY_BY_NAME": {
              const normalizedGoal = normalizeText(op.goal_title);
              if (!normalizedGoal) {
                return NextResponse.json(
                  { error: "Goal title is required." },
                  { status: 400 }
                );
              }
              const candidates = goalNameMap.get(normalizedGoal) ?? [];
              let goalRecord = candidates.length === 1 ? candidates[0] : null;
              if (!goalRecord && goalOverrideId) {
                if (!(await validateGoalOwnership(supabase, user.id, goalOverrideId))) {
                  return NextResponse.json(
                    { error: "Invalid or unauthorized goal override" },
                    { status: 400 }
                  );
                }
                goalRecord = goalById.get(goalOverrideId) ?? null;
              }
              if (!goalRecord) {
                if (candidates.length > 1) {
                  const candidateList = candidates.map((candidate) => ({
                    id: candidate.id,
                    title: candidate.name ?? "Untitled goal",
                  }));
                  return respondFieldError({
                    errorCode: "AMBIGUOUS_MATCH",
                    message: `Ambiguous goal title "${op.goal_title}". Provide a more specific name or use a goal override.`,
                    field: "goal_title",
                    candidates: candidateList,
                    suggestedOverrides: candidateList[0]
                      ? { goal_id: candidateList[0].id }
                      : undefined,
                  });
                }
                const similarityCandidates = buildSimilarityCandidates(
                  op.goal_title,
                  goalCandidateRecords
                );
                return respondFieldError({
                  errorCode: "NOT_FOUND",
                  message: `Goal "${op.goal_title}" not found.`,
                  field: "goal_title",
                  candidates: similarityCandidates,
                  suggestedOverrides: similarityCandidates[0]
                    ? { goal_id: similarityCandidates[0].id }
                    : undefined,
                });
              }
              const afterLabel = SCHEDULER_PRIORITY_LABELS[op.priority - 1];
              const beforeLabel =
                goalRecord.priority ?? goalRecord.priority_code ?? "NO";
              resolvedOps.push({
                type: op.type,
                goalId: goalRecord.id,
                goalTitle: goalRecord.name ?? op.goal_title,
                beforeLabel,
                afterLabel,
              });
              break;
            }
            case "SET_PROJECT_PRIORITY_BY_NAME": {
              const normalizedProject = normalizeText(op.project_title);
              if (!normalizedProject) {
                return NextResponse.json(
                  { error: "Project title is required." },
                  { status: 400 }
                );
              }
              const candidates = projectNameMap.get(normalizedProject) ?? [];
              let projectRecord = candidates.length === 1 ? candidates[0] : null;
              if (!projectRecord && projectOverrideId) {
                if (
                  !(await validateProjectOwnership(
                    supabase,
                    user.id,
                    projectOverrideId
                  ))
                ) {
                  return NextResponse.json(
                    { error: "Invalid or unauthorized project override" },
                    { status: 400 }
                  );
                }
                projectRecord = projectById.get(projectOverrideId) ?? null;
              }
              if (!projectRecord) {
                if (candidates.length > 1) {
                  const candidateList = candidates.map((candidate) => ({
                    id: candidate.id,
                    title: candidate.name ?? "Untitled project",
                  }));
                  return respondFieldError({
                    errorCode: "AMBIGUOUS_MATCH",
                    message: `Ambiguous project title "${op.project_title}". Provide a more specific name or use a project override.`,
                    field: "project_title",
                    candidates: candidateList,
                    suggestedOverrides: candidateList[0]
                      ? { project_id: candidateList[0].id }
                      : undefined,
                  });
                }
                const similarityCandidates = buildSimilarityCandidates(
                  op.project_title,
                  projectCandidateRecords
                );
                return respondFieldError({
                  errorCode: "NOT_FOUND",
                  message: `Project "${op.project_title}" not found.`,
                  field: "project_title",
                  candidates: similarityCandidates,
                  suggestedOverrides: similarityCandidates[0]
                    ? { project_id: similarityCandidates[0].id }
                    : undefined,
                });
              }
              const afterLabel = SCHEDULER_PRIORITY_LABELS[op.priority - 1];
              const beforeLabel = projectRecord.priority ?? "NO";
              resolvedOps.push({
                type: op.type,
                projectId: projectRecord.id,
                projectTitle: projectRecord.name ?? op.project_title,
                beforeLabel,
                afterLabel,
              });
              break;
            }
            case "CREATE_DAY_TYPE": {
              const normalizedName = normalizeText(op.name);
              if (!normalizedName) {
                return NextResponse.json(
                  {
                    error: "Day type name is required for creation.",
                  },
                  { status: 400 }
                );
              }
              if (dayTypeNameMap.has(normalizedName)) {
                const matches = dayTypeNameMap.get(normalizedName) ?? [];
                const candidateList = matches.map((match) => ({
                  id: match.id,
                  title: match.name ?? "Unnamed day type",
                }));
                return respondFieldError({
                  errorCode: "AMBIGUOUS_MATCH",
                  message: `Day type "${op.name}" already exists.`,
                  field: "day_type_name",
                  candidates: candidateList,
                  suggestedOverrides: candidateList[0]
                    ? { day_type_id: candidateList[0].id }
                    : undefined,
                });
              }
              if (seenCreateDayTypeNames.has(normalizedName)) {
                return NextResponse.json(
                  {
                    error: `Day type "${op.name}" is already scheduled for creation.`,
                  },
                  { status: 400 }
                );
              }
              seenCreateDayTypeNames.add(normalizedName);
              resolvedOps.push({
                type: op.type,
                dayTypeName: op.name,
                normalizedDayTypeName: normalizedName,
                beforeLabel: "None",
                afterLabel: op.name,
              });
              break;
            }
            case "CREATE_DAY_TYPE_TIME_BLOCK": {
              const normalizedDayType = normalizeText(op.day_type_name);
              if (!normalizedDayType) {
                return NextResponse.json(
                  {
                    error:
                      "Day type name is required for block creation operations.",
                  },
                  { status: 400 }
                );
              }
              const matches = dayTypeNameMap.get(normalizedDayType) ?? [];
              const hasPendingCreation = pendingDayTypeNames.has(
                normalizedDayType
              );
              if (!hasPendingCreation && matches.length > 1) {
                const matchCandidates = matches.map((match) => ({
                  id: match.id,
                  title: match.name ?? "Unnamed day type",
                }));
                return respondFieldError({
                  errorCode: "AMBIGUOUS_MATCH",
                  message: `Ambiguous day type "${op.day_type_name}" in block creation.`,
                  field: "day_type_name",
                  candidates: matchCandidates,
                  suggestedOverrides: matchCandidates[0]
                    ? { day_type_id: matchCandidates[0].id }
                    : undefined,
                });
              }
              if (!hasPendingCreation && matches.length === 0) {
                const similarityCandidates = buildSimilarityCandidates(
                  op.day_type_name,
                  dayTypeCandidateRecords
                );
                return respondFieldError({
                  errorCode: "NOT_FOUND",
                  message: `Day type "${op.day_type_name}" not found.`,
                  field: "day_type_name",
                  candidates: similarityCandidates,
                  suggestedOverrides: similarityCandidates[0]
                    ? { day_type_id: similarityCandidates[0].id }
                    : undefined,
                });
              }
              const blockType = op.block_type ?? "FOCUS";
              const energy =
                op.energy ??
                (blockType === "BREAK"
                  ? "NO"
                  : blockType === "PRACTICE"
                  ? "LOW"
                  : "MEDIUM");
              const afterLabel = `${op.label} (${blockType} ${energy}) ${op.start_local}-${op.end_local}`;
              resolvedOps.push({
                type: op.type,
                dayTypeName: op.day_type_name,
                normalizedDayTypeName: normalizedDayType,
                blockLabel: op.label,
                startLocal: op.start_local,
                endLocal: op.end_local,
                blockType,
                energy,
                days: op.days,
                beforeLabel: "Not created yet",
                afterLabel,
              });
              break;
            }
            case "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL": {
              const normalizedDayType = normalizeText(op.day_type_name);
              if (!normalizedDayType) {
                return NextResponse.json(
                  {
                    error:
                      "Day type name is required for time block updates.",
                  },
                  { status: 400 }
                );
              }
              const dayTypeMatches =
                dayTypeNameMap.get(normalizedDayType) ?? [];
              const overrideBlock =
                dayTypeTimeBlockOverrideId &&
                timeBlockById.get(dayTypeTimeBlockOverrideId);
              const overrideBlockDayType =
                overrideBlock && dayTypesById.get(overrideBlock.dayTypeId);
              const overrideDayType =
                dayTypeOverrideId && dayTypesById.get(dayTypeOverrideId);
              let selectedDayType =
                overrideDayType ??
                overrideBlockDayType ??
                (dayTypeMatches.length === 1 ? dayTypeMatches[0] : null);
              if (!selectedDayType) {
                if (dayTypeMatches.length > 1) {
                  const matchCandidates = dayTypeMatches.map((match) => ({
                    id: match.id,
                    title: match.name ?? "Unnamed day type",
                  }));
                  return respondFieldError({
                    errorCode: "AMBIGUOUS_MATCH",
                    message: `Ambiguous day type "${op.day_type_name}" in time block patch.`,
                    field: "day_type_name",
                    candidates: matchCandidates,
                    suggestedOverrides: matchCandidates[0]
                      ? { day_type_id: matchCandidates[0].id }
                      : undefined,
                  });
                }
                const similarityCandidates = buildSimilarityCandidates(
                  op.day_type_name,
                  dayTypeCandidateRecords
                );
                return respondFieldError({
                  errorCode: "NOT_FOUND",
                  message: `Day type "${op.day_type_name}" not found.`,
                  field: "day_type_name",
                  candidates: similarityCandidates,
                  suggestedOverrides: similarityCandidates[0]
                    ? { day_type_id: similarityCandidates[0].id }
                    : undefined,
                });
              }
              const normalizedBlockLabel = normalizeText(op.block_label);
              if (!normalizedBlockLabel) {
                return NextResponse.json(
                  {
                    error: "Time block label is required for updates.",
                  },
                  { status: 400 }
                );
              }
              const blockKey = `${selectedDayType.id}|${normalizedBlockLabel}`;
              const blocks = dayTypeTimeBlockMap.get(blockKey) ?? [];
              let selectedBlock: typeof dayTypeTimeBlocks[number] | null = null;
              if (
                overrideBlock &&
                selectedDayType &&
                overrideBlock.dayTypeId === selectedDayType.id
              ) {
                selectedBlock = overrideBlock;
              }
              if (!selectedBlock && blocks.length === 1) {
                selectedBlock = blocks[0];
              }
              if (!selectedBlock) {
                if (blocks.length > 1) {
                  const blockCandidates = blocks.map((block) => {
                    const typeName =
                      selectedDayType.name ?? "Unnamed day type";
                    const timeRange =
                      block.start_local && block.end_local
                        ? ` (${block.start_local}-${block.end_local})`
                        : "";
                    return {
                      id: block.timeBlockId,
                      title: `${typeName} – ${block.label}${timeRange}`,
                    };
                  });
                  return respondFieldError({
                    errorCode: "AMBIGUOUS_MATCH",
                    message: `Ambiguous time block label "${op.block_label}" for day type "${op.day_type_name}".`,
                    field: "time_block_label",
                    candidates: blockCandidates,
                    suggestedOverrides: blockCandidates[0]
                      ? {
                          day_type_id: selectedDayType.id,
                          day_type_time_block_id: blockCandidates[0].id,
                        }
                      : undefined,
                  });
                }
                const similarityCandidates = buildSimilarityCandidates(
                  `${selectedDayType.name ?? "Day type"} – ${op.block_label}`,
                  timeBlockCandidateRecords
                );
                const fallbackBlockId = similarityCandidates[0]?.id;
                const fallbackDayTypeId = fallbackBlockId
                  ? timeBlockById.get(fallbackBlockId)?.dayTypeId
                  : undefined;
                const fallbackOverrides = fallbackBlockId
                  ? {
                      day_type_time_block_id: fallbackBlockId,
                      day_type_id: fallbackDayTypeId,
                    }
                  : undefined;
                return respondFieldError({
                  errorCode: "NOT_FOUND",
                  message: `Time block "${op.block_label}" not found for day type "${op.day_type_name}".`,
                  field: "time_block_label",
                  candidates: similarityCandidates,
                  suggestedOverrides: fallbackOverrides,
                });
              }
              const startUpdate = op.patch.start_local?.trim();
              const endUpdate = op.patch.end_local?.trim();
              const beforeLabel = `start: ${selectedBlock.start_local || "??"} end: ${selectedBlock.end_local || "??"}`;
              const afterLabel = `start: ${startUpdate ?? selectedBlock.start_local ?? "??"} end: ${endUpdate ?? selectedBlock.end_local ?? "??"}`;
              resolvedOps.push({
                type: op.type,
                timeBlockId: selectedBlock.timeBlockId,
                dayTypeName: selectedDayType.name ?? op.day_type_name,
                blockLabel: selectedBlock.label || op.block_label,
                beforeLabel,
                afterLabel,
                startUpdate: startUpdate || undefined,
                endUpdate: endUpdate || undefined,
              });
              break;
            }
          }
        }

        const previewOps: SchedulerOpPreview[] = resolvedOps.map((resolved) => {
          switch (resolved.type) {
            case "SET_DAY_TYPE_ASSIGNMENT":
              return {
                type: resolved.type,
                description: `Assign ${resolved.date} to ${resolved.dayTypeName}`,
                resolvedId: resolved.dayTypeId,
                before: resolved.beforeLabel,
                after: resolved.afterLabel,
              };
            case "SET_GOAL_PRIORITY_BY_NAME":
              return {
                type: resolved.type,
                description: `Set goal "${resolved.goalTitle}" priority`,
                resolvedId: resolved.goalId,
                before: resolved.beforeLabel,
                after: resolved.afterLabel,
              };
            case "SET_PROJECT_PRIORITY_BY_NAME":
              return {
                type: resolved.type,
                description: `Set project "${resolved.projectTitle}" priority`,
                resolvedId: resolved.projectId,
                before: resolved.beforeLabel,
                after: resolved.afterLabel,
              };
            case "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL":
              return {
                type: resolved.type,
                description: `Update "${resolved.blockLabel}" block for ${resolved.dayTypeName}`,
                resolvedId: resolved.timeBlockId,
                before: resolved.beforeLabel,
                after: resolved.afterLabel,
              };
            case "CREATE_DAY_TYPE":
              return {
                type: resolved.type,
                description: `Create day type "${resolved.dayTypeName}"`,
                before: resolved.beforeLabel,
                after: resolved.afterLabel,
              };
            case "CREATE_DAY_TYPE_TIME_BLOCK":
              return {
                type: resolved.type,
                description: `Add "${resolved.blockLabel}" block to ${resolved.dayTypeName}`,
                before: resolved.beforeLabel,
                after: resolved.afterLabel,
              };
            default:
              return {
                type: resolved.type,
                description: "Prepare scheduler change",
              };
          }
        });

        const warnings: string[] = [];
        if (isDryRun) {
          return dryRunResponse({ warnings, ops: previewOps });
        }

        const appliedIds = new Set<string>();
        const createdDayTypeIds = new Map<string, string>();
        for (const resolved of resolvedOps) {
          if (resolved.type !== "CREATE_DAY_TYPE") {
            continue;
          }
          const { data: dayTypeData, error: dayTypeError } = await supabase
            .from("day_types")
            .insert({
              user_id: user.id,
              name: resolved.dayTypeName,
              is_default: false,
            })
            .select("id")
            .single();
          if (dayTypeError || !dayTypeData?.id) {
            console.error("Failed to create day type", dayTypeError);
            return NextResponse.json(
              { error: "Unable to create day type" },
              { status: 500 }
            );
          }
          createdDayTypeIds.set(
            resolved.normalizedDayTypeName,
            dayTypeData.id
          );
          dayTypesById.set(dayTypeData.id, {
            id: dayTypeData.id,
            name: resolved.dayTypeName,
          });
          const bucket =
            dayTypeNameMap.get(resolved.normalizedDayTypeName) ?? [];
          bucket.push({ id: dayTypeData.id, name: resolved.dayTypeName });
          dayTypeNameMap.set(resolved.normalizedDayTypeName, bucket);
          appliedIds.add(dayTypeData.id);
        }

        const resolveDayTypeId = (normalized: string): string | null =>
          createdDayTypeIds.get(normalized) ??
          (dayTypeNameMap.get(normalized) ?? [])[0]?.id ??
          null;

        for (const resolved of resolvedOps) {
          switch (resolved.type) {
            case "CREATE_DAY_TYPE":
              continue;
            case "CREATE_DAY_TYPE_TIME_BLOCK": {
              const dayTypeId = resolveDayTypeId(
                resolved.normalizedDayTypeName
              );
              if (!dayTypeId) {
                console.error(
                  "Day type ID missing for block creation",
                  resolved.normalizedDayTypeName
                );
                return NextResponse.json(
                  { error: "Unable to resolve day type for block" },
                  { status: 500 }
                );
              }
              const { data: timeBlockData, error: timeBlockError } =
                await supabase
                  .from("time_blocks")
                  .insert({
                    user_id: user.id,
                    label: resolved.blockLabel,
                    start_local: resolved.startLocal,
                    end_local: resolved.endLocal,
                    days: resolved.days ?? null,
                    day_type_id: dayTypeId,
                  })
                  .select("id")
                  .single();
              if (timeBlockError || !timeBlockData?.id) {
                console.error("Failed to insert time block", timeBlockError);
                return NextResponse.json(
                  { error: "Unable to create time block" },
                  { status: 500 }
                );
              }
              const {
                data: dttbData,
                error: dttbError,
              } = await supabase
                .from("day_type_time_blocks")
                .insert({
                  user_id: user.id,
                  day_type_id: dayTypeId,
                  time_block_id: timeBlockData.id,
                  block_type: resolved.blockType,
                  energy: resolved.energy,
                  allow_all_habit_types: true,
                  allow_all_skills: true,
                  allow_all_monuments: true,
                })
                .select("id")
                .single();
              if (dttbError) {
                console.error(
                  "Failed to link day type time block",
                  dttbError
                );
                return NextResponse.json(
                  { error: "Unable to link time block to day type" },
                  { status: 500 }
                );
              }
              appliedIds.add(timeBlockData.id);
              if (dttbData?.id) {
                appliedIds.add(dttbData.id);
              }
              continue;
            }
            case "SET_DAY_TYPE_ASSIGNMENT": {
              const { data: assignmentData, error: assignmentError } = await supabase
                .from("day_type_assignments")
                .upsert(
                  {
                    user_id: user.id,
                    date_key: resolved.date,
                    day_type_id: resolved.dayTypeId,
                  },
                  { onConflict: "user_id,date_key" }
                )
                .select("id")
                .single();
              if (assignmentError) {
                console.error(
                  "Failed to upsert day type assignment",
                  assignmentError
                );
                return NextResponse.json(
                  { error: "Unable to update day type assignment" },
                  { status: 500 }
                );
              }
              if (assignmentData?.id) {
                appliedIds.add(assignmentData.id);
              } else if (resolved.assignmentId) {
                appliedIds.add(resolved.assignmentId);
              }
              break;
            }
            case "SET_GOAL_PRIORITY_BY_NAME": {
              const { data: goalUpdate, error: goalUpdateError } = await supabase
                .from("goals")
                .update({
                  priority: resolved.afterLabel,
                  priority_code: resolved.afterLabel,
                })
                .eq("id", resolved.goalId)
                .eq("user_id", user.id)
                .select("id")
                .single();
              if (goalUpdateError) {
                console.error("Failed to update goal priority", goalUpdateError);
                return NextResponse.json(
                  { error: "Unable to update goal priority" },
                  { status: 500 }
                );
              }
              if (goalUpdate?.id) {
                appliedIds.add(goalUpdate.id);
              }
              break;
            }
            case "SET_PROJECT_PRIORITY_BY_NAME": {
              const { data: projectUpdate, error: projectUpdateError } = await supabase
                .from("projects")
                .update({ priority: resolved.afterLabel })
                .eq("id", resolved.projectId)
                .eq("user_id", user.id)
                .select("id")
                .single();
              if (projectUpdateError) {
                console.error(
                  "Failed to update project priority",
                  projectUpdateError
                );
                return NextResponse.json(
                  { error: "Unable to update project priority" },
                  { status: 500 }
                );
              }
              if (projectUpdate?.id) {
                appliedIds.add(projectUpdate.id);
              }
              break;
            }
            case "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL": {
              const updates: Record<string, string> = {};
              if (resolved.startUpdate) updates.start_local = resolved.startUpdate;
              if (resolved.endUpdate) updates.end_local = resolved.endUpdate;
              if (!Object.keys(updates).length) {
                continue;
              }
              const { error: blockError } = await supabase
                .from("time_blocks")
                .update(updates)
                .eq("id", resolved.timeBlockId)
                .eq("user_id", user.id);
              if (blockError) {
                console.error("Failed to update time block", blockError);
                return NextResponse.json(
                  { error: "Unable to update time block" },
                  { status: 500 }
                );
              }
              appliedIds.add(resolved.timeBlockId);
              break;
            }
          }
        }

        const appliedResult = {
          type: intent.type,
          ids: Array.from(appliedIds),
        };
        const message = "Scheduler inputs confirmed";
        if (idempotencyKey) {
          await recordAppliedAction(
            supabase,
            user.id,
            idempotencyKey,
            intent.type,
            appliedResult.ids,
            message
          );
        }
        return NextResponse.json({ ok: true, applied: appliedResult, message });
      }
      case "SUGGEST_SCHEDULE_CHANGE": {
        if (isDryRun) {
          return dryRunResponse({
            warnings: [
              "Schedule change suggestions are not stored yet.",
            ],
          });
        }
        return NextResponse.json(
          {
            error:
              "Schedule change suggestions are not stored yet (feature pending)",
          },
          { status: 501 }
        );
      }
      default:
        return NextResponse.json(
          { error: "Unsupported intent type" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("AI apply route error", error);
    return NextResponse.json(
      { error: "Unable to apply intent" },
      { status: 500 }
    );
  }
}
