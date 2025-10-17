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
  skillId: string | null;
  dueDate: string;
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
  skillId: string | null;
  dueDate: string;
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
    skillId = null,
    dueDate = "",
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
    skillId = null,
    dueDate = "",
  } = overrides;

  return { id, name, stage, why, duration, priority, energy, tasks, skillId, dueDate };
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
    due_date?: string | null;
  }
>(task: T): DraftTask {
  return createDraftTask({
    id: task.id,
    name: task.name ?? "",
    stage: task.stage ?? DEFAULT_TASK_STAGE,
    priority: task.priority ?? DEFAULT_PRIORITY,
    energy: task.energy ?? DEFAULT_ENERGY,
    notes: task.notes ?? "",
    skillId: task.skill_id ?? null,
    dueDate: task.due_date ?? "",
  });
}
