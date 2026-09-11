import {
  formatDateKeyInTimeZone,
  startOfDayInTimeZone,
  weekdayInTimeZone,
} from "@/lib/scheduler/timezone";

export type DependencyType = "ITEM" | "DATE" | "WEEKDAY";
export type DependencySourceType = "GOAL" | "PROJECT" | "TASK" | "HABIT";

export type DependencyRecord = {
  id: string;
  user_id: string;
  source_type: DependencySourceType;
  source_id: string;
  dependency_type: DependencyType;
  depends_on_id: string | null;
  not_before_date: string | null;
  weekdays: number[] | null;
  created_at: string;
};

export type DependencyFailure =
  | {
      dependencyId: string;
      type: "ITEM";
      waitingForId: string;
    }
  | {
      dependencyId: string;
      type: "DATE";
      availableDate: string;
    }
  | {
      dependencyId: string;
      type: "WEEKDAY";
      allowedWeekdays: number[];
    };

export type DependencyEvaluation = {
  eligible: boolean;
  failures: DependencyFailure[];
};

type DependencyClientLike = unknown;
type DependencyClient = {
  from: (table: string) => DependencyQueryBuilder;
};
type DependencyQueryBuilder = PromiseLike<{
  data: unknown;
  error: { message?: string; code?: string } | null;
}> & {
  select: (columns: string) => DependencyQueryBuilder;
  eq: (column: string, value: unknown) => DependencyQueryBuilder;
  in: (column: string, values: unknown[]) => DependencyQueryBuilder;
  insert: (value: unknown) => DependencyQueryBuilder;
  delete: () => DependencyQueryBuilder;
  single: () => DependencyQueryBuilder;
};

export type DependencyCompletionLookup = (
  dependency: DependencyRecord
) => boolean;

export function groupDependenciesBySource(
  dependencies: DependencyRecord[]
): Map<string, DependencyRecord[]> {
  const grouped = new Map<string, DependencyRecord[]>();
  for (const dependency of dependencies) {
    const key = dependencySourceKey(
      dependency.source_type,
      dependency.source_id
    );
    const existing = grouped.get(key);
    if (existing) {
      existing.push(dependency);
    } else {
      grouped.set(key, [dependency]);
    }
  }
  return grouped;
}

export function dependencySourceKey(
  sourceType: DependencySourceType,
  sourceId: string
) {
  return `${sourceType}:${sourceId}`;
}

export async function fetchDependenciesForSources(
  client: DependencyClientLike,
  userId: string,
  sources: Array<{ sourceType: DependencySourceType; sourceId: string }>
): Promise<DependencyRecord[]> {
  const sourceTypes = Array.from(new Set(sources.map((source) => source.sourceType)));
  const sourceIds = Array.from(new Set(sources.map((source) => source.sourceId)));
  if (!userId || sourceTypes.length === 0 || sourceIds.length === 0) return [];

  const dependencyClient = client as DependencyClient;
  const { data, error } = await dependencyClient
    .from("item_dependencies")
    .select(
      "id,user_id,source_type,source_id,dependency_type,depends_on_id,not_before_date,weekdays,created_at"
    )
    .eq("user_id", userId)
    .in("source_type", sourceTypes)
    .in("source_id", sourceIds);

  if (error) throw error;

  return ((data ?? []) as unknown as DependencyRecord[]).filter((dependency) =>
    sources.some(
      (source) =>
        source.sourceType === dependency.source_type &&
        source.sourceId === dependency.source_id
    )
  );
}

export async function createDependency(
  client: DependencyClientLike,
  input: {
    userId: string;
    sourceType: DependencySourceType;
    sourceId: string;
    dependencyType: DependencyType;
    dependsOnId?: string | null;
    notBeforeDate?: string | null;
    weekdays?: number[] | null;
  }
): Promise<DependencyRecord> {
  const dependencyClient = client as DependencyClient;
  const { data, error } = await dependencyClient
    .from("item_dependencies")
    .insert({
      user_id: input.userId,
      source_type: input.sourceType,
      source_id: input.sourceId,
      dependency_type: input.dependencyType,
      depends_on_id: input.dependsOnId ?? null,
      not_before_date: input.notBeforeDate ?? null,
      weekdays: input.weekdays ?? null,
    })
    .select(
      "id,user_id,source_type,source_id,dependency_type,depends_on_id,not_before_date,weekdays,created_at"
    )
    .single();

  if (error) throw normalizeDependencyWriteError(error);
  return data as unknown as DependencyRecord;
}

export async function deleteDependency(
  client: DependencyClientLike,
  dependencyId: string
) {
  const dependencyClient = client as DependencyClient;
  const { error } = await dependencyClient
    .from("item_dependencies")
    .delete()
    .eq("id", dependencyId);
  if (error) throw error;
}

export function evaluateDependencies(params: {
  dependencies: DependencyRecord[];
  targetDate: Date;
  timeZone: string;
  isItemDependencySatisfied: DependencyCompletionLookup;
}): DependencyEvaluation {
  const failures: DependencyFailure[] = [];
  const targetDay = startOfDayInTimeZone(params.targetDate, params.timeZone);
  const targetDateKey = formatDateKeyInTimeZone(targetDay, params.timeZone);
  const targetWeekday = weekdayInTimeZone(targetDay, params.timeZone);

  for (const dependency of params.dependencies) {
    if (dependency.dependency_type === "ITEM") {
      const waitingForId = dependency.depends_on_id;
      if (!waitingForId) continue;
      if (!params.isItemDependencySatisfied(dependency)) {
        failures.push({
          dependencyId: dependency.id,
          type: "ITEM",
          waitingForId,
        });
      }
      continue;
    }

    if (dependency.dependency_type === "DATE") {
      const availableDate = dependency.not_before_date;
      if (!availableDate) continue;
      if (targetDateKey < availableDate) {
        failures.push({
          dependencyId: dependency.id,
          type: "DATE",
          availableDate,
        });
      }
      continue;
    }

    if (dependency.dependency_type === "WEEKDAY") {
      const allowedWeekdays = dependency.weekdays ?? [];
      if (!allowedWeekdays.includes(targetWeekday)) {
        failures.push({
          dependencyId: dependency.id,
          type: "WEEKDAY",
          allowedWeekdays,
        });
      }
    }
  }

  return { eligible: failures.length === 0, failures };
}

export function wouldCreateItemDependencyCycle(
  edges: Array<{ sourceId: string; dependsOnId: string }>,
  nextEdge: { sourceId: string; dependsOnId: string }
) {
  if (nextEdge.sourceId === nextEdge.dependsOnId) return true;
  const outgoing = new Map<string, string[]>();
  for (const edge of [...edges, nextEdge]) {
    const list = outgoing.get(edge.sourceId);
    if (list) {
      list.push(edge.dependsOnId);
    } else {
      outgoing.set(edge.sourceId, [edge.dependsOnId]);
    }
  }

  const stack = [...(outgoing.get(nextEdge.dependsOnId) ?? [])];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    if (id === nextEdge.sourceId) return true;
    seen.add(id);
    stack.push(...(outgoing.get(id) ?? []));
  }
  return false;
}

function normalizeDependencyWriteError(error: unknown): Error {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.toLowerCase().includes("cycle")
  ) {
    return new Error("Dependency would create a cycle.");
  }
  return error instanceof Error ? error : new Error("Unable to save Dependency.");
}
