import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getSupabaseServer } from "@/lib/supabase";
import { MonumentDetail } from "@/components/monuments/MonumentDetail";
import type { MonumentNote } from "@/lib/types/monument-note";

interface MonumentDetailPageProps {
  params: {
    id: string;
  };
}

export default async function MonumentDetailPage({
  params,
}: MonumentDetailPageProps) {
  const cookieStore = cookies();
  const supabase = getSupabaseServer(cookieStore);

  if (!supabase) {
    redirect("/auth");
  }

  const [monumentResult, authResult] = await Promise.all([
    supabase
      .from("monuments")
      .select("id,title,emoji")
      .eq("id", params.id)
      .single(),
    supabase.auth.getUser(),
  ]);

  const { data: monument, error: monumentError } = monumentResult;
  const {
    data: authData,
    error: authError,
  } = authResult ?? { data: { user: null }, error: null };

  if (monumentError || !monument) {
    notFound();
  }

  const user = authData?.user ?? null;

  if (authError || !user) {
    redirect("/auth");
  }

  const { data: notesData, error: notesError } = await supabase
    .from("notes")
    .select("id,title,content,monument_id,created_at,updated_at")
    .eq("user_id", user.id)
    .eq("monument_id", params.id)
    .order("created_at", { ascending: true });

  if (notesError) {
    console.error("Failed to load monument notes", {
      error: notesError,
      monumentId: params.id,
      userId: user.id,
    });
  }

  const notes: MonumentNote[] = (notesData ?? []).map((row) => ({
    id: row.id,
    monumentId: row.monument_id ?? "",
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return <MonumentDetail monument={monument} notes={notes} />;
}

