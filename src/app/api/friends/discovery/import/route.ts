import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { mapContactImportStatus } from "@/lib/friends/mappers";
import { getSupabaseServer } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({
  totalContacts: z
    .number()
    .int()
    .min(1)
    .max(100_000),
  contacts: z
    .array(
      z.object({
        name: z.string().trim().max(120).nullable().optional(),
        emails: z.array(z.string().trim().toLowerCase().email()).max(8).default([]),
        phones: z.array(z.string().trim().min(7).max(32)).max(8).default([]),
      })
    )
    .min(1)
    .max(2_000),
});

type RelationshipStatus =
  | "self"
  | "friends"
  | "following"
  | "followed_by"
  | "incoming_request"
  | "outgoing_request"
  | "none";

type ContactPayload = z.infer<typeof BodySchema>["contacts"][number];

type ContactDiscoveryProfile = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  mutualFriends: number;
  highlight: string;
  role: string;
  profileUrl: string;
  relationship: RelationshipStatus;
};

type ContactInvite = {
  id: string;
  name: string;
  detail: string;
};

type ProfileContactRow = {
  id: string;
  user_id: string | null;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  contact_email_public?: string | null;
  contact_phone_public?: string | null;
};

type QueryResult<T = unknown> = {
  data: T | null;
  error: { code?: string; message?: string } | null;
};

type SupabaseQueryBuilder = PromiseLike<QueryResult> & {
  select: (columns: string) => SupabaseQueryBuilder;
  eq: (column: string, value: unknown) => SupabaseQueryBuilder;
  neq: (column: string, value: unknown) => SupabaseQueryBuilder;
  in: (column: string, values: unknown[]) => SupabaseQueryBuilder;
  not: (
    column: string,
    operator: string,
    value: unknown
  ) => SupabaseQueryBuilder;
  limit: (count: number) => SupabaseQueryBuilder;
  maybeSingle: () => Promise<QueryResult>;
  single: () => Promise<QueryResult>;
  upsert: (
    values: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => SupabaseQueryBuilder;
};

type SupabaseLike = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
    admin?: {
      listUsers: (options: { page: number; perPage: number }) => Promise<{
        data?: { users?: AuthMatchedUser[] };
        error?: unknown;
      }>;
    };
  };
  from: (table: string) => SupabaseQueryBuilder;
};

type AuthMatchedUser = {
  id: string;
  email?: string | null;
};

type MatchingUser = {
  id: string;
  contact: ContactPayload;
};

type FriendConnectionPair = {
  user_id: string;
  friend_user_id: string;
};

type FriendRequestPair = {
  requester_id: string;
  target_id: string;
};

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function phoneKeys(value: string) {
  const digits = normalizePhone(value);
  const keys = new Set<string>();

  if (digits.length >= 7) {
    keys.add(digits);
  }

  if (digits.length >= 10) {
    keys.add(digits.slice(-10));
  }

  return keys;
}

function bestContactDetail(contact: ContactPayload) {
  return contact.emails[0] ?? contact.phones[0] ?? "";
}

