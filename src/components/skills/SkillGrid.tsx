import { Skill } from "@/types/skills";
import { SkillCard } from "./SkillCard";

export function SkillGrid({ skills, emptyMessage }: { skills: Skill[]; emptyMessage: string }) {
  if (!skills?.length) {
    return <div className="text-sm text-muted-foreground">{emptyMessage}</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {skills.map((s) => <SkillCard key={s.id} skill={s} />)}
    </div>
  );
}
