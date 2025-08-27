'use client';

import React from 'react';

interface Props {
  name: string;
  emoji: string;
  createdAt?: string | null;
  onEditClick: () => void;
}

export default function MonumentHeader({ name, emoji, createdAt, onEditClick }: Props) {
  const created = createdAt ? new Date(createdAt).toLocaleDateString() : null;
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-900/60 ring-1 ring-white/10 px-4 py-4">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-3xl">
          {emoji}
        </div>
        <div>
          <div className="text-xl font-semibold">{name}</div>
          {created && (
            <div className="text-xs font-normal text-slate-400">Created {created}</div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onEditClick}
        className="text-sm text-blue-400 hover:underline"
      >
        Edit
      </button>
    </div>
  );
}
