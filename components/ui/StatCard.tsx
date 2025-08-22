import React from "react";

interface Props {
  icon: React.ReactNode;
  label: string;
  value: number;
}

export default function StatCard({ icon, label, value }: Props) {
  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-white/10 bg-[#151517] p-4 shadow-sm hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 ring-white/30">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 opacity-80">
        {icon}
      </div>
      <div className="text-[15px] md:text-base text-white/85">{label}</div>
      <div className="text-sm font-medium text-white/60">{value}</div>
    </div>
  );
}
