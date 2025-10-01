import Link from "next/link";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase";
import {
  MonumentsList,
  type Monument,
} from "@/components/monuments/MonumentsList";
import { MonumentsEmptyState } from "@/components/ui/empty-state";

export default async function MonumentsPage() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);

  let monuments: Monument[] = [];

  if (supabase) {
    const { data, error } = await supabase
      .from("monuments")
      .select("id,title,emoji")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load monuments", error);
    }

    monuments = data ?? [];
  }

  return (
    <main className="p-4 space-y-4">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Monuments</h1>
        <Link
          href="/monuments/new"
          className="rounded-full bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black"
        >
          + Add Monument
        </Link>
      </div>

      {monuments.length > 0 ? (
        <MonumentsList monuments={monuments} createHref="/monuments/new" />
      ) : (
        <MonumentsEmptyState createHref="/monuments/new" />
      )}
    </main>
  );
}

