import DashboardClient from "./DashboardClient";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase";
import { type Monument } from "@/components/monuments/MonumentsList";

export default async function DashboardPage() {
  const cookieStore = cookies();
  const supabase = getSupabaseServer(cookieStore);

  let monuments: Monument[] = [];

  if (supabase) {
    const { data, error } = await supabase
      .from("monuments")
      .select("id,title,emoji")
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      console.error("Failed to load dashboard monuments", error);
    }

    monuments = data ?? [];
  }

  return <DashboardClient monuments={monuments} />;
}
