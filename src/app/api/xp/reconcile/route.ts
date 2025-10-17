import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Database } from "@/types/supabase";

type ReconcileResult = Database["public"]["Functions"]["reconcile_dark_xp_for_user"]["Returns"];

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client unavailable" },
      { status: 500 }
    );
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc<ReconcileResult>(
    "reconcile_dark_xp_for_user",
    {}
  );

  if (error) {
    console.error("Failed to reconcile dark XP", error);
    return NextResponse.json(
      { error: "Failed to reconcile dark XP" },
      { status: 500 }
    );
  }

  const adjustments: ReconcileResult = data ?? [];
  const totalDelta = adjustments.reduce((sum, item) => sum + (item?.delta ?? 0), 0);

  return NextResponse.json({ success: true, adjustments, totalDelta });
}
