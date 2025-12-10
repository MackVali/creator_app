import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type RouteContext = {
  params: {
    type?: string;
    id?: string;
  };
};

const EVENT_TYPES = ["PROJECT", "HABIT"] as const;
type SupportedEventType = (typeof EVENT_TYPES)[number];

function normalizeEventType(value?: string | null): SupportedEventType | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return EVENT_TYPES.includes(normalized as SupportedEventType)
    ? (normalized as SupportedEventType)
    : null;
}

function isValidUuid(value: string | undefined | null) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const eventId = params?.id?.trim();
  const eventType = normalizeEventType(params?.type);

  if (!eventId || !isValidUuid(eventId)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  if (!eventType) {
    return NextResponse.json({ error: "Unsupported event type" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase client unavailable" }, { status: 500 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return NextResponse.json(
      { error: authError.message ?? "Failed to authenticate user" },
      { status: 500 }
    );
  }

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    if (eventType === "PROJECT") {
      return await deleteProjectEvent(supabase, eventId, user.id);
    }
    return await deleteHabitEvent(supabase, eventId, user.id);
  } catch (error) {
    console.error("Failed to delete schedule event", error);
    return NextResponse.json({ error: "Unable to delete this event" }, { status: 500 });
  }
}

async function deleteProjectEvent(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  projectId: string,
  userId: string
) {
  const { data: project, error: projectLookupError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (projectLookupError) {
    console.error("Failed to verify project ownership", projectLookupError);
    throw projectLookupError;
  }

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { error: instanceError } = await supabase
    .from("schedule_instances")
    .delete()
    .eq("user_id", userId)
    .eq("source_id", projectId)
    .eq("source_type", "PROJECT");

  if (instanceError) {
    console.error("Failed to delete project schedule instances", instanceError);
    throw instanceError;
  }

  const { error: skillError } = await supabase
    .from("project_skills")
    .delete()
    .eq("project_id", projectId);

  if (skillError) {
    console.error("Failed to delete project skills", skillError);
    throw skillError;
  }

  const { error: taskError } = await supabase
    .from("tasks")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);

  if (taskError) {
    console.error("Failed to delete project tasks", taskError);
    throw taskError;
  }

  const { error: projectDeleteError } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId);

  if (projectDeleteError) {
    console.error("Failed to delete project", projectDeleteError);
    throw projectDeleteError;
  }

  return NextResponse.json({ success: true });
}

async function deleteHabitEvent(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  habitId: string,
  userId: string
) {
  const { data: habit, error: habitLookupError } = await supabase
    .from("habits")
    .select("id")
    .eq("id", habitId)
    .eq("user_id", userId)
    .maybeSingle();

  if (habitLookupError) {
    console.error("Failed to verify habit ownership", habitLookupError);
    throw habitLookupError;
  }

  if (!habit) {
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }

  const { error: instanceError } = await supabase
    .from("schedule_instances")
    .delete()
    .eq("user_id", userId)
    .eq("source_id", habitId)
    .eq("source_type", "HABIT");

  if (instanceError) {
    console.error("Failed to delete habit schedule instances", instanceError);
    throw instanceError;
  }

  const { error: habitDeleteError } = await supabase
    .from("habits")
    .delete()
    .eq("id", habitId)
    .eq("user_id", userId);

  if (habitDeleteError) {
    console.error("Failed to delete habit", habitDeleteError);
    throw habitDeleteError;
  }

  return NextResponse.json({ success: true });
}
