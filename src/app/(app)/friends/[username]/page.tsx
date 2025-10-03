import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import MessageFriendButton from "@/components/friends/MessageFriendButton";
import { MOCK_FRIENDS } from "@/lib/mock/friends";

function getFriend(username: string) {
  const normalized = decodeURIComponent(username).toLowerCase();
  return MOCK_FRIENDS.find((friend) => friend.username.toLowerCase() === normalized);
}

export function generateMetadata({ params }: { params: { username: string } }): Metadata {
  const friend = getFriend(params.username);

  if (!friend) {
    return {
      title: "Friend profile",
    };
  }

  return {
    title: `${friend.displayName} (@${friend.username})`,
    description: `Explore ${friend.displayName}'s profile highlights and connect without leaving Creator Studio.`,
  };
}

export default function FriendProfilePage({ params }: { params: { username: string } }) {
  const friend = getFriend(params.username);

  if (!friend) {
    notFound();
  }

  const isExternalProfile = /^https?:\/\//i.test(friend.profileUrl);
  const firstName = friend.displayName.split(" ")[0] || friend.displayName;

  let externalDomain: string | null = null;
  if (isExternalProfile) {
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
                    src={friend.avatarUrl}
                    alt={`${friend.displayName} avatar`}
                    width={132}
                    height={132}
                    className="h-32 w-32 rounded-full object-cover"
                    priority
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-3xl font-semibold text-white">{friend.displayName}</h1>
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
                Get a closer look at {friend.displayName} and their creator presence before jumping out to their public profile.
                Review their status, see what is new, and decide how you want to connect.
              </p>

              <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-start">
                <MessageFriendButton
                  friend={friend}
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-2 text-sm font-semibold text-slate-950 transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                >
                  Message {firstName}
                </MessageFriendButton>
                {isExternalProfile ? (
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
            <p className="mt-3 text-base font-medium text-white">
              Prefer to explore outside the app?
            </p>
            {isExternalProfile ? (
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