async function loadRelationshipByUserId(
  supabase: SupabaseLike,
  viewerId: string,
  targetIds: string[]
) {
  const relationships = new Map<string, RelationshipStatus>();
  const uniqueTargetIds = Array.from(new Set(targetIds)).filter(
    (id) => id && id !== viewerId
  );

  for (const targetId of uniqueTargetIds) {
    relationships.set(targetId, "none");
  }

  if (!uniqueTargetIds.length) {
    return relationships;
  }

  const ids = [viewerId, ...uniqueTargetIds];
  const targetIdSet = new Set(uniqueTargetIds);

  const { data: connectionRows, error: connectionError } = await supabase
    .from("friend_connections")
    .select("user_id, friend_user_id")
    .in("user_id", ids)
    .in("friend_user_id", ids);

  if (connectionError && connectionError.code !== "PGRST116") {
    console.error("Failed to load contact match relationships", connectionError);
  }

  const viewerFollowsTargets = new Set<string>();
  const targetsFollowViewer = new Set<string>();

  for (const connection of (connectionRows as FriendConnectionPair[] | null) ??
    []) {
    if (
      connection.user_id === viewerId &&
      targetIdSet.has(connection.friend_user_id)
    ) {
      viewerFollowsTargets.add(connection.friend_user_id);
    }

    if (
      connection.friend_user_id === viewerId &&
      targetIdSet.has(connection.user_id)
    ) {
      targetsFollowViewer.add(connection.user_id);
    }
  }

  const { data: requestRows, error: requestError } = await supabase
    .from("friend_requests")
    .select("requester_id, target_id")
    .eq("status", "pending")
    .in("requester_id", ids)
    .in("target_id", ids);

  if (requestError) {
    console.error("Failed to load contact match requests", requestError);
  }

  const incomingRequests = new Set<string>();
  const outgoingRequests = new Set<string>();

  for (const request of (requestRows as FriendRequestPair[] | null) ?? []) {
    if (request.target_id === viewerId && targetIdSet.has(request.requester_id)) {
      incomingRequests.add(request.requester_id);
    }

    if (request.requester_id === viewerId && targetIdSet.has(request.target_id)) {
      outgoingRequests.add(request.target_id);
    }
  }

  for (const targetId of uniqueTargetIds) {
    const viewerFollows = viewerFollowsTargets.has(targetId);
    const targetFollows = targetsFollowViewer.has(targetId);

    if (viewerFollows && targetFollows) {
      relationships.set(targetId, "friends");
    } else if (viewerFollows) {
      relationships.set(targetId, "following");
    } else if (targetFollows) {
      relationships.set(targetId, "followed_by");
    } else if (incomingRequests.has(targetId)) {
      relationships.set(targetId, "incoming_request");
    } else if (outgoingRequests.has(targetId)) {
      relationships.set(targetId, "outgoing_request");
    }
  }

  return relationships;
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const parseResult = BodySchema.safeParse(payload ?? {});

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = getSupabaseServer(
    cookieStore as unknown as Parameters<typeof getSupabaseServer>[0]
  ) as SupabaseLike | null;

  if (!supabase) {
    return NextResponse.json(
      { contactImport: mapContactImportStatus(null) },
      { status: 200 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { contactImport: mapContactImportStatus(null) },
      { status: 200 }
    );
  }

  const { contacts, totalContacts } = parseResult.data;
  const contactEmails = new Set<string>();
  const contactPhones = new Set<string>();
  const contactByEmail = new Map<string, ContactPayload>();
  const contactByPhone = new Map<string, ContactPayload>();

  for (const contact of contacts) {
    for (const email of contact.emails) {
      const normalized = email.trim().toLowerCase();
      contactEmails.add(normalized);
      contactByEmail.set(normalized, contact);
    }

    for (const phone of contact.phones) {
      for (const key of phoneKeys(phone)) {
        contactPhones.add(key);
        contactByPhone.set(key, contact);
      }
    }
  }

  if (!contactEmails.size && !contactPhones.size) {
    return NextResponse.json(
      { error: "No contact details were provided." },
      { status: 400 }
    );
  }

  const admin = createAdminClient() as SupabaseLike | null;
  const profileClient = admin ?? supabase;
  let profileRows: ProfileContactRow[] = [];

  const { data: fullProfileRows, error: fullProfileError } =
    await profileClient
      .from("profiles")
      .select(
        "id, user_id, username, name, avatar_url, contact_email_public, contact_phone_public"
      )
      .not("username", "is", null)
      .eq("is_private", false)
      .neq("user_id", user.id)
      .limit(1_000);

  if (fullProfileError) {
    console.error("Failed to load contact profile fields", fullProfileError);

    const { data: fallbackProfileRows, error: fallbackProfileError } =
      await profileClient
        .from("profiles")
        .select("id, user_id, username, name, avatar_url")
        .not("username", "is", null)
        .eq("is_private", false)
        .neq("user_id", user.id)
        .limit(1_000);

    if (fallbackProfileError) {
      console.error(
        "Failed to load fallback contact profiles",
        fallbackProfileError
      );
    } else {
      profileRows = (fallbackProfileRows ?? []) as ProfileContactRow[];
    }
  } else {
    profileRows = (fullProfileRows ?? []) as ProfileContactRow[];
  }

  const matchedByUserId = new Map<
    string,
    { profile: ProfileContactRow; contact: ContactPayload }
  >();
  const matchedContacts = new Set<ContactPayload>();

  for (const profile of profileRows) {
    if (!profile.user_id || profile.user_id === user.id || !profile.username) {
      continue;
    }

    const publicEmail = profile.contact_email_public?.trim().toLowerCase();
    const emailContact = publicEmail ? contactByEmail.get(publicEmail) : null;
    const publicPhone = profile.contact_phone_public ?? "";
    const phoneContact = Array.from(phoneKeys(publicPhone))
      .map((key) => contactByPhone.get(key))
      .find(Boolean);
    const matchedContact = emailContact ?? phoneContact;

    if (!matchedContact || matchedByUserId.has(profile.user_id)) {
      continue;
    }

    matchedByUserId.set(profile.user_id, { profile, contact: matchedContact });
    matchedContacts.add(matchedContact);
  }

  if (admin?.auth?.admin?.listUsers && contactEmails.size) {
    const { data: adminUsersData, error: adminUsersError } =
      await admin.auth.admin.listUsers({ page: 1, perPage: 1_000 });

    if (adminUsersError) {
      console.error("Failed to match contact emails to users", adminUsersError);
    } else {
      const matchingUsers: MatchingUser[] = (adminUsersData?.users ?? [])
        .map((matchedUser: AuthMatchedUser): MatchingUser | null => {
          const email = matchedUser.email?.trim().toLowerCase() ?? "";
          const contact = contactByEmail.get(email);

          return contact && matchedUser.id !== user.id
            ? { id: matchedUser.id, contact }
            : null;
        })
        .filter(
          (value: MatchingUser | null): value is MatchingUser => value !== null
        )
        .filter((value: MatchingUser) => !matchedByUserId.has(value.id));

      if (matchingUsers.length) {
        const { data: authProfileRows, error: authProfileError } =
          await profileClient
            .from("profiles")
            .select("id, user_id, username, name, avatar_url")
            .in(
              "user_id",
              matchingUsers.map((matchedUser) => matchedUser.id)
            )
            .not("username", "is", null);

        if (authProfileError) {
          console.error("Failed to load auth email matched profiles", authProfileError);
        } else {
          const contactByUserId = new Map<string, ContactPayload>(
            matchingUsers.map((matchedUser) => [
              matchedUser.id,
              matchedUser.contact,
            ])
          );

          for (const profile of (authProfileRows ?? []) as ProfileContactRow[]) {
            if (!profile.user_id || !profile.username) {
              continue;
            }

            const contact = contactByUserId.get(profile.user_id);

            if (!contact || matchedByUserId.has(profile.user_id)) {
              continue;
            }

            matchedByUserId.set(profile.user_id, { profile, contact });
            matchedContacts.add(contact);
          }
        }
      }
    }
  }

  const relationshipByUserId = await loadRelationshipByUserId(
    supabase,
    user.id,
    Array.from(matchedByUserId.keys())
  );

  const matchedProfiles: ContactDiscoveryProfile[] = Array.from(
    matchedByUserId.entries()
  )
    .map(([targetUserId, { profile }]) => {
      const username = profile.username?.trim() ?? "";
      const displayName = profile.name?.trim() || username;

      return {
        id: profile.id,
        username,
        displayName,
        avatarUrl: profile.avatar_url,
        mutualFriends: 0,
        highlight: "From your contacts",
        role: "Creator",
        profileUrl: `/profile/${encodeURIComponent(username)}`,
        relationship: relationshipByUserId.get(targetUserId) ?? "none",
      };
    })
    .filter((profile) => profile.username);

  const unmatchedContacts: ContactInvite[] = contacts
    .filter((contact) => !matchedContacts.has(contact))
    .slice(0, 25)
    .map((contact, index) => ({
      id: `contact-${index}-${bestContactDetail(contact)}`,
      name: contact.name?.trim() || bestContactDetail(contact) || "Contact",
      detail: bestContactDetail(contact),
    }))
    .filter((contact) => contact.detail);

  const {
    data: existingRow,
    error: existingError,
  } = await supabase
    .from("friend_contact_imports")
    .select("id, user_id, total_contacts, imported_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    console.error("Failed to read contact import status", existingError);
    return NextResponse.json(
      { error: "Unable to update contacts." },
      { status: 500 }
    );
  }

  const { data: upsertedRow, error: upsertError } = await supabase
    .from("friend_contact_imports")
    .upsert(
      {
        id: (existingRow as { id?: string } | null)?.id,
        user_id: user.id,
        total_contacts: totalContacts,
        imported_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("id, user_id, total_contacts, imported_at, updated_at")
    .single();

  if (upsertError) {
    console.error("Failed to update contact import status", upsertError);
    return NextResponse.json(
      { error: "Unable to update contacts." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      contactImport: mapContactImportStatus(
        upsertedRow as Parameters<typeof mapContactImportStatus>[0]
      ),
      matchedProfiles,
      unmatchedContacts,
    },
    { status: 200 }
  );
}
