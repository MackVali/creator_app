import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { needsSkillStack } from "@/lib/onboarding/needsSkillStack";

export async function GET(_: NextRequest) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { needsSkillStack: false },
      { status: 500 }
    );
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { needsSkillStack: false },
      { status: 401 }
    );
  }

  try {
    const needs = await needsSkillStack(supabase, userId);
    return NextResponse.json({ needsSkillStack: needs });
  } catch (error) {
    console.error(
      "[needs-skill-stack] Failed to evaluate user skill count:",
      error
    );
    return NextResponse.json(
      { needsSkillStack: false },
      { status: 500 }
    );
  }
}
