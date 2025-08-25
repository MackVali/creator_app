import { getMySkills, getMyMonuments } from "@/data/skills";
import { SkillGrid } from "@/components/skills/SkillGrid";
import { CreateSkillButton } from "@/components/skills/CreateSkillButton";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const [skills, monuments] = await Promise.all([getMySkills(), getMyMonuments()]);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Skills</h1>
        <CreateSkillButton monuments={monuments} />
      </div>
      <SkillGrid skills={skills} emptyMessage="No skills yet. Create your first one." />
    </main>
  );
}
