import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function requirePlus(): Promise<NextResponse | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: entitlement, error } = await supabase
    .from("user_entitlements")
    .select("tier, is_active, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "CREATOR PLUS required" },
      { status: 403 }
    );
  }

  const tier = (entitlement?.tier ?? "").trim().toUpperCase();
  const isActive = entitlement?.is_active === true;

  if (tier === "ADMIN") {
    return null;
  }

  if (tier === "CREATOR PLUS" && isActive) {
    return null;
  }

  return NextResponse.json(
    { error: "CREATOR PLUS required" },
    { status: 403 }
  );
}
