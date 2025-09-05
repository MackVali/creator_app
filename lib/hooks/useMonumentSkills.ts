import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

interface MonumentSkill {
  id: string;
  name: string;
  icon: string | null;
  level: number | null;
  percent: number;
}

export function useMonumentSkills(monumentId: string) {
  const [skills, setSkills] = useState<MonumentSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase || !monumentId) return;
      setLoading(true);
      setError(null);
      try {
        await supabase.auth.getSession();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        const { data, error } = await supabase
          .from("skills")
          .select("id,name,icon,level")
          .eq("user_id", user.id)
          .eq("monument_id", monumentId)
          .order("name", { ascending: true });

        if (error) throw error;
        if (!cancelled) {
          const formatted = (data || []).map((s) => ({
            id: s.id,
            name: s.name || "Unnamed",
            icon: s.icon,
            level: s.level,
            percent: 0,
          }));
          setSkills(formatted);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error loading skills:", err);
          setError("Failed to load related skills");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, monumentId]);

  return { skills, loading, error };
}

export default useMonumentSkills;

