import { getSupabaseBrowser } from "../../../lib/supabase";

export const MY_LIST_NAME_MAX_LENGTH = 80;

export type MyListList = {
  id: string;
  userId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type MyListListRow = {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type Result = {
  data: MyListListRow[] | null;
  error: { message?: string } | null;
};
type Query = PromiseLike<Result> & {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  order(column: string, options?: Record<string, unknown>): Query;
  insert(value: Partial<MyListListRow>): Query;
};
type Client = { from(table: "my_list_lists"): Query };

function client(): Client {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase client not available");
  return supabase as unknown as Client;
}

function fromRow(row: MyListListRow): MyListList {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadMyListLists(userId: string): Promise<MyListList[]> {
  const { data, error } = await client()
    .from("my_list_lists")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function createMyListList({
  userId,
  name,
}: {
  userId: string;
  name: string;
}): Promise<MyListList> {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("List name cannot be empty.");
  if (normalizedName.length > MY_LIST_NAME_MAX_LENGTH) {
    throw new Error(
      `List name cannot exceed ${MY_LIST_NAME_MAX_LENGTH} characters.`,
    );
  }

  const { data, error } = await client()
    .from("my_list_lists")
    .insert({ user_id: userId, name: normalizedName })
    .select("*");
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("List creation returned no row.");
  return fromRow(row);
}
