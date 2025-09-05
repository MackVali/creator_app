import { LucideIcon } from "lucide-react";

interface MonumentCardProps {
  icon: LucideIcon;
  title: string;
  count: number;
}

export function MonumentCard({ icon: Icon, title, count }: MonumentCardProps) {
  return (
    <div className="transition-transform duration-150 hover:-translate-y-px">
      <div className="bg-card rounded-lg border border-border p-4 text-center hover:bg-cardho">
        <Icon className="mx-auto mb-3 h-7 w-7 text-icon" aria-hidden />
        <h3 className="text-texthi text-[15px] font-medium">{title}</h3>
        <div className="mt-1 text-textmed text-[12px]">{count}</div>
      </div>
    </div>
  );
}
