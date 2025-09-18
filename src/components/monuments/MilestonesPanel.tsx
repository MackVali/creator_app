"use client";

import { forwardRef, useEffect, useImperativeHandle, useState, useCallback, type Ref } from "react";
import { Plus, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowser } from "@/lib/supabase";

interface Milestone {
  id: string;
  title: string;
}

export interface MilestonesPanelHandle {
  addMilestone: () => Promise<void>;
}

interface MilestonesPanelProps {
  monumentId: string;
  onAutoSplit: () => void;
  onMilestonesChange?: (count: number) => void;
}

function MilestonesPanelInternal(
  { monumentId, onAutoSplit, onMilestonesChange }: MilestonesPanelProps,
  ref: Ref<MilestonesPanelHandle>
) {
  const supabase = getSupabaseBrowser();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMilestones = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    await supabase.auth.getSession();
    const { data, error } = await supabase
      .from("milestones")
      .select("id,title")
      .eq("monument_id", monumentId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error(error);
    }
    const loaded = data ?? [];
    setMilestones(loaded);
    onMilestonesChange?.(loaded.length);
    setLoading(false);
  }, [supabase, monumentId, onMilestonesChange]);

  useEffect(() => {
    loadMilestones();
  }, [loadMilestones]);

  const handleAdd = async () => {
    if (!supabase) return;
    const title = window.prompt("Milestone title");
    if (!title) return;
    await supabase.auth.getSession();
    const { error } = await supabase
      .from("milestones")
      .insert({ monument_id: monumentId, title });
    if (error) {
      console.error(error);
      return;
    }
    await loadMilestones();
  };

  useImperativeHandle(ref, () => ({
    addMilestone: handleAdd,
  }));

  const hasMilestones = milestones.length > 0;

  return (
    <Card
      id="monument-milestones"
      className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,#050505_0%,#0f0f0f_55%,#191919_100%)] p-5 text-slate-100 shadow-[0_40px_120px_rgba(0,0,0,0.55)] sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Milestones</h3>
          <p className="text-sm text-slate-400">
            Break this monument into celebratory, trackable steps.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={handleAdd} aria-label="Add milestone">
            <Plus className="h-4 w-4" />
            Milestone
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onAutoSplit}
            aria-label="Auto split milestones"
            className="border-white/20 text-slate-200 hover:bg-gray-800"
          >
            <Wand2 className="h-4 w-4" />
            Auto split
          </Button>
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="text-sm text-slate-400">Loading milestones...</p>
        ) : hasMilestones ? (
          <ul className="space-y-3">
            {milestones.map((m, index) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[linear-gradient(135deg,#080808_0%,#121212_55%,#1a1a1a_100%)] px-4 py-3 text-sm text-slate-100 transition-colors hover:brightness-110"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-800 text-sm font-semibold text-slate-200">
                  {index + 1}
                </span>
                <span className="font-medium leading-snug">{m.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/15 bg-[linear-gradient(135deg,#080808_0%,#131313_55%,#1c1c1c_100%)] p-4 text-sm text-slate-400">
            No milestones yet. Add your first milestone to start tracking progress.
          </div>
        )}
      </div>
    </Card>
  );
}

const MilestonesPanel = forwardRef(MilestonesPanelInternal);

export default MilestonesPanel;

