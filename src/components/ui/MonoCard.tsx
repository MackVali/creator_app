import React from "react";

export function MonoCard({emoji,title,value}:{emoji:string;title:string;value:number;}){
  return (
    <div className="card snap-start w-[120px] h-[140px] p-3 flex-none flex flex-col items-center justify-between mr-3">
      <div
        className="w-12 h-12 rounded-full bg-[#0c0f14] border border-white/10 grid place-items-center text-2xl"
        aria-hidden="true"
      >
        {emoji}
      </div>
      <div className="text-sm font-semibold text-center mt-2">{title}</div>
      <div className="text-lg font-extrabold text-[#cfd6dd]">{value}</div>
    </div>
  );
}
