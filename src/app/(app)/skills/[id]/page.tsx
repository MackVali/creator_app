import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase";
import { FilteredGoalsGrid } from "@/components/goals/FilteredGoalsGrid";

interface Skill {
  id: string;
  name: string;
  icon: string | null;
  created_at: string | null;
}

export default async function SkillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = getSupabaseServer(await cookies());
  if (!supabase) {
    return <div className="p-4">Supabase not configured</div>;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <div className="p-4">Not authenticated</div>;
  }

  const { data, error } = await supabase
    .from("skills")
    .select("id,name,icon,created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<Skill>();

  if (error || !data) {
    return <div className="p-4">Skill not found</div>;
  }

  const createdAt = data.created_at
    ? new Date(data.created_at).toLocaleDateString()
    : null;

  return (
    <main className="p-4 space-y-6">
      <header className="text-center">
        <div className="text-6xl mb-2">{data.icon || "💡"}</div>
        <h1 className="text-2xl font-bold">{data.name}</h1>
        {createdAt && (
          <p className="text-sm text-gray-400">Created {createdAt}</p>
        )}
      </header>
      <section>
        <h2 className="text-xl font-semibold mb-4">Related Goals</h2>
        <FilteredGoalsGrid entity="skill" id={id} />
      </section>
    </main>
  );
}

