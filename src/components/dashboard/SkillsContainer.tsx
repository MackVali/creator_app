import Link from "next/link";
import { Skill } from "@/types/skills";
import { SkillGrid } from "@/components/skills/SkillGrid";

interface SkillsContainerProps {
  skills: Skill[];
}

export default function SkillsContainer({ skills }: SkillsContainerProps) {
  const preview = skills.slice(0, 6);
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/skills" className="text-lg font-semibold hover:underline">Skills</Link>
        <Link href="/skills" className="text-sm text-muted-foreground hover:underline">View All</Link>
      </div>
      <SkillGrid skills={preview} emptyMessage="No skills yet — tap Skills to add." />
    </section>
  );
}
