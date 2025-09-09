import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function MilestonesPanel({ onAdd, onAutoSplit }:{
  onAdd: ()=>void; onAutoSplit: ()=>void;
}) {
  return (
    <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 sm:p-5">
      <h3 className="text-[#E7ECF2] font-medium mb-3">Milestones</h3>
      <p className="text-[#A7B0BD] mb-4">
        No milestones yet. Add your first milestone to start tracking progress.
      </p>
      <div className="flex gap-2">
        <Button onClick={onAdd}>+ Milestone</Button>
        <Button variant="outline" onClick={onAutoSplit}>Auto Split</Button>
      </div>
    </Card>
  );
}
