import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";

type RequirePlusOptions = {
  accessToken?: string | null;
};

type EntitlementRow = {
  tier: string | null;
  is_active: boolean | null;
  current_period_end: string | null;
};

export async function requirePlus(
  options?: RequirePlusOptions
): Promise<NextResponse | null> {
  const supabase = await createSupabaseServerClient({
    accessToken: options?.accessToken ?? null,
  });

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser(options?.accessToken ?? undefined);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_entitlements")
    .select("tier, is_active, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "CREATOR Pro required" },
      { status: 403 }
    );
  }

  const entitlement = data as EntitlementRow | null;
  const tier = (entitlement?.tier ?? "").trim().toUpperCase();
  const isActive = entitlement?.is_active === true;

  if (tier === "ADMIN") {
    return null;
  }

  if (tier === "CREATOR PLUS" && isActive) {
    return null;
  }

  return NextResponse.json(
    { error: "CREATOR Pro required" },
    { status: 403 }
  );
}
