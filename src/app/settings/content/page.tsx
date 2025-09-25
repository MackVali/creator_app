import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import TextOverridesManager from "@/components/TextOverridesManager";
import { getSupabaseServer } from "@/lib/supabase";

export const metadata = {
  title: "Content overrides",
};

function userIsAdmin(user: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
} | null) {
  if (!user) return false;

  const possibleRoles = new Set<string>();

  const addRole = (value: unknown) => {
    if (typeof value === "string") {
      possibleRoles.add(value.toLowerCase());
    }
  };

  const addRoles = (values: unknown) => {
    if (Array.isArray(values)) {
      values.forEach((role) => addRole(role));
    }
  };

  addRole(user.user_metadata?.role);
  addRole(user.app_metadata?.role);
  addRoles(user.user_metadata?.roles);
  addRoles(user.app_metadata?.roles);

  if (user.user_metadata?.is_admin === true || user.app_metadata?.is_admin === true) {
    possibleRoles.add("admin");
  }

  return possibleRoles.has("admin");
}

export default async function ContentSettingsPage() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);

  if (!supabase) {
    redirect("/settings");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  if (!userIsAdmin(user)) {
    redirect("/settings");
  }

  return <TextOverridesManager />;
}
