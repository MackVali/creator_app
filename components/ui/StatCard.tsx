import React from "react";

interface Props {
  icon: React.ReactNode;
  label: string;
  value: number;
}

export default function StatCard({ icon, label, value }: Props) {
  return (
    <div className="flex flex-col items-start justify-between rounded-2xl border border-white/10 bg-[#151517] p-4 md:p-5 shadow-sm hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 ring-white/30">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/80">
        {icon}
      </div>
      <div className="mt-4 text-sm text-white/80">{label}</div>
      <div className="text-xl font-semibold text-white/90">{value}</div>
    </div>
  );
}
