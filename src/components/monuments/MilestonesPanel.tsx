"use client";

import { forwardRef, useEffect, useImperativeHandle, useState, useCallback, type Ref } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
      className="rounded-2xl border border-white/5 bg-[#111520] p-4 sm:p-5 shadow-[0_6px_24px_rgba(0,0,0,0.35)]"
    >
      <h3 className="text-[#E7ECF2] font-medium mb-3">Milestones</h3>
      {loading ? (
        <p className="text-[#A7B0BD] mb-4">Loading...</p>
      ) : hasMilestones ? (
        <ul className="mb-4 space-y-2">
          {milestones.map((m) => (
            <li key={m.id} className="text-[#E7ECF2]">
              {m.title}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[#A7B0BD] mb-4">
          No milestones yet. Add your first milestone to start tracking progress.
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={handleAdd} aria-label="Add milestone">
          + Milestone
        </Button>
        <Button
          variant="outline"
          onClick={onAutoSplit}
          aria-label="Auto split milestones"
        >
          Auto Split
        </Button>
      </div>
    </Card>
  );
}

const MilestonesPanel = forwardRef(MilestonesPanelInternal);

export default MilestonesPanel;

