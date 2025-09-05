import { Trophy, Landmark, Medal, Mountain } from "lucide-react";
import { MonumentCard } from "@/components/ui/MonumentCard";

const monuments = [
  { icon: Trophy, title: "Achievement", count: 5 },
  { icon: Landmark, title: "Legacy", count: 10 },
  { icon: Medal, title: "Triumph", count: 4 },
  { icon: Mountain, title: "Pinnacle", count: 7 },
];

export function MonumentsRow() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-gaplg">
      {monuments.map((m) => (
        <MonumentCard key={m.title} icon={m.icon} title={m.title} count={m.count} />
      ))}
    </div>
  );
}

export default MonumentsRow;
