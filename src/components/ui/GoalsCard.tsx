import React from "react";

export function GoalsCard({items}:{items:string[];}){
  return (
    <div className="card mx-4 p-4">
      <ul className="space-y-2">
        {items.map((t, i)=> (
          <li key={i} className="flex gap-2">
            <span className="mt-[6px] text-lg leading-none">•</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
