import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Skill } from "@/types/skills";

export async function getMySkills(): Promise<Skill[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Failed to create Supabase client");
  
  const { data, error } = await supabase.from("skills").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// optional monuments for dropdown
export async function getMyMonuments() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Failed to create Supabase client");
  
  const { data, error } = await supabase.from("monuments").select("id,title").order("title");
  if (error) throw error;
  return data ?? [];
}

export async function createSkill(input: { name: string; icon: string; monument_id: string | null }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Failed to create Supabase client");
  
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) throw new Error("Not signed in");
  
  const { data, error } = await supabase
    .from("skills")
    .insert({ ...input, level: 1, user_id: auth.user.id })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
