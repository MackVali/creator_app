"use client";
import { useMemo } from "react";
import { LucideFeather, LucideUtensils, LucideBriefcase, LucideDumbbell, LucideBookOpen, LucideClapperboard, LucideFlower } from "lucide-react";

type Row = { id:string; hour:string; items: EventItem[] };
type EventItem = {
  id: string;
  title: string;
  icon: "meditate"|"write"|"lunch"|"meeting"|"design"|"work"|"gym"|"read"|"movie";
  accent?: "none"|"blue"|"violet"|"pink"; // optional thin ring color
};

const ICONS: Record<EventItem["icon"], JSX.Element> = {
  meditate: <LucideFlower size={18} />,
  write: <LucideFeather size={18} />,
  lunch: <LucideUtensils size={18} />,
  meeting: <LucideBriefcase size={18} />,
  design: <LucideBriefcase size={18} />,
  work: <LucideBriefcase size={18} />,
  gym: <LucideDumbbell size={18} />,
  read: <LucideBookOpen size={18} />,
  movie: <LucideClapperboard size={18} />,
};

export default function ScheduleList(){
  const rows: Row[] = useMemo(()=>[
    { id:"h7", hour:"7 AM", items:[ {id:"r1", title:"Meditate", icon:"meditate"} ] },
    { id:"h8", hour:"8 AM", items:[ {id:"r2", title:"Work", icon:"work"} ] },
    { id:"h12a", hour:"12 AM", items:[ {id:"r3", title:"Write Article", icon:"write"} ] },
    { id:"h12p", hour:"12 PM", items:[ {id:"r4", title:"Lunch", icon:"lunch"} ] },
    { id:"h1p", hour:"1 PM", items:[ {id:"r5", title:"Meeting", icon:"meeting"} ] },
    { id:"h4p", hour:"4 PM", items:[ {id:"r6", title:"Design Logo", icon:"design"} ] },
    { id:"h5p", hour:"5 PM", items:[ {id:"r7", title:"Work", icon:"work"} ] },
    { id:"h7p", hour:"7 PM", items:[ {id:"r8", title:"Gym", icon:"gym"} ] },
    { id:"h8p", hour:"8 PM", items:[ {id:"r9", title:"Read", icon:"read"} ] },
    { id:"h9p", hour:"9 PM", items:[ {id:"r10", title:"Watch Movie", icon:"movie"} ] },
  ],[]);

  return (
    <div className="px-3 pb-24">
      {rows.map((row)=>(
        <div key={row.id} className="flex gap-3">
          {/* left rail hour */}
          <div className="w-14 shrink-0 text-[11px] text-white/45 pt-5 text-right">{row.hour}</div>

          {/* stack for that hour */}
          <div className="flex-1 space-y-3 pb-3">
            {row.items.map((it)=>(
              <EventBar key={it.id} item={it}/>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EventBar({ item }:{ item: EventItem }){
  const ring =
    item.accent==="blue"   ? "ring-1 ring-sky-400/40" :
    item.accent==="violet" ? "ring-1 ring-violet-400/40" :
    item.accent==="pink"   ? "ring-1 ring-pink-400/40" :
    "ring-1 ring-white/8";

  return (
    <div
      className={`relative rounded-card bg-app-panel shadow-elev-2 shadow-black/70 border border-white/6 ${ring} card-gloss`}
      onMouseDown={(e)=> (e.currentTarget.style.animation="press .08s ease-out both")}
      onMouseUp={(e)=> (e.currentTarget.style.animation="")}
    >
      {/* inset line for 3D cut */}
      <div className="absolute inset-0 rounded-card shadow-inset-soft pointer-events-none" />

      {/* subtle body gradient */}
      <div className="absolute inset-0 rounded-card bg-gradient-to-b from-white/5 via-transparent to-black/20" />

      {/* content */}
      <div className="relative flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-black/20 border border-white/5 grid place-items-center text-white/80">
            {ICONS[item.icon]}
          </div>
          <div className="text-[16px] font-medium tracking-tight">{item.title}</div>
        </div>

        {/* hollow circular check on right */}
        <button
          aria-label="Complete"
          className="h-7 w-7 rounded-full border border-white/12 bg-black/10 relative overflow-hidden active:scale-95 transition"
        >
          {/* faint gloss ring */}
          <span className="pointer-events-none absolute inset-0 rounded-full border border-white/5 opacity-30" />
        </button>
      </div>

      {/* optional shimmer on long bars (kept subtle) */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[35%] -skew-x-6 opacity-[.05] bg-white animate-shimmer rounded-card" />
    </div>
  );
}
