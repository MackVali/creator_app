"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Friend } from "@/types/friends";
import { DEFAULT_AVATAR_URL } from "@/lib/friends/avatar";

import MessageFriendButton from "./MessageFriendButton";

type FriendRowProps = {
  f: Friend;
  onRemoveFriend?: (friend: Friend) => void;
};

export default function FriendRow({ f, onRemoveFriend }: FriendRowProps) {
  const router = useRouter();
  const linkClassName =
    "group flex flex-1 items-center gap-3 min-w-0 pr-2 transition";
  const defaultProfileHref = `/friends/${encodeURIComponent(f.username)}`;
  const rawProfileUrl = f.profileUrl ?? defaultProfileHref;
  const isInternalProfile = rawProfileUrl.startsWith("/");
  const isExternalProfile = /^https?:\/\//i.test(rawProfileUrl);
  const href = isInternalProfile
    ? rawProfileUrl
    : isExternalProfile
      ? rawProfileUrl
      : defaultProfileHref;
  const title = isExternalProfile ? rawProfileUrl : undefined;
  const statusText = f.isOnline ? "Online now" : "Offline";
  const statusIndicatorClass = f.isOnline
    ? "bg-emerald-500"
    : "bg-white/40";
  const statusTextClass = f.isOnline ? "text-emerald-300" : "text-white/40";
  const displayName = f.displayName || f.username;
  const avatarSrc = f.avatarUrl || DEFAULT_AVATAR_URL;

  const linkBody = (
    <>
      <div className="relative">
        {/* gradient ring */}
        <div
          className={`rounded-full p-[2px] ${
            f.hasRing
              ? "bg-gradient-to-tr from-pink-500 via-fuchsia-500 to-orange-400"
              : "bg-transparent"
          }`}
        >
          <div className="rounded-full bg-black p-[2px]">
            <Image
              alt={`${displayName} avatar`}
              src={avatarSrc}
              width={44}
              height={44}
              className="rounded-full object-cover"
            />
          </div>
        </div>
        <span className="absolute bottom-0 right-0 flex h-3 w-3 items-center justify-center rounded-full ring-2 ring-black">
          <span className={`h-2 w-2 rounded-full ${statusIndicatorClass}`} aria-hidden />
          <span className="sr-only">{statusText}</span>
        </span>
      </div>

      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold text-white transition-colors group-hover:text-white/90">
          {f.username}
        </div>
        <div className="truncate text-xs text-white/60 transition-colors group-hover:text-white/70">
          {displayName}
        </div>
        <div
          className={`mt-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${statusTextClass}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusIndicatorClass}`} aria-hidden />
          <span>{statusText}</span>
        </div>
      </div>
    </>
  );

  return (
    <li className="flex items-center justify-between gap-3 px-2">
      {/* LEFT: avatar + names */}
      <Link
        href={href}
        className={linkClassName}
        prefetch={false}
        aria-label={`View ${displayName}'s profile — ${statusText}`}
        title={title}
      >
        {linkBody}
      </Link>

      {/* RIGHT: actions */}
      <div className="flex items-center gap-2 shrink-0">
        <MessageFriendButton
          friend={f}
          className="rounded-xl bg-white/10 px-3 py-1.5 text-xs text-white transition hover:bg-white/15 active:scale-[0.98]"
          aria-label={`Message ${f.username}`}
        >
          Message
        </MessageFriendButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full p-2 text-white/70 transition hover:bg-white/10 active:scale-95"
              aria-label="More"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/70" />
              <span className="mx-0.5 inline-block h-1.5 w-1.5 rounded-full bg-white/70" />
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44 border-white/10 bg-slate-900/95 text-white shadow-xl backdrop-blur"
          >
            <DropdownMenuItem
              onSelect={() => {
                router.push(href);
              }}
              className="focus:bg-white/10 focus:text-white"
            >
              View profile
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                onRemoveFriend?.(f);
              }}
            >
              Remove friend
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
