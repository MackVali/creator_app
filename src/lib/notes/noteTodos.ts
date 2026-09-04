import {
  PRIORITY_ORDER,
  normalizePriority,
  type PriorityBucketId,
} from "@/app/(app)/schedule/priorities/utils";

export const NOTE_TODOS_METADATA_KEY = "noteTodos";
export const NOTE_TODO_MARKER_PREFIX = "creator-note-todo:";
export const NOTE_TODO_DEFAULT_PRIORITY: PriorityBucketId = "MEDIUM";

export type NoteTodoOwnerType = "AREA" | "MONUMENT" | "SKILL" | "GOAL";

export type NoteTodoOwner = {
  type: NoteTodoOwnerType;
  id: string;
};

export type NoteTodo = {
  id: string;
  title: string;
  completed: boolean;
  priority: PriorityBucketId;
  skillId: string | null;
  energy: "MEDIUM";
};

export function buildNoteTodoMarker(todoId: string) {
  return `[Todo](creator-note-todo:${todoId})`;
}

export function parseStandaloneNoteTodoMarker(line: string) {
  const match = line.trim().match(/^\[Todo\]\(creator-note-todo:([^)]+)\)$/);
  const todoId = match?.[1]?.trim();
  return todoId ? { todoId } : null;
}

export function createNoteTodoId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `note-todo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeNoteTodoPriority(value: unknown) {
  if (typeof value !== "string") return NOTE_TODO_DEFAULT_PRIORITY;
  const trimmed = value.trim();
  return PRIORITY_ORDER.includes(trimmed as PriorityBucketId)
    ? normalizePriority(trimmed)
    : NOTE_TODO_DEFAULT_PRIORITY;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readTodo(value: unknown): NoteTodo | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id) return null;
  return {
    id,
    title: typeof value.title === "string" ? value.title : "",
    completed: value.completed === true,
    priority: normalizeNoteTodoPriority(value.priority),
    skillId:
      typeof value.skillId === "string" && value.skillId.trim()
        ? value.skillId.trim()
        : null,
    energy: "MEDIUM",
  };
}

export function readNoteTodos(metadata: Record<string, unknown> | null | undefined) {
  const raw = metadata?.[NOTE_TODOS_METADATA_KEY];
  const values = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? Object.values(raw)
      : [];
  const todos = values
    .map(readTodo)
    .filter((todo): todo is NoteTodo => todo !== null);
  const seen = new Set<string>();
  return todos.filter((todo) => {
    if (seen.has(todo.id)) return false;
    seen.add(todo.id);
    return true;
  });
}

export function writeNoteTodosMetadata(
  metadata: Record<string, unknown> | null | undefined,
  todos: NoteTodo[],
) {
  return {
    ...(metadata ?? {}),
    [NOTE_TODOS_METADATA_KEY]: todos,
  };
}

export function upsertNoteTodo(todos: NoteTodo[], todo: NoteTodo) {
  const index = todos.findIndex((candidate) => candidate.id === todo.id);
  if (index === -1) return [...todos, todo];
  return todos.map((candidate, candidateIndex) =>
    candidateIndex === index ? todo : candidate,
  );
}
