import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSupabaseServer } from "@/lib/supabase";
import { hasAcceptedLegal } from "@/lib/legal";
import LegalAcceptanceForm from "./LegalAcceptanceForm";

export default async function LegalAcceptPage() {
  const cookieStore = cookies();
  const supabase = getSupabaseServer(cookieStore);
  if (!supabase) {
    redirect("/auth");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;

  if (!user) {
    redirect("/auth");
  }

  const legalAccepted = await hasAcceptedLegal(user.id, supabase);
  if (legalAccepted) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-8 rounded-3xl border border-white/15 bg-white/5 p-10 shadow-lg backdrop-blur-xl">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Legal</p>
          <h1 className="text-3xl font-semibold text-white">
            Accept Terms & Privacy
          </h1>
          <p className="text-sm text-muted-foreground">
            Please acknowledge CREATOR’s Terms of Service and Privacy Policy to keep using the app.
          </p>
        </div>
        <LegalAcceptanceForm />
      </div>
    </div>
  );
}
