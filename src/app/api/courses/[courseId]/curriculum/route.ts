import { NextResponse, type NextRequest } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const COURSE_EXISTS_SELECT = "id";
const CURRICULUM_NODE_SELECT =
  "id, course_id, parent_node_id, node_type, name, position, definition, created_at, updated_at";
const PARENT_NODE_SELECT = "id, course_id, node_type";

const NODE_TYPES = ["GOAL", "PROJECT", "TASK", "HABIT"] as const;

type NodeType = (typeof NODE_TYPES)[number];
type JsonObject = Record<string, unknown>;

type CourseReferenceRow = {
  id: string;
};

type CurriculumNodeRow = {
  id: string;
  course_id: string;
  parent_node_id: string | null;
  node_type: NodeType;
  name: string;
  position: number;
  definition: JsonObject;
  created_at: string;
  updated_at: string;
};

type ParentNodeRow = {
  id: string;
  course_id: string;
  node_type: NodeType;
};

type CurriculumNodeInsert = {
  course_id: string;
  parent_node_id: string | null;
  node_type: NodeType;
  name: string;
  position: number;
  definition: JsonObject;
};

type CurriculumNodeInput = {
  nodeType: NodeType;
  name: string;
  parentNodeId: string | null;
  position: number;
  definition: JsonObject;
};

type QueryResult<T> = PromiseLike<{
  data: T | null;
  error: PostgrestError | null;
}>;

type CourseSelectBuilder = {
  eq(column: "id" | "owner_user_id", value: string): CourseSelectBuilder;
  maybeSingle(): QueryResult<CourseReferenceRow>;
};

type CourseTable = {
  select(columns: typeof COURSE_EXISTS_SELECT): CourseSelectBuilder;
};

type CurriculumSelectBuilder = QueryResult<CurriculumNodeRow[]> & {
  eq(column: "course_id", value: string): CurriculumSelectBuilder;
  order(
    column: "position" | "created_at",
    options: { ascending: boolean },
  ): CurriculumSelectBuilder;
};

type ParentSelectBuilder = {
  eq(column: "id" | "course_id", value: string): ParentSelectBuilder;
  maybeSingle(): QueryResult<ParentNodeRow>;
};

type CurriculumInsertBuilder = {
  select(columns: typeof CURRICULUM_NODE_SELECT): {
    single(): QueryResult<CurriculumNodeRow>;
  };
};

