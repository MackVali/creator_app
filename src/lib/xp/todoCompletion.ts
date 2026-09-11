import type { NoteTodo, NoteTodoOwner } from "@/lib/notes/noteTodos";

export const TODO_XP_AMOUNT = 1;

export function buildManualMyListTodoCompletionKey(itemId: string) {
  return `todo:my-list:${itemId}`;
}

export function buildNoteTodoCompletionKey({
  owner,
  todoId,
}: {
  owner: NoteTodoOwner;
  todoId: string;
}) {
  return `todo:note:${owner.type.toLowerCase()}:${owner.id}:${todoId}`;
}

export async function awardNoteTodoCompletionXp({
  owner,
  todo,
  completedAt,
  fetchFn = fetch,
}: {
  owner: NoteTodoOwner;
  todo: NoteTodo;
  completedAt: string;
  fetchFn?: typeof fetch;
}) {
  const completionKey = buildNoteTodoCompletionKey({ owner, todoId: todo.id });
  const body: Record<string, unknown> = {
    kind: "todo",
    amount: TODO_XP_AMOUNT,
    awardKeyBase: completionKey,
    reversible: { occurrenceStem: completionKey },
    source: "note-todo",
    completion: {
      action: "complete",
      sourceType: "TODO",
      sourceId: todo.id,
      completedAt,
      wasScheduled: false,
      completionKey,
      sourceTitle: todo.title.trim() || "Todo",
    },
  };
  if (todo.skillId?.trim()) {
    body.skillIds = [todo.skillId.trim()];
  }

  const response = await fetchFn("/api/xp/award", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`TODO XP award failed (${response.status})`);
  }
  return response.json().catch(() => null);
}

export async function reverseNoteTodoCompletionXp({
  owner,
  todoId,
  fetchFn = fetch,
}: {
  owner: NoteTodoOwner;
  todoId: string;
  fetchFn?: typeof fetch;
}) {
  const completionKey = buildNoteTodoCompletionKey({ owner, todoId });
  const reverseResponse = await fetchFn("/api/xp/reverse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ occurrenceStem: completionKey }),
  });
  if (!reverseResponse.ok) {
    throw new Error(`TODO XP reverse failed (${reverseResponse.status})`);
  }

  const undoResponse = await fetchFn("/api/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "undo",
      sourceType: "TODO",
      sourceId: todoId,
      completionKey,
    }),
  });
  if (!undoResponse.ok) {
    throw new Error(`TODO completion undo failed (${undoResponse.status})`);
  }
}
