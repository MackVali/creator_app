import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { loadPriorityEditorProps } from "@/app/(app)/schedule/priorities/data";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer({
    get: (name) => cookieStore.get(name),
  });

  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await loadPriorityEditorProps(supabase, user.id));
  } catch (error) {
    console.error("Failed to load embedded priority editor", error);
    return NextResponse.json(
      { error: "Unable to load Priority Editor." },
      { status: 500 }
    );
  }
}
