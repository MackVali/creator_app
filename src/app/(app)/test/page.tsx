import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ToastTestPanel from "./ToastTestPanel";
import { userIsAdmin } from "@/lib/auth/userRoles";
import { getSupabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Test",
};

export default async function TestPage() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);

  if (!supabase) {
    redirect("/");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  if (!userIsAdmin(user)) {
    redirect("/settings");
  }

  return <ToastTestPanel />;
}
