"use client";

import { forwardRef, useEffect, useImperativeHandle, useState, useCallback, type Ref } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSupabaseBrowser } from "@/lib/supabase";

interface Milestone {
  id: string;
  title: string;
}

export interface MilestonesPanelHandle {
  addMilestone: () => void;
}

interface MilestonesPanelProps {
  monumentId: string;
  onAutoSplit: () => void;
}

function MilestonesPanelInternal(
  { monumentId, onAutoSplit }: MilestonesPanelProps,
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
    setMilestones(data ?? []);
    setLoading(false);
  }, [supabase, monumentId]);

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
      className="rounded-2xl border border-white/10 bg-[#0F1623] p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-white/60">
            Milestones
          </p>
          <h3 className="text-lg font-semibold text-white">Break the work down</h3>
          <p className="text-xs text-white/60">
            Outline the wins that will move this monument forward.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleAdd}
            aria-label="Add milestone"
            className="rounded-md border-white/20 bg-white/5 text-white hover:border-white/30 hover:bg-white/15"
          >
            Add milestone
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onAutoSplit}
            aria-label="Auto split milestones"
            className="rounded-md border-white/15 bg-transparent text-white/80 hover:border-white/25 hover:bg-white/10"
          >
            Auto split
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-12 rounded-lg border border-white/10 bg-white/5"
              />
            ))}
          </div>
        ) : hasMilestones ? (
          <ul className="space-y-3">
            {milestones.map((m, index) => (
              <li
                key={m.id}
                className="group flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white transition hover:border-white/20 hover:bg-white/10"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white/70">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-sm font-medium">{m.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#101b2a] px-4 py-5 text-white/70">
            <p className="text-sm font-medium text-white">No milestones yet</p>
            <p className="mt-1 text-xs text-white/60">
              Start by adding the first key step for this monument.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

const MilestonesPanel = forwardRef(MilestonesPanelInternal);

export default MilestonesPanel;

