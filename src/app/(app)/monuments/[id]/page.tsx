import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase";
import { FilteredGoalsGrid } from "@/components/goals/FilteredGoalsGrid";

interface Monument {
  id: string;
  title: string;
  emoji: string | null;
  created_at: string | null;
}

export default async function MonumentPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = getSupabaseServer(cookies());
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
    .from("monuments")
    .select("id,title,emoji,created_at")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single<Monument>();

  if (error || !data) {
    return <div className="p-4">Monument not found</div>;
  }

  const createdAt = data.created_at
    ? new Date(data.created_at).toLocaleDateString()
    : null;

  return (
    <main className="p-4 space-y-6">
      <header className="text-center">
        <div className="text-6xl mb-2">{data.emoji || "🏛️"}</div>
        <h1 className="text-2xl font-bold">{data.title}</h1>
        {createdAt && (
          <p className="text-sm text-gray-400">Created {createdAt}</p>
        )}
      </header>
      <section>
        <h2 className="text-xl font-semibold mb-4">Related Goals</h2>
        <FilteredGoalsGrid entity="monument" id={params.id} />
      </section>
    </main>
  );
}

