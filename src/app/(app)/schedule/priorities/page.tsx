import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { getSupabaseServer } from "@/lib/supabase";
import PriorityEditorClient from "./PriorityEditorClient";
import { loadPriorityEditorProps } from "./data";

export const runtime = "nodejs";

export default async function PriorityEditorPage() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer({
    get: (name) => cookieStore.get(name),
  });

  if (!supabase) {
    redirect("/auth");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth");
  }

  const priorityEditorProps = await loadPriorityEditorProps(supabase, user.id);

  return (
    <ProtectedRoute>
      <PriorityEditorClient {...priorityEditorProps} />
    </ProtectedRoute>
  );
}
