'use client';
import Image from 'next/image';
import type { Friend } from '@/lib/mock/friends';

export default function FriendRow({ f }: { f: Friend }) {
  return (
    <li className="flex items-center justify-between gap-3 px-2">
      {/* LEFT: avatar + names */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative">
          {/* gradient ring */}
          <div className={`rounded-full p-[2px] ${f.hasRing ? 'bg-gradient-to-tr from-pink-500 via-fuchsia-500 to-orange-400' : 'bg-transparent'}`}>
            <div className="rounded-full bg-black p-[2px]">
              <Image
                alt={`${f.displayName} avatar`}
                src={f.avatarUrl}
                width={44}
                height={44}
                className="rounded-full object-cover"
              />
            </div>
          </div>
          {f.isOnline && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-black" />}
        </div>

        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-white">{f.username}</div>
          <div className="truncate text-xs text-white/60">{f.displayName}</div>
        </div>
      </div>

      {/* RIGHT: actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          className="rounded-xl bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15 active:scale-[0.98] transition"
          aria-label={`Message ${f.username}`}
        >
          Message
        </button>
        <button
          type="button"
          className="rounded-full p-2 text-white/70 hover:bg-white/10 active:scale-95 transition"
          aria-label="More"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/70"></span>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/70 mx-0.5"></span>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/70"></span>
        </button>
      </div>
    </li>
  );
}
