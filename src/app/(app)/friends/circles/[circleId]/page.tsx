import CircleDetailClient from "./CircleDetailClient";
import { userHasAppManagerAccess } from "@/lib/auth/userRoles";
import { getSupabaseServer } from "@/lib/supabase";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type CircleDetailPageProps = {
  params: Promise<{
    circleId: string;
  }>;
};

export default async function CircleDetailPage({
  params,
}: CircleDetailPageProps) {
  const [{ circleId }, cookieStore] = await Promise.all([params, cookies()]);
  const supabase = getSupabaseServer(cookieStore);

  if (!supabase) {
    redirect("/friends?tab=circles");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !userHasAppManagerAccess(user)) {
    redirect("/friends?tab=circles");
  }

  return <CircleDetailClient circleId={circleId} />;
}
