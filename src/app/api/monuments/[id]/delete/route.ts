import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteMonumentWithReassignment } from "@/lib/monuments/deleteMonument";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase client not initialized" }, { status: 500 });
  }

  const user = (await supabase.auth.getUser()).data.user;
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase admin client unavailable" }, { status: 500 });
  }

  const { id } = await params;

  const { data: monument, error: monumentError } = await admin
    .from("monuments")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (monumentError) {
    return NextResponse.json({ error: monumentError.message }, { status: 400 });
  }

  if (!monument) {
    return NextResponse.json({ error: "Monument not found" }, { status: 404 });
  }

  try {
    await deleteMonumentWithReassignment({
      monumentId: id,
      userId: user.id,
      supabase: admin,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete monument",
      },
      { status: 400 },
    );
  }
}
