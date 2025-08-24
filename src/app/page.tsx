import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function Page() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/auth");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) {
    redirect("/dashboard");
  } else {
    redirect("/auth");
  }
}
