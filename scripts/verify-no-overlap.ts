import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.argv[2] ?? "7972866d-f2fd-48ca-9cda-18ab864b9446";

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase env vars");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("schedule_instances")
    .select("id, source_type, source_id, start_utc, end_utc")
    .eq("user_id", userId)
    .eq("status", "scheduled");

  if (error) {
    console.error("Failed to fetch schedule instances:", error);
    process.exit(1);
  }

  const instances = (data ?? []).map((row) => ({
    ...row,
    startMs: new Date(row.start_utc).getTime(),
    endMs: new Date(row.end_utc).getTime(),
  }));

  let overlaps = [] as Array<{
    a: typeof instances[number];
    b: typeof instances[number];
  }>;

  for (let i = 0; i < instances.length; i += 1) {
    for (let j = i + 1; j < instances.length; j += 1) {
      const a = instances[i];
      const b = instances[j];
      if (Number.isNaN(a.startMs) || Number.isNaN(a.endMs) || Number.isNaN(b.startMs) || Number.isNaN(b.endMs)) {
        continue;
      }
      const overlap = a.endMs > b.startMs && b.endMs > a.startMs;
      if (overlap) {
        overlaps.push({ a, b });
      }
    }
  }

  if (overlaps.length === 0) {
    console.log("No overlapping schedule_instances detected.");
  } else {
    console.log(`Found ${overlaps.length} overlaps:`);
    for (const { a, b } of overlaps) {
      console.log(
        `- ${a.source_type}:${a.source_id} (${a.start_utc} - ${a.end_utc}) overlaps with ${b.source_type}:${b.source_id} (${b.start_utc} - ${b.end_utc})`
      );
    }
  }
}

main().catch((error) => {
  console.error("Verifier failed:", error);
  process.exit(1);
});
