import { Activity } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function ActivityPanel() {
  return (
    <Card className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 p-5 text-slate-100 shadow-[0_40px_120px_rgba(15,23,42,0.45)] sm:p-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-15%] top-[-30%] h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Activity</h3>
          <p className="text-sm text-slate-400">
            Updates from milestones, goals, and notes will land here.
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-slate-200">
          <Activity className="h-5 w-5" />
        </div>
      </div>
      <div className="relative mt-6">
        <div className="overflow-hidden rounded-2xl border border-dashed border-white/15 bg-slate-950/50 p-5 text-sm text-slate-400">
          <p className="leading-relaxed">
            You haven’t logged any activity yet. As you add milestones, connect goals, or capture notes, this timeline will keep a history of your progress.
          </p>
        </div>
      </div>
    </Card>
  );
}
