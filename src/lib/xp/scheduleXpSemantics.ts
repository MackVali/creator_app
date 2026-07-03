import type { Json } from "@/types/supabase";

export type ScheduleXpKind = "task" | "habit" | "project" | "goal";
export type CompletionXpSourceType = "TASK" | "HABIT" | "PROJECT" | "GOAL";
export type ScheduleXpSourceType =
  | CompletionXpSourceType
  | "EVENT"
  | string
  | null
  | undefined;

export type ScheduleXpSemanticsInput = {
  id?: string | null;
  source_type?: ScheduleXpSourceType;
  source_id?: string | null;
  event_name?: string | null;
  metadata?: Json | null;
};

export type ScheduleXpCompletionSemantics = {
  completionSourceType: CompletionXpSourceType;
  completionSourceId: string;
  xpKind: ScheduleXpKind;
  isMyListEventBacked: boolean;
  originalScheduleSourceType: string | null;
  originalScheduleSourceId: string | null;
  auditMetadata: Record<string, string | boolean | null>;
  legacyOccurrenceStems: string[];
};

const MY_LIST_SCHEDULE_PRESENTATION_KIND = "project-schedule-card";

const NORMAL_SOURCE_KIND: Record<
  CompletionXpSourceType,
  { completionSourceType: CompletionXpSourceType; xpKind: ScheduleXpKind }
> = {
  PROJECT: { completionSourceType: "PROJECT", xpKind: "project" },
  TASK: { completionSourceType: "TASK", xpKind: "task" },
  HABIT: { completionSourceType: "HABIT", xpKind: "habit" },
  GOAL: { completionSourceType: "GOAL", xpKind: "goal" },
};

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeSourceType(value: ScheduleXpSourceType) {
  return normalizeString(value)?.toUpperCase() ?? null;
}

function readMetadataRecord(metadata: Json | null | undefined) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : null;
}

function readMetadataString(metadata: Json | null | undefined, key: string) {
  const value = readMetadataRecord(metadata)?.[key];
  return normalizeString(value);
}

function hasMyListRowMarker(metadata: Json | null | undefined) {
  const rowType =
    readMetadataString(metadata, "rowType") ??
    readMetadataString(metadata, "row_type");
  const rowId =
    readMetadataString(metadata, "rowId") ??
    readMetadataString(metadata, "row_id");
  return (
    (rowType === "manual" || rowType === "task") &&
    typeof rowId === "string" &&
    rowId.length > 0
  );
}

export function isMyListEventBackedScheduleInstance(
  instance: ScheduleXpSemanticsInput | null | undefined
) {
  if (!instance) return false;
  if (normalizeSourceType(instance.source_type) !== "EVENT") return false;
  const metadata = instance.metadata;
  if (readMetadataString(metadata, "source") === "my-list") return true;
  const presentationKind =
    readMetadataString(metadata, "presentationKind") ??
    readMetadataString(metadata, "presentation_kind") ??
    readMetadataString(metadata, "visualKind") ??
    readMetadataString(metadata, "visual_kind");
  return (
    presentationKind === MY_LIST_SCHEDULE_PRESENTATION_KIND &&
    hasMyListRowMarker(metadata)
  );
}

function resolveMyListTaskSourceId(
  instance: ScheduleXpSemanticsInput
) {
  const metadata = instance.metadata;
  const taskId =
    readMetadataString(metadata, "taskId") ??
    readMetadataString(metadata, "task_id");
  if (taskId) return taskId;

  const rowType =
    readMetadataString(metadata, "rowType") ??
    readMetadataString(metadata, "row_type");
  if (rowType === "task") {
    return (
      readMetadataString(metadata, "rowId") ??
      readMetadataString(metadata, "row_id")
    );
  }

  return null;
}

export function buildScheduleXpOccurrenceStem(
  instanceId: string,
  kind: ScheduleXpKind
) {
  return `sched:${instanceId}:${kind}`;
}

export function resolveScheduleXpCompletionSemantics(
  instance: ScheduleXpSemanticsInput | null | undefined
): ScheduleXpCompletionSemantics | null {
  if (!instance) return null;

  const sourceType = normalizeSourceType(instance.source_type);
  const sourceId = normalizeString(instance.source_id);

  if (
    sourceType === "PROJECT" ||
    sourceType === "TASK" ||
    sourceType === "HABIT" ||
    sourceType === "GOAL"
  ) {
    if (!sourceId) return null;
    return {
      ...NORMAL_SOURCE_KIND[sourceType],
      completionSourceId: sourceId,
      isMyListEventBacked: false,
      originalScheduleSourceType: sourceType,
      originalScheduleSourceId: sourceId,
      auditMetadata: {},
      legacyOccurrenceStems: [],
    };
  }

  if (sourceType !== "EVENT" || !isMyListEventBackedScheduleInstance(instance)) {
    return null;
  }

  const completionSourceId =
    resolveMyListTaskSourceId(instance) ?? normalizeString(instance.id);
  if (!completionSourceId) return null;

  const metadata = instance.metadata;
  return {
    completionSourceType: "TASK",
    completionSourceId,
    xpKind: "task",
    isMyListEventBacked: true,
    originalScheduleSourceType: "EVENT",
    originalScheduleSourceId: sourceId,
    auditMetadata: {
      originalScheduleSourceType: "EVENT",
      originalScheduleSourceId: sourceId,
      scheduleInstanceId: normalizeString(instance.id),
      myListSource: true,
      title:
        normalizeString(instance.event_name) ??
        readMetadataString(metadata, "title") ??
        readMetadataString(metadata, "name"),
      skillId:
        readMetadataString(metadata, "skillId") ??
        readMetadataString(metadata, "skill_id"),
      priority:
        readMetadataString(metadata, "priority") ??
        readMetadataString(metadata, "priorityId") ??
        readMetadataString(metadata, "priority_id"),
      energy:
        readMetadataString(metadata, "energy") ??
        readMetadataString(metadata, "energy_resolved"),
    },
    legacyOccurrenceStems: sourceId ? [`event:${sourceId}`] : [],
  };
}
