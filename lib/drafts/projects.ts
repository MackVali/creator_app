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
  } = overrides;

  return { id, name, stage, priority, energy, notes };
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
    tasks = [],
  } = overrides;

  const normalizedTasks = tasks.length > 0 ? [...tasks] : [];

  return {
    id,
    name,
    stage,
    why,
    duration,
    priority,
    energy,
    tasks: normalizedTasks,
  };
}

export function normalizeTask<
  T extends {
    id: string;
    name?: string | null;
    stage?: string | null;
    priority?: string | null;
    energy?: string | null;
    notes?: string | null;
  }
>(task: T): DraftTask {
  return createDraftTask({
    id: task.id,
    name: task.name ?? "",
    stage: task.stage ?? DEFAULT_TASK_STAGE,
    priority: task.priority ?? DEFAULT_PRIORITY,
    energy: task.energy ?? DEFAULT_ENERGY,
    notes: task.notes ?? "",
  });
}
