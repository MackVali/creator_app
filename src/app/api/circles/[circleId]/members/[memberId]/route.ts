import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { userHasAppManagerAccess } from "@/lib/auth/userRoles";
import { getSupabaseServer } from "@/lib/supabase";

const circleColumns = "id, owner_user_id, status";

const memberColumns =
  "id, circle_id, user_id, role, status, invited_by_user_id, skill_constraint_ids, location_context_ids, created_at, updated_at";
const allowedRoles = new Set(["MEMBER", "OPERATOR", "MANAGER", "VIEWER"]);
const allowedMemberManagerRoles = new Set(["OWNER", "MANAGER"]);

type CircleRow = {
  id: string;
  owner_user_id: string;
  status: string;
};

type CircleMemberRole = "MEMBER" | "OPERATOR" | "MANAGER" | "VIEWER";

type CircleMemberRow = {
  id: string;
  circle_id: string;
  user_id: string;
  role: string;
  status: string;
  invited_by_user_id: string | null;
  skill_constraint_ids: string[] | null;
  location_context_ids: string[] | null;
  created_at: string;
  updated_at: string;
};

type UpdateCircleMemberBody = {
  action?: unknown;
  role?: unknown;
  skill_constraint_ids?: unknown;
  location_context_ids?: unknown;
};

type CircleMemberAction = "remove" | "cancel_invite";

type RequesterMemberRow = {
  id: string;
  role: string;
};

type ConstraintValidationResult =
  | {
      ids: string[];
      error: null;
    }
  | {
      ids: null;
      error: string;
    };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CircleMemberParams = {
  params: Promise<{
    circleId: string;
    memberId: string;
  }>;
};

async function getServerClient() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(
    cookieStore as unknown as Parameters<typeof getSupabaseServer>[0]
  );

  return supabase ? (supabase as unknown as SupabaseClient) : null;
}

function normalizeAction(value: unknown): CircleMemberAction | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();

  return normalized === "remove" || normalized === "cancel_invite"
    ? normalized
    : null;
}

function normalizeRole(value: unknown): CircleMemberRole | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase();

  return allowedRoles.has(normalized)
    ? (normalized as CircleMemberRole)
    : null;
}

function hasOwn(body: UpdateCircleMemberBody, key: keyof UpdateCircleMemberBody) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function normalizeUuidArray(
  value: unknown,
  label: string
): ConstraintValidationResult {
  if (!Array.isArray(value)) {
    return { ids: null, error: `${label} must be an array.` };
  }

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const rawId of value) {
    if (typeof rawId !== "string") {
      return { ids: null, error: `${label} must only contain strings.` };
    }

    const id = rawId.trim();

    if (!uuidPattern.test(id)) {
      return { ids: null, error: `${label} contains an invalid id.` };
    }

    const normalizedId = id.toLowerCase();

    if (!seen.has(normalizedId)) {
      ids.push(normalizedId);
      seen.add(normalizedId);
    }
  }

  return { ids, error: null };
}

async function validateOwnedIds(
  supabase: SupabaseClient,
  tableName: "skills" | "location_contexts",
  ids: string[],
  ownerUserId: string,
  label: string
) {
  if (ids.length === 0) return null;

  const { data, error } = await supabase
    .from(tableName)
    .select("id")
    .eq("user_id", ownerUserId)
    .in("id", ids)
    .returns<{ id: string }[]>();

  if (error) {
    console.error(`Failed to validate ${label}`, error);
    return NextResponse.json(
      { error: `Unable to validate ${label}.` },
      { status: 500 }
    );
  }

  const ownedIds = new Set((data ?? []).map((row) => row.id));

  if (ids.some((id) => !ownedIds.has(id))) {
    return NextResponse.json(
      { error: `${label} must belong to the Circle owner.` },
      { status: 400 }
    );
  }

  return null;
}

