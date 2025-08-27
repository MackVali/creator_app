'use client';

import React, { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  initial: { name: string; emoji: string };
  onSave: (patch: { name: string; emoji: string }) => Promise<void>;
}

export default function EditMonumentSheet({ open, onClose, initial, onSave }: Props) {
  const [name, setName] = useState(initial.name);
  const [emoji, setEmoji] = useState(initial.emoji);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initial.name);
      setEmoji(initial.emoji);
      setError(null);
    }
  }, [open, initial]);

  if (!open) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), emoji });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/90" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-sm bg-slate-900 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Edit Monument</h2>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await handleSave();
            if (!error) onClose();
          }}
        >
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              type="text"
              required
              maxLength={80}
              className="w-full rounded border border-slate-700 bg-slate-800 p-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="emoji">
              Emoji
            </label>
            <input
              id="emoji"
              type="text"
              className="w-full rounded border border-slate-700 bg-slate-800 p-2"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 text-sm rounded-md text-slate-300 hover:bg-slate-800"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 text-sm rounded-md bg-blue-600 text-white disabled:opacity-50"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
