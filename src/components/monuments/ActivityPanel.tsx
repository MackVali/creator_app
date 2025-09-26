import { Card } from "@/components/ui/card";

export default function ActivityPanel() {
  return (
    <Card className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] p-6 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.78)] sm:p-7 text-white gap-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.1),_transparent_60%)]" />
      <div className="relative space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-white/60">
          Activity
        </p>
        <h3 className="text-lg font-semibold text-white sm:text-xl">Recent progress</h3>
        <p className="text-xs text-white/70 sm:text-sm">
          As you add notes or goals, updates will collect here.
        </p>
      </div>
      <div className="relative mt-6 rounded-2xl border border-dashed border-white/20 bg-white/5 px-5 py-6 text-sm text-white/70">
        <p className="font-medium text-white">No activity yet</p>
        <p className="mt-2 text-xs text-white/60">
          Make your first update to start a running log of wins.
        </p>
      </div>
    </Card>
  );
}
