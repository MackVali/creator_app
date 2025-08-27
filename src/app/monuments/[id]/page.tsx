'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { getMonumentById, updateMonument, type MonumentRow } from '@/lib/data/monuments';
import { getGoalsByMonument, type GoalRow } from '@/lib/data/goals';
import MonumentHeader from '@/components/monuments/MonumentHeader';
import EditMonumentSheet from '@/components/monuments/EditMonumentSheet';
import FilteredGoalsGrid from '@/components/goals/FilteredGoalsGrid';

export default function MonumentPage() {
  const params = useParams();
  const id = params?.id as string;
  const [userId, setUserId] = useState<string | null>(null);
  const [monument, setMonument] = useState<MonumentRow | null>(null);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async (uid: string, monId: string) => {
    setLoading(true);
    const mon = await getMonumentById(uid, monId);
    setMonument(mon);
    if (mon) {
      const gs = await getGoalsByMonument(uid, monId);
      setGoals(gs);
    } else {
      setGoals([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    sb.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (uid && id) {
        setUserId(uid);
        load(uid, id);
      } else {
        setLoading(false);
      }
    });
  }, [id, load]);

  const handleSave = async (patch: { name: string; emoji: string }) => {
    if (!userId || !id) return;
    const updated = await updateMonument(userId, id, patch);
    setMonument(updated);
    const gs = await getGoalsByMonument(userId, id);
    setGoals(gs);
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="h-24 rounded-2xl bg-slate-900/60 ring-1 ring-white/10 animate-pulse" />
        <FilteredGoalsGrid.Skeleton />
      </div>
    );
  }

  if (!monument) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-slate-400">Monument not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <MonumentHeader
        name={monument.name}
        emoji={monument.emoji}
        createdAt={monument.created_at}
        onEditClick={() => setOpen(true)}
      />
      <EditMonumentSheet
        open={open}
        onClose={() => setOpen(false)}
        initial={{ name: monument.name, emoji: monument.emoji }}
        onSave={async (patch) => {
          await handleSave(patch);
          setOpen(false);
        }}
      />
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Related Goals</h2>
        <FilteredGoalsGrid goals={goals} />
      </div>
    </div>
  );
}
