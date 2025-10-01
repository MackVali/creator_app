import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import {
  MonumentDetail,
  type MonumentDetailMonument,
} from "@/components/monuments/MonumentDetail";
import { getSupabaseServer } from "@/lib/supabase";

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
    return notFound();
  }

  const { data: monument, error } = await supabase
    .from("monuments")
    .select("id,title,emoji")
    .eq("id", params.id)
    .single<MonumentDetailMonument>();

  if (error || !monument) {
    return notFound();
  }

  return <MonumentDetail monument={monument} />;
}

