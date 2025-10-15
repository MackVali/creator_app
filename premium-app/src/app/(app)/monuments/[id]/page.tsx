import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getSupabaseServer } from "@/lib/supabase";
import { MonumentDetail } from "@/components/monuments/MonumentDetail";

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

  const { data: monument, error } = await supabase
    .from("monuments")
    .select("id,title,emoji")
    .eq("id", params.id)
    .single();

  if (error || !monument) {
    notFound();
  }

  return <MonumentDetail monument={monument} />;
}

