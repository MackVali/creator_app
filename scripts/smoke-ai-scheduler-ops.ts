import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

type CountTarget = "goals" | "projects" | "day_type_time_blocks";

function ensureEnv(variable: string | undefined, name: string): string {
  if (!variable) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return variable;
}

async function main() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLIC_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const userEmail = process.env.SMOKE_SCHEDULER_USER_EMAIL;
  const userPassword = process.env.SMOKE_SCHEDULER_USER_PASSWORD;
  const userId = process.env.SMOKE_SCHEDULER_USER_ID;
  const baseUrl =
    (process.env.SMOKE_AI_BASE_URL ?? "http://localhost:3000").replace(
      /\/$/,
      ""
    );

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Missing Supabase URL/keys in environment");
  }
  if (!userEmail || !userPassword || !userId) {
    throw new Error(
      "Please set SMOKE_SCHEDULER_USER_EMAIL, SMOKE_SCHEDULER_USER_PASSWORD, and SMOKE_SCHEDULER_USER_ID"
    );
  }

  const anonClient = createClient(supabaseUrl, anonKey);
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: sessionData, error: signInError } =
    await anonClient.auth.signInWithPassword({
      email: userEmail,
      password: userPassword,
    });
  if (signInError || !sessionData.session?.access_token) {
    throw new Error(
      `Unable to sign-in smoke user: ${signInError?.message ?? "unknown"}`
    );
  }

  const accessToken = sessionData.session.access_token;
  const refreshToken = sessionData.session.refresh_token;
  const cookieHeader = [
    `sb-access-token=${accessToken}`,
    refreshToken ? `sb-refresh-token=${refreshToken}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  const { data: dayType, error: dayTypeError } = await serviceClient
    .from("day_types")
    .select("id,name")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (dayTypeError) {
    throw dayTypeError;
  }

  if (!dayType?.name) {
    throw new Error("Smoke user must have at least one day type");
  }

  const targetDate = new Date().toISOString().split("T")[0];
  const idempotencyKey = `smoke-ai-scheduler-${userId}-${targetDate}`;
  const intent = {
    type: "DRAFT_SCHEDULER_INPUT_OPS" as const,
    ops: [
      {
        type: "SET_DAY_TYPE_ASSIGNMENT" as const,
        date: targetDate,
        day_type_name: dayType.name,
      },
    ],
  };

  const countTable = async (table: CountTarget) => {
    const { count, error } = await serviceClient
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) {
      throw error;
    }
    return count ?? 0;
  };

  const countAssignmentsForDate = async () => {
    const { count, error } = await serviceClient
      .from("day_type_assignments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("date_key", targetDate);
    if (error) {
      throw error;
    }
    return count ?? 0;
  };

  const baseCountsBefore = await Promise.all([
    countTable("goals"),
    countTable("projects"),
    countTable("day_type_time_blocks"),
  ]);
  const assignmentCountBefore = await countAssignmentsForDate();

  const callAiApply = async (body: Record<string, unknown>) => {
    const response = await fetch(`${baseUrl}/api/ai/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
      },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const errorMessage =
        json?.error ??
        (json?.message ? `${json.message}` : "Unknown AI apply failure");
      throw new Error(errorMessage);
    }
    return json;
  };

  console.log("Running dry-run preview...");
  await callAiApply({
    scope: "schedule_edit",
    intent,
    idempotency_key: idempotencyKey,
    dry_run: true,
  });

  console.log("Confirming scheduler intent...");
  const confirmPayload = await callAiApply({
    scope: "schedule_edit",
    intent,
    idempotency_key: idempotencyKey,
  });

  const assignmentCountAfter = await countAssignmentsForDate();
  const baseCountsAfter = await Promise.all([
    countTable("goals"),
    countTable("projects"),
    countTable("day_type_time_blocks"),
  ]);

  if (
    baseCountsBefore[0] !== baseCountsAfter[0] ||
    baseCountsBefore[1] !== baseCountsAfter[1] ||
    baseCountsBefore[2] !== baseCountsAfter[2]
  ) {
    throw new Error(
      "Goals/projects/day_type_time_blocks counts drifted; scheduler oper should only touch day_type_assignments"
    );
  }

  if (assignmentCountAfter <= assignmentCountBefore) {
    throw new Error(
      "Expected day_type_assignments to grow for the target date after confirm"
    );
  }

  const { data: assignments } = await serviceClient
    .from("day_type_assignments")
    .select("id,day_type_id,date_key")
    .eq("user_id", userId)
    .eq("date_key", targetDate);

  console.log("Smoke test succeeded!");
  console.log("Confirmed payload:", confirmPayload);
  console.log("Day type assignment rows for date:", assignments);
}

main().catch((error) => {
  console.error("Smoke script failed:", error);
  process.exit(1);
});
