import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { CatRow } from "@/lib/data/cats";
import { SkillRow } from "@/lib/data/skills";
import SkillCard from "@/components/skills/SkillCard";
import { cn } from "@/lib/utils";

interface Props {
  cat: CatRow | { id: "null"; name: string };
  skills: SkillRow[];
}

export function CategorySection({ cat, skills }: Props) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-slate-900/60 ring-1 ring-white/10 rounded-2xl shadow-[inset_0_1px_rgba(255,255,255,.06),0_8px_24px_rgba(0,0,0,.45)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between p-4"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{cat.name}</span>
          <span className="text-xs px-2 rounded-full bg-white/10 text-white/80">
            {skills.length}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-white/70 transition-transform",
            open ? "rotate-180" : ""
          )}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 space-y-2">
          {skills.length ? (
            skills.map((skill) => (
              <SkillCard
                key={skill.id}
                id={skill.id}
                icon={skill.icon ?? ""}
                name={skill.name}
                level={skill.level ?? undefined}
                percent={0}
              />
            ))
          ) : (
            <p className="text-sm text-white/60">No skills yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default CategorySection;