type CurriculumTable = {
  select(columns: typeof CURRICULUM_NODE_SELECT): CurriculumSelectBuilder;
  select(columns: typeof PARENT_NODE_SELECT): ParentSelectBuilder;
  insert(values: CurriculumNodeInsert): CurriculumInsertBuilder;
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

function getCurriculumTable(supabase: ServerSupabaseClient) {
  const from = supabase.from as unknown as (
    table: "course_curriculum_nodes",
  ) => CurriculumTable;
  return from("course_curriculum_nodes");
}

function isNodeType(value: unknown): value is NodeType {
  return typeof value === "string" && NODE_TYPES.includes(value as NodeType);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isPlainJsonObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseCurriculumNodeInput(payload: unknown):
  | { ok: true; value: CurriculumNodeInput }
  | { ok: false; error: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Invalid request" };
  }

  const { nodeType, name, parentNodeId, position, definition } = payload as Record<
    string,
    unknown
  >;

  if (!isNodeType(nodeType)) {
    return { ok: false, error: "Invalid node type" };
  }

  if (typeof name !== "string" || name.trim().length === 0) {
    return { ok: false, error: "Name is required" };
  }

  let validatedParentNodeId: string | null = null;
  if (parentNodeId !== undefined && parentNodeId !== null) {
    if (typeof parentNodeId !== "string" || !isUuid(parentNodeId)) {
      return { ok: false, error: "Parent node ID must be a UUID" };
    }

    validatedParentNodeId = parentNodeId;
  }

  let validatedPosition = 0;
  if (position !== undefined) {
    if (
      typeof position !== "number" ||
      !Number.isInteger(position) ||
      position < 0
    ) {
      return { ok: false, error: "Position must be a non-negative integer" };
    }

    validatedPosition = position;
  }

  let validatedDefinition: JsonObject = {};
  if (definition !== undefined) {
    if (!isPlainJsonObject(definition)) {
      return { ok: false, error: "Definition must be an object" };
    }

    validatedDefinition = definition;
  }

  return {
    ok: true,
    value: {
      nodeType,
      name: name.trim(),
      parentNodeId: validatedParentNodeId,
      position: validatedPosition,
      definition: validatedDefinition,
    },
  };
}

function validateHierarchy(nodeType: NodeType, parentNode: ParentNodeRow | null) {
  if (nodeType === "GOAL") {
    return parentNode ? "GOAL nodes must not have a parent" : null;
  }

  if (nodeType === "PROJECT") {
    return parentNode?.node_type === "GOAL"
      ? null
      : "PROJECT nodes must have a GOAL parent";
  }

  if (nodeType === "TASK") {
    return parentNode?.node_type === "PROJECT" || parentNode?.node_type === "GOAL"
      ? null
      : "TASK nodes must have a PROJECT or GOAL parent";
  }

  if (nodeType === "HABIT") {
    return !parentNode || parentNode.node_type === "GOAL"
      ? null
      : "HABIT nodes must have no parent or a GOAL parent";
  }

  return "Invalid hierarchy";
}

async function verifyOwnedCourse(
  supabase: ServerSupabaseClient,
  courseId: string,
  userId: string,
) {
  return getCoursesTable(supabase)
    .select(COURSE_EXISTS_SELECT)
    .eq("id", courseId)
    .eq("owner_user_id", userId)
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

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { courseId } = await context.params;
  const { data: course, error: courseError } = await verifyOwnedCourse(
    supabase,
    courseId,
    user.id,
  );

  if (courseError) {
    console.error("Failed to verify course ownership", courseError);
    return NextResponse.json({ error: "Unable to load course" }, { status: 500 });
  }

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const { data: nodes, error: nodesError } = await getCurriculumTable(supabase)
    .select(CURRICULUM_NODE_SELECT)
    .eq("course_id", courseId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (nodesError) {
    console.error("Failed to load course curriculum", nodesError);
    return NextResponse.json(
      { error: "Unable to load curriculum" },
      { status: 500 },
    );
  }

  return NextResponse.json({ nodes: nodes ?? [] });
}

export async function POST(request: NextRequest, context: Context) {
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

  const { courseId } = await context.params;
  const { data: course, error: courseError } = await verifyOwnedCourse(
    supabase,
    courseId,
    user.id,
  );

  if (courseError) {
    console.error("Failed to verify course ownership", courseError);
    return NextResponse.json({ error: "Unable to load course" }, { status: 500 });
  }

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseCurriculumNodeInput(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let parentNode: ParentNodeRow | null = null;
  if (parsed.value.parentNodeId) {
    const { data, error } = await getCurriculumTable(supabase)
      .select(PARENT_NODE_SELECT)
      .eq("id", parsed.value.parentNodeId)
      .eq("course_id", courseId)
      .maybeSingle();

    if (error) {
      console.error("Failed to verify curriculum parent node", error);
      return NextResponse.json(
        { error: "Unable to verify parent node" },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json({ error: "Parent node not found" }, { status: 400 });
    }

    parentNode = data;
  }

  const hierarchyError = validateHierarchy(parsed.value.nodeType, parentNode);
  if (hierarchyError) {
    return NextResponse.json({ error: hierarchyError }, { status: 400 });
  }

  const { data: node, error: insertError } = await getCurriculumTable(supabase)
    .insert({
      course_id: courseId,
      parent_node_id: parsed.value.parentNodeId,
      node_type: parsed.value.nodeType,
      name: parsed.value.name,
      position: parsed.value.position,
      definition: parsed.value.definition,
    })
    .select(CURRICULUM_NODE_SELECT)
    .single();

  if (insertError || !node) {
    console.error("Failed to create curriculum node", insertError);
    return NextResponse.json(
      { error: "Unable to create curriculum node" },
      { status: 500 },
    );
  }

  return NextResponse.json({ node }, { status: 201 });
}
