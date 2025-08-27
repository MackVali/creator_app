'use client';
import { useEffect, useMemo, useState } from 'react';
import FriendsList from './FriendsList';
import type { Friend } from '@/lib/mock/friends';
import { getSupabaseBrowser } from '@/lib/supabase';

export default function SearchFriends({ data }: { data: Friend[] }) {
  const [q, setQ] = useState('');
  const [me, setMe] = useState<Friend | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase?.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setMe({
          id: user.id,
          username:
            user.user_metadata?.username ||
            user.email?.split('@')[0] ||
            'me',
          displayName:
            user.user_metadata?.full_name ||
            user.email ||
            'Me',
          avatarUrl:
            user.user_metadata?.avatar_url ||
            'https://i.pravatar.cc/96?img=67',
        });
      }
    });
  }, []);

  const dataset = useMemo(() => (me ? [me, ...data] : data), [me, data]);
  const filtered = useMemo(() => {
    const v = q.trim().toLowerCase();
    if (!v) return dataset;
    return dataset.filter((f) =>
      f.username.toLowerCase().includes(v) || f.displayName.toLowerCase().includes(v)
    );
  }, [q, dataset]);

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10">
        <label className="block">
          <div className="rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search friends"
              className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
              aria-label="Search friends"
            />
          </div>
        </label>
      </div>

      {filtered.length ? (
        <FriendsList data={filtered} />
      ) : (
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-6 text-center text-sm text-white/60">
          No matches found.
        </div>
      )}
    </div>
  );
}
