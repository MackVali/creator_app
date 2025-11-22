import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { markMissedAndQueue, scheduleBacklog } from "@/lib/scheduler/reschedule";

dotenv.config({ path: ".env.local" });

async function main() {
  const userId = process.argv[2] ?? "7972866d-f2fd-48ca-9cda-18ab864b9446";
  const writeThroughDaysArgRaw =
    process.argv[3] !== undefined ? Number.parseInt(process.argv[3], 10) : null;
  const writeThroughDaysArg =
    writeThroughDaysArgRaw !== null && Number.isFinite(writeThroughDaysArgRaw)
      ? writeThroughDaysArgRaw
      : null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase environment variables");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date();
  const utcOffsetMinutes = -now.getTimezoneOffset();

  let userTimeZone: string | null = null;
  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profileError && profile?.timezone && typeof profile.timezone === "string") {
      const trimmed = profile.timezone.trim();
      if (trimmed) {
        userTimeZone = trimmed;
      }
    }
  } catch (error) {
    console.warn("Failed to read profile timezone", error);
  }

  console.log(`Running scheduler for user ${userId} at ${now.toISOString()}`);
  const markResult = await markMissedAndQueue(userId, now, supabase);
  console.log("Marked result:", markResult);

  try {
    const scheduleResult = await scheduleBacklog(userId, now, supabase, {
      mode: { type: "REGULAR" },
      writeThroughDays: writeThroughDaysArg,
      timeZone: userTimeZone,
      utcOffsetMinutes,
    });

    console.log(JSON.stringify(scheduleResult, null, 2));
  } catch (error) {
    console.error("Scheduler run failed:", error);
    // Attempt to unwrap causes for fetch failures
    const cause = (error as any)?.cause;
    if (cause) {
      console.error("Cause:", cause);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
