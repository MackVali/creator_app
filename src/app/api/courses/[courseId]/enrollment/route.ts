import { NextResponse, type NextRequest } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const COURSE_SELECT = "id, owner_user_id, status";
const ENROLLMENT_SELECT =
  "id, course_id, user_id, status, enrolled_at, completed_at, created_at, updated_at";

type CourseRow = {
  id: string;
  owner_user_id: string;
  status: string;
};

type EnrollmentStatus = "ACTIVE" | "COMPLETED" | "CANCELED";

type EnrollmentRow = {
  id: string;
  course_id: string;
  user_id: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type EnrollmentInsert = {
  course_id: string;
  user_id: string;
  status: "ACTIVE";
};

type EnrollmentUpdate = {
  status: "ACTIVE";
  enrolled_at: string;
  completed_at: null;
  updated_at: string;
};

type QueryResult<T> = PromiseLike<{
  data: T | null;
  error: PostgrestError | null;
}>;

type CourseSelectBuilder = {
  eq(column: "id", value: string): CourseSelectBuilder;
  maybeSingle(): QueryResult<CourseRow>;
};

type CourseTable = {
  select(columns: typeof COURSE_SELECT): CourseSelectBuilder;
};

type EnrollmentSelectBuilder = {
  eq(
    column: "course_id" | "user_id",
    value: string,
  ): EnrollmentSelectBuilder;
  maybeSingle(): QueryResult<EnrollmentRow>;
};

type EnrollmentUpdateBuilder = {
  eq(
    column: "id" | "course_id" | "user_id",
    value: string,
  ): EnrollmentUpdateBuilder;
  select(columns: typeof ENROLLMENT_SELECT): {
    single(): QueryResult<EnrollmentRow>;
  };
};

type EnrollmentInsertBuilder = {
  select(columns: typeof ENROLLMENT_SELECT): {
    single(): QueryResult<EnrollmentRow>;
  };
};

type EnrollmentTable = {
  select(columns: typeof ENROLLMENT_SELECT): EnrollmentSelectBuilder;
  update(values: EnrollmentUpdate): EnrollmentUpdateBuilder;
  insert(values: EnrollmentInsert): EnrollmentInsertBuilder;
};

type ServerSupabaseClient = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

type Context = {
  params: Promise<{
    courseId: string;
  }>;
};

function getCoursesTable(supabase: ServerSupabaseClient) {
  const from = supabase.from as unknown as (table: "courses") => CourseTable;
  return from("courses");
}

function getEnrollmentsTable(supabase: ServerSupabaseClient) {
  const from = supabase.from as unknown as (
    table: "course_enrollments",
  ) => EnrollmentTable;
  return from("course_enrollments");
}

async function getAuthenticatedUser(supabase: ServerSupabaseClient) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { user, error };
}

async function loadEnrollment(
  supabase: ServerSupabaseClient,
  courseId: string,
  userId: string,
) {
  return getEnrollmentsTable(supabase)
    .select(ENROLLMENT_SELECT)
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .maybeSingle();
}

export async function GET(_request: NextRequest, context: Context) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 },
    );
  }

  const { user, error: authError } = await getAuthenticatedUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { courseId } = await context.params;
  const { data: enrollment, error } = await loadEnrollment(
    supabase,
    courseId,
    user.id,
  );

  if (error) {
    console.error("Failed to load course enrollment", error);
    return NextResponse.json(
      { error: "Unable to load enrollment" },
      { status: 500 },
    );
  }

  return NextResponse.json({ enrollment: enrollment ?? null });
}

export async function POST(_request: NextRequest, context: Context) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 },
    );
  }

  const { user, error: authError } = await getAuthenticatedUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { courseId } = await context.params;
  const { data: course, error: courseError } = await getCoursesTable(supabase)
    .select(COURSE_SELECT)
    .eq("id", courseId)
    .maybeSingle();

  if (courseError) {
    console.error("Failed to verify course enrollment availability", courseError);
    return NextResponse.json({ error: "Unable to load course" }, { status: 500 });
  }

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const isOwner = course.owner_user_id === user.id;
  const isPublished = course.status === "PUBLISHED";

  if (!isPublished && !isOwner) {
    return NextResponse.json(
      { error: "Course enrollment unavailable" },
      { status: 403 },
    );
  }

  const { data: existingEnrollment, error: enrollmentError } = await loadEnrollment(
    supabase,
    courseId,
    user.id,
  );

  if (enrollmentError) {
    console.error("Failed to load existing course enrollment", enrollmentError);
    return NextResponse.json(
      { error: "Unable to load enrollment" },
      { status: 500 },
    );
  }

  if (
    existingEnrollment?.status === "ACTIVE" ||
    existingEnrollment?.status === "COMPLETED"
  ) {
    return NextResponse.json({ enrollment: existingEnrollment });
  }

  if (existingEnrollment?.status === "CANCELED") {
    const now = new Date().toISOString();
    const { data: enrollment, error: updateError } = await getEnrollmentsTable(
      supabase,
    )
      .update({
        status: "ACTIVE",
        completed_at: null,
        enrolled_at: now,
        updated_at: now,
      })
      .eq("id", existingEnrollment.id)
      .eq("course_id", courseId)
      .eq("user_id", user.id)
      .select(ENROLLMENT_SELECT)
      .single();

    if (updateError || !enrollment) {
      console.error("Failed to reactivate course enrollment", updateError);
      return NextResponse.json(
        { error: "Unable to update enrollment" },
        { status: 500 },
      );
    }

    return NextResponse.json({ enrollment });
  }

  const { data: enrollment, error: insertError } = await getEnrollmentsTable(
    supabase,
  )
    .insert({
      course_id: courseId,
      user_id: user.id,
      status: "ACTIVE",
    })
    .select(ENROLLMENT_SELECT)
    .single();

  if (insertError || !enrollment) {
    console.error("Failed to create course enrollment", insertError);
    return NextResponse.json(
      { error: "Unable to create enrollment" },
      { status: 500 },
    );
  }

  return NextResponse.json({ enrollment }, { status: 201 });
}
