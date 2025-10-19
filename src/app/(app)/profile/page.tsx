import { redirect } from "next/navigation";

import { ensureProfile, getCurrentUser } from "@/lib/db/profiles";

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth");
  }

  try {
    const profile = await ensureProfile(user.id);

    if (profile?.username?.trim()) {
      redirect(`/profile/${profile.username}`);
    }

    redirect("/profile/edit");
  } catch (error) {
    console.error("Error ensuring profile exists:", error);
    redirect("/profile/edit");
  }

  return null;
}
