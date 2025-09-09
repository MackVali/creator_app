import { Card } from "@/components/ui/card";

export default function ActivityPanel() {
  return (
    <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 sm:p-5 shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
      <h3 className="text-[#E7ECF2] font-medium mb-3">Activity</h3>
      <div className="relative pl-6">
        <div className="absolute left-2 top-0 bottom-0 w-px bg-white/10" />
        <p className="text-[#A7B0BD]">No activity yet. Progress will appear here once milestones or goals are updated.</p>
      </div>
    </Card>
  );
}
