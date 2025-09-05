import ScheduleList from "@/components/schedule/ScheduleList";

export default function SchedulePage(){
  return (
    <div className="min-h-screen bg-app-bg text-white">
      <header className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-extrabold tracking-tight">Schedule</h1>
          <div className="opacity-70 text-sm">mackvali</div>
        </div>
        <div className="mt-2 flex gap-2">
          {["Month","Week","Day","Focus"].map((t,i)=>(
            <button key={t}
              className={`pill rounded-full border border-white/10 bg-white/[0.04] text-white/70 hover:text-white hover:bg-white/10 transition
              ${i===2 ? "bg-white/12 text-white border-white/20" : ""}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="mt-3 text-xs text-white/60">Thursday, September 4, 2025</div>
      </header>

      {/* Full-bleed list (no white container) */}
      <ScheduleList />
    </div>
  );
}
