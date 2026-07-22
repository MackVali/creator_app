import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Json } from "@/types/supabase";

type Context = { params: Promise<{ id: string }> };
type RpcResult = { data: Record<string, unknown> | string | null; error: { code?: string } | null };
type RpcClient = { rpc(name: string, args: Record<string, Json>): Promise<RpcResult> };

export async function POST(_request: NextRequest, context: Context) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase client not initialized" }, { status: 500 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await context.params;
  const client = supabase as unknown as RpcClient;

  const { data, error } = await client.rpc("log_meal_plan_item", { p_item_id: id, p_occurred_at: new Date().toISOString() });
  if (error || !data || typeof data === "string") {
    const status = error?.code === "P0002" ? 404 : error?.code === "55000" ? 409 : error?.code === "22023" ? 400 : 500;
    return NextResponse.json({ error: status === 400 ? "This planned item cannot be logged" : status === 409 ? "Planned item is not available to log" : status === 404 ? "Planned item not found" : "Unable to log planned item" }, { status });
  }
  const mealId = typeof data.meal_id === "string" ? data.meal_id : null;
  if (!mealId) return NextResponse.json({ error: "Unable to log planned item" }, { status: 500 });

  const alreadyLogged = data.already_logged === true;
  const retryRequired = data.retry_required === true;
  const initialResult = data.result === "logged" ? "logged" : "partially_logged";
  if (alreadyLogged) {
    return NextResponse.json({ mealId, result: "already_logged", alreadyLogged: true, groceryDepletionPending: false });
  }
  if (!retryRequired) {
    return NextResponse.json({ mealId, result: initialResult, alreadyLogged: false, groceryDepletionPending: false });
  }

  // The row-locked RPC skips completed components and retries only durable
  // pending/failed work. A stored meal id is never recreated here.
  const { data: depletionData, error: depletionError } = await client.rpc("deplete_logged_meal_plan_item", { p_item_id: id });
  const isRetry = data.initial_log !== true;
  const completed = !depletionError && (depletionData === "completed" || depletionData === "already_completed");
  const result = completed
    ? (isRetry ? "retry_completed" : "logged")
    : (isRetry ? "retry_incomplete" : "partially_logged");
  return NextResponse.json({
    mealId,
    result,
    alreadyLogged: false,
    groceryDepletionPending: !completed,
    ...(!completed ? { message: "Some Grocery items could not be updated. Retry the remaining items." } : {}),
  }, { status: completed ? 200 : 202 });
}
