import { NextResponse, type NextRequest } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const COURSE_SELECT =
  "id, owner_user_id, title, description, status, cover_image_url, created_at, updated_at";

type CourseRow = {
  id: string;
  owner_user_id: string;
  title: string;
  description: string | null;
  status: string;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
};

type CourseInsert = {
  owner_user_id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  status: "DRAFT";
};

type CourseQueryResult<T> = PromiseLike<{
  data: T | null;
  error: PostgrestError | null;
}>;

type CourseSelectBuilder = CourseQueryResult<CourseRow[]> & {
  eq(column: "owner_user_id", value: string): CourseSelectBuilder;
  order(column: "updated_at", options: { ascending: boolean }): CourseSelectBuilder;
};

type CourseInsertBuilder = {
  select(columns: typeof COURSE_SELECT): {
    single(): CourseQueryResult<CourseRow>;
  };
};

type CourseTable = {
  select(columns: typeof COURSE_SELECT): CourseSelectBuilder;
  insert(values: CourseInsert): CourseInsertBuilder;
};

function getCoursesTable(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
) {
  const from = supabase.from as unknown as (table: "courses") => CourseTable;
  return from("courses");
}

function trimOptionalText(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 },
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await getCoursesTable(supabase)
    .select(COURSE_SELECT)
    .eq("owner_user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Failed to load courses", error);
    return NextResponse.json({ error: "Unable to load courses" }, { status: 500 });
  }

  return NextResponse.json({ courses: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 },
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { title, description, coverImageUrl } = payload as Record<string, unknown>;

  if (typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const trimmedDescription = trimOptionalText(description);
  if (trimmedDescription === undefined) {
    return NextResponse.json({ error: "Description must be text" }, { status: 400 });
  }

  const trimmedCoverImageUrl = trimOptionalText(coverImageUrl);
  if (trimmedCoverImageUrl === undefined) {
    return NextResponse.json({ error: "Cover image URL must be text" }, { status: 400 });
  }

  const { data: course, error } = await getCoursesTable(supabase)
    .insert({
      owner_user_id: user.id,
      title: title.trim(),
      description: trimmedDescription,
      cover_image_url: trimmedCoverImageUrl,
      status: "DRAFT",
    })
    .select(COURSE_SELECT)
    .single();

  if (error || !course) {
    console.error("Failed to create course", error);
    return NextResponse.json({ error: "Unable to create course" }, { status: 500 });
  }

  return NextResponse.json({ course }, { status: 201 });
}
