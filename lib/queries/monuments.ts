import { getSupabaseBrowser } from "@/lib/supabase";

type SupabaseMonumentRow = {
  id: string;
  Title?: string | null;
  name?: string | null;
};

export interface Monument {
  id: string;
  name: string;
}

export async function getMonumentsForUser(
  userId: string
): Promise<Monument[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("monuments")
    .select("id, Title")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching monuments:", error);
    throw error;
  }

  return (data || []).map((monument: SupabaseMonumentRow) => ({
    id: monument.id,
    name: monument.Title ?? monument.name ?? "",
  }));
}
