import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  mapContactImportStatus,
  mapDiscoveryProfile,
  mapFriendInvite,
  mapSuggestedFriend,
} from "@/lib/friends/mappers";
import { getSupabaseServer } from "@/lib/supabase";

export async function GET() {
  const cookieStore = cookies();
  const supabase = getSupabaseServer({
    get: (name: string) => cookieStore.get(name),
    set: () => {},
  });

  if (!supabase) {
    return NextResponse.json(
      {
        contactImport: mapContactImportStatus(null),
        invites: [],
        discoveryProfiles: [],
        suggestions: [],
      },
      { status: 200 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      {
        contactImport: mapContactImportStatus(null),
        invites: [],
        discoveryProfiles: [],
        suggestions: [],
      },
      { status: 200 }
    );
  }

  const {
    data: contactRow,
    error: contactError,
  } = await supabase
    .from("friend_contact_imports")
    .select("id, user_id, total_contacts, imported_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (contactError) {
    console.error("Failed to load contact import status", contactError);
  }

  const contactImport = mapContactImportStatus(contactRow ?? null);

  const {
    data: inviteRows,
    error: invitesError,
  } = await supabase
    .from("friend_invites")
    .select(
      "id, user_id, email, status, sent_at, last_sent_at, sent_count, responded_at, cancelled_at, created_at, updated_at"
    )
    .eq("user_id", user.id)
    .order("last_sent_at", { ascending: false });

  if (invitesError) {
    console.error("Failed to load friend invites", invitesError);
  }

  const invites = (inviteRows ?? []).map(mapFriendInvite);

  const {
    data: discoveryRows,
    error: discoveryError,
  } = await supabase
    .from("friend_discovery_profiles")
    .select(
      "id, username, display_name, avatar_url, role, highlight, reason, mutual_friends"
    )
    .order("mutual_friends", { ascending: false })
    .limit(20);

  if (discoveryError) {
    console.error("Failed to load discovery profiles", discoveryError);
  }

  const discoveryProfiles = (discoveryRows ?? []).map(mapDiscoveryProfile);
  const suggestions = (discoveryRows ?? []).map(mapSuggestedFriend);

  return NextResponse.json(
    { contactImport, invites, discoveryProfiles, suggestions },
    { status: 200 }
  );
}
