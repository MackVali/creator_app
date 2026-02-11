import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export const runtime = "nodejs";

import { getSupabaseServer } from "@/lib/supabase";

const defaultEntitlement = {
  tier: "FREE",
  is_active: false,
  current_period_end: null,
};

export async function GET() {
  const cookieStore = cookies();
  const supabase = getSupabaseServer({
    get: (name: string) => cookieStore.get(name),
    set: () => {},
  });

  if (!supabase) {
    return NextResponse.json(defaultEntitlement, { status: 200 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(defaultEntitlement, { status: 200 });
  }

  const { data, error } = await supabase
    .from("user_entitlements")
    .select("tier,is_active,current_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load entitlement", error);
    return NextResponse.json(
      { error: "Unable to load entitlement." },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(defaultEntitlement, { status: 200 });
  }

  const tier = data.tier;
  const is_active = tier === "ADMIN" ? true : data.is_active;

  return NextResponse.json({
    tier,
    is_active,
    current_period_end: data.current_period_end,
  }, { status: 200 });
}