export async function PATCH(request: Request, context: CircleMemberParams) {
  const { circleId, memberId } = await context.params;
  const supabase = await getServerClient();

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

  const body = (await request.json().catch(
    () => ({})
  )) as UpdateCircleMemberBody;
  const action = normalizeAction(body.action);
  const hasAction = hasOwn(body, "action");
  const hasRole = hasOwn(body, "role");
  const role = hasRole ? normalizeRole(body.role) : null;
  const hasSkillConstraints = hasOwn(body, "skill_constraint_ids");
  const hasLocationContexts = hasOwn(body, "location_context_ids");

  if (hasAction && !action) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  if (hasRole && !role) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  if (!action && !hasRole && !hasSkillConstraints && !hasLocationContexts) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const { data: circle, error: circleError } = await supabase
    .from("circles")
    .select(circleColumns)
    .eq("id", circleId)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle<CircleRow>();

  if (circleError) {
    console.error("Failed to verify circle ownership", circleError);
    return NextResponse.json(
      { error: "Unable to verify circle access." },
      { status: 500 }
    );
  }

  if (!circle) {
    return NextResponse.json(
      { error: "Circle not found or access denied." },
      { status: 404 }
    );
  }

  const requesterIsOwner = circle.owner_user_id === user.id;
  let requesterCanManageMembers =
    requesterIsOwner || userHasAppManagerAccess(user);

  if (!requesterCanManageMembers) {
    const { data: requesterMember, error: requesterMemberError } =
      await supabase
        .from("circle_members")
        .select("id, role")
        .eq("circle_id", circleId)
        .eq("user_id", user.id)
        .eq("status", "ACTIVE")
        .limit(1)
        .maybeSingle<RequesterMemberRow>();

    if (requesterMemberError) {
      console.error(
        "Failed to verify circle member update requester membership",
        requesterMemberError
      );
      return NextResponse.json(
        { error: "Unable to verify circle access." },
        { status: 500 }
      );
    }

    requesterCanManageMembers =
      !!requesterMember &&
      allowedMemberManagerRoles.has(requesterMember.role.trim().toUpperCase());
  }

  if (!requesterCanManageMembers) {
    return NextResponse.json(
      { error: "Not authorized to update members for this Circle." },
      { status: 403 }
    );
  }

  const { data: member, error: memberError } = await supabase
    .from("circle_members")
    .select(memberColumns)
    .eq("id", memberId)
    .eq("circle_id", circleId)
    .limit(1)
    .maybeSingle<CircleMemberRow>();

  if (memberError) {
    console.error("Failed to load circle member", memberError);
    return NextResponse.json(
      { error: "Unable to load circle member." },
      { status: 500 }
    );
  }

  if (!member) {
    return NextResponse.json(
      { error: "Circle member not found." },
      { status: 404 }
    );
  }

  const targetMemberRole = member.role.trim().toUpperCase();

  if ((action || hasRole) && targetMemberRole === "OWNER") {
    return NextResponse.json(
      { error: "Circle owner role cannot be changed or removed." },
      { status: 400 }
    );
  }

  if (action === "remove" && !["ACTIVE", "INVITED"].includes(member.status)) {
    return NextResponse.json(
      { error: "Only active members or pending invites can be removed." },
      { status: 400 }
    );
  }

  if (action === "cancel_invite" && member.status !== "INVITED") {
    return NextResponse.json(
      { error: "Only pending invites can be canceled." },
      { status: 400 }
    );
  }

  if (!action) {
    if (!["ACTIVE", "INVITED"].includes(member.status)) {
      return NextResponse.json(
        { error: "Only active members or pending invites can be updated." },
        { status: 400 }
      );
    }

    const updateValues: {
      updated_at: string;
      role?: CircleMemberRole;
      skill_constraint_ids?: string[];
      location_context_ids?: string[];
    } = {
      updated_at: new Date().toISOString(),
    };

    if (role) {
      updateValues.role = role;
    }

    if (hasSkillConstraints) {
      const validation = normalizeUuidArray(
        body.skill_constraint_ids,
        "Skill constraints"
      );

      if (validation.error) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        );
      }

      const ownershipError = await validateOwnedIds(
        supabase,
        "skills",
        validation.ids,
        circle.owner_user_id,
        "skill constraints"
      );

      if (ownershipError) {
        return ownershipError;
      }

      updateValues.skill_constraint_ids = validation.ids;
    }

    if (hasLocationContexts) {
      const validation = normalizeUuidArray(
        body.location_context_ids,
        "Location contexts"
      );

      if (validation.error) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        );
      }

      const ownershipError = await validateOwnedIds(
        supabase,
        "location_contexts",
        validation.ids,
        circle.owner_user_id,
        "location contexts"
      );

      if (ownershipError) {
        return ownershipError;
      }

      updateValues.location_context_ids = validation.ids;
    }

    const { data: updatedMember, error: updateError } = await supabase
      .from("circle_members")
      .update(updateValues)
      .eq("id", member.id)
      .eq("circle_id", circleId)
      .select(memberColumns)
      .maybeSingle<CircleMemberRow>();

    if (updateError) {
      console.error("Failed to update circle member constraints", updateError);
      return NextResponse.json(
        { error: "Unable to update circle member." },
        { status: 500 }
      );
    }

    if (!updatedMember) {
      return NextResponse.json(
        { error: "Circle member can no longer be updated." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        member: {
          ...updatedMember,
          skill_constraint_ids: updatedMember.skill_constraint_ids ?? [],
          location_context_ids: updatedMember.location_context_ids ?? [],
        },
      },
      { status: 200 }
    );
  }

  let updateQuery = supabase
    .from("circle_members")
    .update({
      status: "REMOVED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", member.id)
    .eq("circle_id", circleId)
    .neq("role", "OWNER");

  updateQuery =
    action === "cancel_invite"
      ? updateQuery.eq("status", "INVITED")
      : updateQuery.in("status", ["ACTIVE", "INVITED"]);

  const { data: updatedMember, error: updateError } = await updateQuery
    .select(memberColumns)
    .maybeSingle<CircleMemberRow>();

  if (updateError) {
    console.error("Failed to update circle member", updateError);
    return NextResponse.json(
      { error: "Unable to update circle member." },
      { status: 500 }
    );
  }

  if (!updatedMember) {
    return NextResponse.json(
      { error: "Circle member can no longer be updated." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    {
      member: {
        ...updatedMember,
        skill_constraint_ids: updatedMember.skill_constraint_ids ?? [],
        location_context_ids: updatedMember.location_context_ids ?? [],
      },
    },
    { status: 200 }
  );
}
