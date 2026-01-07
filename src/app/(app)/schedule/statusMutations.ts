import type { ScheduleInstance } from "@/lib/scheduler/instanceRepo";

export type StatusTarget = {
  id: string;
  status: "completed" | "scheduled";
  completedAt?: string | null;
};

function targetLookup(targets: StatusTarget[]) {
  const map = new Map<string, StatusTarget>();
  targets.forEach((target) => {
    map.set(target.id, target);
  });
  return map;
}

export function applyStatusTargets(
  instances: ScheduleInstance[],
  targets: StatusTarget[]
): ScheduleInstance[] {
  if (targets.length === 0) return instances;
  const lookup = targetLookup(targets);
  return instances.map((instance) => {
    const target = lookup.get(instance.id);
    if (!target) return instance;
    const completedAt =
      target.status === "completed"
        ? target.completedAt ?? instance.completed_at ?? new Date().toISOString()
        : null;
    return {
      ...instance,
      status: target.status,
      completed_at: completedAt,
    };
  });
}

export async function runStatusMutation({
  instances,
  targets,
  mutate,
}: {
  instances: ScheduleInstance[];
  targets: StatusTarget[];
  mutate: () => Promise<{ ok: boolean }>;
}) {
  const optimistic = applyStatusTargets(instances, targets);
  const result = await mutate();
  if (!result.ok) {
    return { instances, ok: false };
  }
  return { instances: optimistic, ok: true };
}
