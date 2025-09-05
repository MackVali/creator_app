import React from "react";

export function MonoCard({emoji,title,value}:{emoji:string;title:string;value:number;}){
  return (
    <div className="mr-3 flex h-[140px] w-[120px] flex-none snap-start flex-col items-center justify-between rounded-lg border border-border bg-card p-3 text-texthi transition-colors duration-150 hover:-translate-y-px hover:bg-cardho focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border">
      <div
        className="grid h-12 w-12 place-items-center rounded-full bg-pill text-2xl text-icon"
        aria-hidden="true"
      >
        {emoji}
      </div>
      <div className="mt-2 text-center text-sm font-medium">{title}</div>
      <div className="text-lg font-extrabold">{value}</div>
    </div>
  );
}
