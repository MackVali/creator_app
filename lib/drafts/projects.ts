export const DEFAULT_PRIORITY = "NO";
export const DEFAULT_ENERGY = "NO";
export const DEFAULT_PROJECT_STAGE = "RESEARCH";
export const DEFAULT_TASK_STAGE = "PREPARE";

export interface DraftTask {
  id: string;
  name: string;
  stage: string;
  priority: string;
  energy: string;
  notes: string;
  skillId: string;
  dueDate: string | null;
}

export interface DraftProject {
  id: string;
  name: string;
  stage: string;
  why: string;
  duration: string;
  priority: string;
  energy: string;
  tasks: DraftTask[];
  skillIds: string[];
  dueDate: string | null;
}

const generateId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export function createDraftTask(
  overrides: Partial<Omit<DraftTask, "id">> & { id?: string } = {}
): DraftTask {
  const {
    id = generateId(),
    name = "",
    stage = DEFAULT_TASK_STAGE,
    priority = DEFAULT_PRIORITY,
    energy = DEFAULT_ENERGY,
    notes = "",
    skillId = "",
    dueDate = null,
  } = overrides;

  return { id, name, stage, priority, energy, notes, skillId, dueDate };
}

export function createDraftProject(
  overrides: Partial<Omit<DraftProject, "id" | "tasks">> & {
    id?: string;
    tasks?: DraftTask[];
  } = {}
): DraftProject {
  const {
    id = generateId(),
    name = "",
    stage = DEFAULT_PROJECT_STAGE,
    why = "",
    duration = "",
    priority = DEFAULT_PRIORITY,
    energy = DEFAULT_ENERGY,
    tasks = [createDraftTask()],
    skillIds = [],
    dueDate = null,
  } = overrides;

  return { id, name, stage, why, duration, priority, energy, tasks, skillIds, dueDate };
}

export function normalizeTask<
  T extends {
    id: string;
    name?: string | null;
    stage?: string | null;
    priority?: string | null;
    energy?: string | null;
    notes?: string | null;
    skill_id?: string | null;
    skillId?: string | null;
    due_date?: string | null;
    dueDate?: string | null;
  }
>(task: T): DraftTask {
  const dueDate = task.dueDate ?? task.due_date ?? null;
  return createDraftTask({
    id: task.id,
    name: task.name ?? "",
    stage: task.stage ?? DEFAULT_TASK_STAGE,
    priority: task.priority ?? DEFAULT_PRIORITY,
    energy: task.energy ?? DEFAULT_ENERGY,
    notes: task.notes ?? "",
    skillId: task.skill_id ?? task.skillId ?? "",
    dueDate,
  });
}
