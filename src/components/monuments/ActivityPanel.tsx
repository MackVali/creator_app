import { Card } from "@/components/ui/card";

export default function ActivityPanel() {
  return (
    <Card className="rounded-2xl border border-white/10 bg-[#0F1623] p-5">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-white/60">
          Activity
        </p>
        <h3 className="text-lg font-semibold text-white">Recent progress</h3>
        <p className="text-xs text-white/60">
          As you add milestones, notes, or goals, updates will collect here.
        </p>
      </div>
      <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-[#101b2a] p-4 text-sm text-white/60">
        <p className="font-medium text-white">No activity yet</p>
        <p className="mt-1 text-xs text-white/60">
          Make your first update to start a running log of wins.
        </p>
      </div>
    </Card>
  );
}
