import { CommandPullRefreshShell } from "@/components/command/CommandPullRefreshShell";
import { userHasAppManagerAccess } from "@/lib/auth/userRoles";
import { getSupabaseServer } from "@/lib/supabase";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function CommandPage() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);

  if (!supabase) {
    redirect("/dashboard");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !userHasAppManagerAccess(user)) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4">
      <CommandPullRefreshShell />
    </main>
  );
}
