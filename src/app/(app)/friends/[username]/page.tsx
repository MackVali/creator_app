import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import MessageFriendButton from "@/components/friends/MessageFriendButton";
import { DEFAULT_AVATAR_URL } from "@/lib/friends/avatar";
import { mapFriendConnection } from "@/lib/friends/mappers";
import { getSupabaseServer } from "@/lib/supabase";
import type { Friend } from "@/types/friends";

async function fetchFriend(username: string): Promise<Friend | null> {
  const normalized = decodeURIComponent(username).toLowerCase();
  const cookieStore = cookies();
  const supabase = getSupabaseServer({
    get: (name: string) => cookieStore.get(name),
    set: () => {},
  });

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("friend_connections")
    .select(
      "id, friend_user_id, friend_username, friend_display_name, friend_avatar_url, friend_profile_url, has_ring, is_online"
    )
    .eq("user_id", user.id)
    .ilike("friend_username", normalized)
    .maybeSingle();

  if (!data || error) {
    return null;
  }

  const friend = mapFriendConnection(data);

  if (friend.username.toLowerCase() !== normalized) {
    return null;
  }

  return friend;
}

export async function generateMetadata({
  params,
}: {
  params: { username: string };
}): Promise<Metadata> {
  const friend = await fetchFriend(params.username);

  if (!friend) {
    return {
      title: "Friend profile",
    };
  }

  const displayName = friend.displayName || friend.username;

  return {
    title: `${displayName} (@${friend.username})`,
    description: `Explore ${displayName}'s profile highlights and connect without leaving Creator Studio.`,
  };
}

export default async function FriendProfilePage({
  params,
}: {
  params: { username: string };
}) {
  const friend = await fetchFriend(params.username);

  if (!friend) {
    notFound();
  }

  const displayName = friend.displayName || friend.username;
  const isExternalProfile = friend.profileUrl
    ? /^https?:\/\//i.test(friend.profileUrl)
    : false;
  const firstName = displayName.split(" ")[0] || displayName;
  const avatarSrc = friend.avatarUrl ?? DEFAULT_AVATAR_URL;

  let externalDomain: string | null = null;
  if (isExternalProfile && friend.profileUrl) {
    try {
      const url = new URL(friend.profileUrl);
      externalDomain = url.hostname.replace(/^www\./, "");
    } catch {
      externalDomain = null;
    }
  }

  return (
    <main className="relative min-h-screen bg-slate-950 pb-[env(safe-area-inset-bottom)] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-18%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-blue-500/15 blur-[160px]" />
        <div className="absolute bottom-[-25%] right-[-15%] h-[320px] w-[320px] rounded-full bg-purple-500/10 blur-[200px]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 py-12">
        <Link
          href="/friends"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:border-white/20 hover:bg-white/10"
        >
          <span aria-hidden className="text-base">←</span>
          Back to friends
        </Link>

        <section className="mt-8 rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-[0_25px_45px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="mx-auto flex shrink-0 items-center justify-center sm:mx-0">
              <div
                className={`rounded-full p-[3px] ${
                  friend.hasRing
                    ? "bg-gradient-to-tr from-pink-500 via-fuchsia-500 to-orange-400"
                    : "bg-white/10"
                }`}
              >
                <div className="rounded-full bg-slate-950 p-[3px]">
                  <Image
                    src={avatarSrc}
                    alt={`${displayName} avatar`}
                    width={132}
                    height={132}
                    className="h-32 w-32 rounded-full object-cover"
                    priority
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-3xl font-semibold text-white">{displayName}</h1>
              <p className="mt-2 text-sm font-medium text-white/60">@{friend.username}</p>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {friend.hasRing ? (
                  <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-fuchsia-200">
                    Fresh story
                  </span>
                ) : null}
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide ${
                    friend.isOnline
                      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                      : "border-white/10 bg-white/5 text-white/60"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${friend.isOnline ? "bg-emerald-400" : "bg-white/40"}`} />
                  {friend.isOnline ? "Online now" : "Offline"}
                </span>
              </div>

              <p className="mt-5 text-sm leading-relaxed text-white/70">
                Get a closer look at {displayName} and their creator presence before jumping out to their public profile. Review
                their status, see what is new, and decide how you want to connect.
              </p>

              <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-start">
                <MessageFriendButton
                  friend={friend}
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-2 text-sm font-semibold text-slate-950 transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                >
                  Message {firstName}
                </MessageFriendButton>
                {isExternalProfile && friend.profileUrl ? (
                  <a
                    href={friend.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-2 text-sm font-semibold text-white/80 transition hover:border-white/25 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  >
                    View on {externalDomain ?? "profile"}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-white/50">Status</h2>
            <p className="mt-3 text-base font-medium text-white">
              {friend.isOnline
                ? `${firstName} is online right now.`
                : `${firstName} is not online at the moment.`}
            </p>
            <p className="mt-2 text-sm text-white/60">
              {friend.isOnline
                ? "Send a message while they are active to stay at the top of their inbox."
                : "Drop them a note—they will be notified the next time they log in."}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-white/50">Stories</h2>
            <p className="mt-3 text-base font-medium text-white">
              {friend.hasRing ? "New spotlight content available." : "No new spotlight content right now."}
            </p>
            <p className="mt-2 text-sm text-white/60">
              {friend.hasRing
                ? "They have posted recently—check out the latest highlight on their public profile."
                : "Once they share something new, you will see the ring light up here first."}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-white/50">Connect</h2>
            <p className="mt-3 text-base font-medium text-white">Prefer to explore outside the app?</p>
            {isExternalProfile && friend.profileUrl ? (
              <p className="mt-2 text-sm text-white/60">
                Head over to {externalDomain ?? friend.profileUrl} to see their latest public updates, or stay here to keep the
                conversation going.
              </p>
            ) : (
              <p className="mt-2 text-sm text-white/60">
                This creator manages their profile entirely inside Creator Studio. Connect now to see more.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
