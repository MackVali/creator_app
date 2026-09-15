import { getSupabaseBrowser } from "../../../lib/supabase";
import type { Json } from "@/types/supabase";

export const TODO_OWNER_TYPES = [
  "MY_LIST",
  "GOAL",
  "AREA",
  "MONUMENT",
  "SKILL",
] as const;

export type TodoOwnerType = (typeof TODO_OWNER_TYPES)[number];
export type TodoDayBucketId = "morning" | "afternoon" | "evening";

export type Todo = {
  id: string;
  userId: string;
  ownerType: TodoOwnerType;
  ownerId: string | null;
  noteId: string | null;
  listId: string | null;
  title: string;
  completed: boolean;
  completedAt: string | null;
  priorityId: string;
  dayBucketId: TodoDayBucketId | null;
  skillId: string | null;
  energyId: string;
  sortOrder: number;
  insertAfterRowKey: string | null;
  deletedAt: string | null;
  metadata: Json;
  createdAt: string;
  updatedAt: string;
};

export type TodoRow = {
  id: string;
  user_id: string;
  owner_type: TodoOwnerType;
  owner_id: string | null;
  note_id: string | null;
  list_id: string | null;
  title: string;
  completed: boolean;
  completed_at: string | null;
  priority_id: string;
  day_bucket_id: TodoDayBucketId | null;
  skill_id: string | null;
  energy_id: string;
  sort_order: number;
  insert_after_row_key: string | null;
  deleted_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type TodoInsert = {
  id?: string;
  user_id: string;
  owner_type: TodoOwnerType;
  owner_id?: string | null;
  note_id?: string | null;
  list_id?: string | null;
  title: string;
  completed?: boolean;
  completed_at?: string | null;
  priority_id?: string;
  day_bucket_id?: TodoDayBucketId | null;
  skill_id?: string | null;
  energy_id?: string;
  sort_order?: number;
  insert_after_row_key?: string | null;
  metadata?: Json;
};

export type CreateTodoInput = {
  id?: string;
  userId: string;
  ownerType: TodoOwnerType;
  ownerId?: string | null;
  noteId?: string | null;
  listId?: string | null;
  title: string;
  completed?: boolean;
  completedAt?: string | null;
  priorityId?: string;
  dayBucketId?: TodoDayBucketId | null;
  skillId?: string | null;
  energyId?: string;
  sortOrder?: number;
  insertAfterRowKey?: string | null;
  metadata?: Json;
};

export type UpdateTodoInput = {
  title?: string;
  completed?: boolean;
  completedAt?: string | null;
  priorityId?: string;
  dayBucketId?: TodoDayBucketId | null;
  skillId?: string | null;
  energyId?: string;
  sortOrder?: number;
  insertAfterRowKey?: string | null;
  metadata?: Json;
};

type TodoUpdate = Partial<
  Pick<
    TodoRow,
    | "title"
    | "completed"
    | "completed_at"
    | "priority_id"
    | "day_bucket_id"
    | "skill_id"
    | "energy_id"
    | "sort_order"
    | "insert_after_row_key"
    | "deleted_at"
    | "metadata"
    | "updated_at"
  >
>;

type QueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type TodoQueryBuilder<T> = PromiseLike<QueryResult<T>> & {
  select(columns?: string): TodoQueryBuilder<T>;
  insert(values: TodoInsert): TodoQueryBuilder<TodoRow>;
  update(values: TodoUpdate): TodoQueryBuilder<TodoRow>;
  eq(column: string, value: unknown): TodoQueryBuilder<T>;
  is(column: string, value: null): TodoQueryBuilder<T>;
  order(column: string, options?: Record<string, unknown>): TodoQueryBuilder<T>;
  maybeSingle(): Promise<QueryResult<T extends Array<infer U> ? U : T>>;
};

export type TodosStorageClient = {
  from(table: "todos"): TodoQueryBuilder<TodoRow[]>;
};

const TODO_COLUMNS = [
  "id",
  "user_id",
  "owner_type",
  "owner_id",
  "note_id",
  "list_id",
  "title",
  "completed",
  "completed_at",
  "priority_id",
  "day_bucket_id",
  "skill_id",
  "energy_id",
  "sort_order",
  "insert_after_row_key",
  "deleted_at",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

function getClient(client?: TodosStorageClient) {
  if (client) return client;
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase client is not available");
  return supabase as unknown as TodosStorageClient;
}

function nowIso() {
  return new Date().toISOString();
}

export function todoRowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    userId: row.user_id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    noteId: row.note_id,
    listId: row.list_id,
    title: row.title,
    completed: row.completed,
    completedAt: row.completed_at,
    priorityId: row.priority_id,
    dayBucketId: row.day_bucket_id,
    skillId: row.skill_id,
    energyId: row.energy_id,
    sortOrder: row.sort_order,
    insertAfterRowKey: row.insert_after_row_key,
    deletedAt: row.deleted_at,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createInputToInsert(input: CreateTodoInput): TodoInsert {
  return {
    id: input.id,
    user_id: input.userId,
    owner_type: input.ownerType,
    owner_id: input.ownerId ?? null,
    note_id: input.noteId ?? null,
    list_id: input.listId ?? null,
    title: input.title,
    completed: input.completed ?? false,
    completed_at: input.completedAt ?? null,
    priority_id: input.priorityId ?? "MEDIUM",
    day_bucket_id: input.dayBucketId ?? null,
    skill_id: input.skillId ?? null,
    energy_id: input.energyId ?? "MEDIUM",
    sort_order: input.sortOrder ?? 0,
    insert_after_row_key: input.insertAfterRowKey ?? null,
    metadata: input.metadata ?? {},
  };
}

function updateInputToRow(input: UpdateTodoInput): TodoUpdate {
  const update: TodoUpdate = {
    updated_at: nowIso(),
  };

  if (input.title !== undefined) update.title = input.title;
  if (input.completed !== undefined) update.completed = input.completed;
  if (input.completedAt !== undefined) update.completed_at = input.completedAt;
  if (input.priorityId !== undefined) update.priority_id = input.priorityId;
  if (input.dayBucketId !== undefined) update.day_bucket_id = input.dayBucketId;
  if (input.skillId !== undefined) update.skill_id = input.skillId;
  if (input.energyId !== undefined) update.energy_id = input.energyId;
  if (input.sortOrder !== undefined) update.sort_order = input.sortOrder;
  if (input.insertAfterRowKey !== undefined) {
    update.insert_after_row_key = input.insertAfterRowKey;
  }
  if (input.metadata !== undefined) update.metadata = input.metadata;

  return update;
}

function throwIfError(error: QueryResult<unknown>["error"]) {
  if (error) throw error;
}

export async function loadTodos(input: {
  client?: TodosStorageClient;
  userId: string;
  ownerType?: TodoOwnerType;
  ownerId?: string | null;
  listId?: string | null;
  noteId?: string | null;
  includeDeleted?: boolean;
}) {
  const client = getClient(input.client);
  let query = client
    .from("todos")
    .select(TODO_COLUMNS)
    .eq("user_id", input.userId)
    .order("sort_order", { ascending: true });

  if (!input.includeDeleted) query = query.is("deleted_at", null);
  if (input.ownerType) query = query.eq("owner_type", input.ownerType);
  if (input.ownerId !== undefined) {
    query =
      input.ownerId === null
        ? query.is("owner_id", null)
        : query.eq("owner_id", input.ownerId);
  }
  if (input.listId !== undefined) {
    query =
      input.listId === null
        ? query.is("list_id", null)
        : query.eq("list_id", input.listId);
  }
  if (input.noteId !== undefined) {
    query =
      input.noteId === null
        ? query.is("note_id", null)
        : query.eq("note_id", input.noteId);
  }

  const { data, error } = await query;
  throwIfError(error);
  return (data ?? []).map(todoRowToTodo);
}

export async function getTodo(input: {
  client?: TodosStorageClient;
  userId: string;
  id: string;
  includeDeleted?: boolean;
}) {
  const client = getClient(input.client);
  let query = client
    .from("todos")
    .select(TODO_COLUMNS)
    .eq("user_id", input.userId)
    .eq("id", input.id);

  if (!input.includeDeleted) query = query.is("deleted_at", null);

  const { data, error } = await query.maybeSingle();
  throwIfError(error);
  return data ? todoRowToTodo(data) : null;
}

export async function createTodo(input: CreateTodoInput & {
  client?: TodosStorageClient;
}) {
  const client = getClient(input.client);
  const { data, error } = await client
    .from("todos")
    .insert(createInputToInsert(input))
    .select(TODO_COLUMNS)
    .maybeSingle();

  throwIfError(error);
  if (!data) throw new Error("Todo insert returned no row");
  return todoRowToTodo(data);
}

export async function updateTodo(input: {
  client?: TodosStorageClient;
  userId: string;
  id: string;
  updates: UpdateTodoInput;
}) {
  const client = getClient(input.client);
  const { data, error } = await client
    .from("todos")
    .update(updateInputToRow(input.updates))
    .eq("user_id", input.userId)
    .eq("id", input.id)
    .is("deleted_at", null)
    .select(TODO_COLUMNS)
    .maybeSingle();

  throwIfError(error);
  return data ? todoRowToTodo(data) : null;
}

export function setTodoCompleted(input: {
  client?: TodosStorageClient;
  userId: string;
  id: string;
  completed: boolean;
  completedAt?: string | null;
}) {
  return updateTodo({
    client: input.client,
    userId: input.userId,
    id: input.id,
    updates: {
      completed: input.completed,
      completedAt:
        input.completedAt === undefined
          ? input.completed
            ? nowIso()
            : null
          : input.completedAt,
    },
  });
}

export async function softDeleteTodo(input: {
  client?: TodosStorageClient;
  userId: string;
  id: string;
}) {
  const client = getClient(input.client);
  const timestamp = nowIso();
  const { data, error } = await client
    .from("todos")
    .update({
      deleted_at: timestamp,
      updated_at: timestamp,
    })
    .eq("user_id", input.userId)
    .eq("id", input.id)
    .is("deleted_at", null)
    .select(TODO_COLUMNS)
    .maybeSingle();

  throwIfError(error);
  return data ? todoRowToTodo(data) : null;
}
