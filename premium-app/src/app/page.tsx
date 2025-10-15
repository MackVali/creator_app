import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase";
import { cookies } from "next/headers";

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);

  if (!supabase) {
    // If Supabase is not configured, redirect to auth
    redirect("/auth");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    // User is authenticated, redirect to dashboard
    redirect("/dashboard");
  } else {
    // User is not authenticated, redirect to auth
    redirect("/auth");
  }
}
