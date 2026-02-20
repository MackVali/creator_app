import type { SupabaseClient } from "@supabase/supabase-js";

export type AiMonthlyUsageRow = {
  user_id: string;
  month_start: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  updated_at: string;
};

type AiMonthlyUsageRecord = Record<string, unknown> & {
  user_id?: string;
  month_start?: string;
  model?: string;
  input_tokens?: number | string;
  output_tokens?: number | string;
  cost_usd?: number | string;
  updated_at?: string;
};

const mapRow = (row: AiMonthlyUsageRecord | null): AiMonthlyUsageRow | null => {
  if (!row) return null;
  const inputTokens = typeof row.input_tokens === "number"
    ? row.input_tokens
    : Number(row.input_tokens ?? 0);
  const outputTokens = typeof row.output_tokens === "number"
    ? row.output_tokens
    : Number(row.output_tokens ?? 0);
  const costUsd = typeof row.cost_usd === "number"
    ? row.cost_usd
    : Number(row.cost_usd ?? 0);
  return {
    user_id: String(row.user_id ?? ""),
    month_start: String(row.month_start ?? ""),
    model: String(row.model ?? ""),
    input_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    output_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    cost_usd: Number.isFinite(costUsd) ? costUsd : 0,
    updated_at: String(row.updated_at ?? ""),
  };
};

export const getAiMonthStart = (date: Date): string => {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return start.toISOString().split("T")[0];
};

export async function recordAiMonthlyUsage(args: {
  supabase: SupabaseClient;
  userId: string;
  monthStart: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}): Promise<AiMonthlyUsageRow | null> {
  const { supabase, userId, monthStart, model, inputTokens, outputTokens, costUsd } = args;
  const result = await supabase.rpc("increment_ai_monthly_usage", {
    p_user_id: userId,
    p_month_start: monthStart,
    p_model: model,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cost_usd: costUsd,
  });
  if (result.error) {
    console.error("AI monthly usage upsert failed", result.error);
    return null;
  }
  const data = result.data;
  const record = Array.isArray(data)
    ? data[0]
    : (data as AiMonthlyUsageRecord | null);
  return mapRow(record ?? null);
}

export async function fetchAiMonthlyUsage(args: {
  supabase: SupabaseClient;
  userId: string;
  monthStart: string;
  model: string;
}): Promise<AiMonthlyUsageRow | null> {
  const { supabase, userId, monthStart, model } = args;
  const { data, error } = await supabase
    .from("ai_monthly_usage")
    .select("*")
    .eq("user_id", userId)
    .eq("month_start", monthStart)
    .eq("model", model)
    .maybeSingle();
  if (error) {
    console.error("AI monthly usage fetch failed", error);
    return null;
  }
  return mapRow((data as AiMonthlyUsageRecord | null) ?? null);
}
