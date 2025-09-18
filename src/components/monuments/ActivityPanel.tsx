import { Card } from "@/components/ui/card";

export default function ActivityPanel() {
  return (
    <Card className="rounded-3xl border border-white/8 bg-[#101725] px-6 py-6 shadow-[0_18px_48px_rgba(3,7,18,0.55)]">
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-white/60">Activity</p>
        <h3 className="text-xl font-semibold text-white">Recent progress</h3>
        <p className="text-sm text-white/60">
          As you add milestones, notes, or goals, we&apos;ll surface the latest updates so you can see momentum at a glance.
        </p>
      </div>
      <div className="relative mt-6 rounded-2xl border border-dashed border-white/15 bg-white/5 px-5 py-6 text-white/70">
        <div className="absolute left-5 top-6 bottom-6 w-px bg-white/10" aria-hidden="true" />
        <div className="relative pl-8">
          <span className="absolute left-0 top-1 size-3 rounded-full bg-white/40" aria-hidden="true" />
          <p className="text-base font-medium text-white">No activity yet</p>
          <p className="mt-1 text-sm text-white/70">
            Make your first update to start this timeline of wins.
          </p>
        </div>
      </div>
    </Card>
  );
}
