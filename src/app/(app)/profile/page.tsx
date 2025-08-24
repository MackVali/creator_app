import { redirect } from "next/navigation";
import { getCurrentUser, ensureProfile, getProfile } from "@/lib/db/profiles";
import ProfileContent from "./ProfileContent";

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth");
  }

  // Ensure profile exists
  await ensureProfile(user.id);

  // Get the profile
  const profile = await getProfile(user.id);

  if (!profile) {
    redirect("/auth");
  }

  return <ProfileContent profile={profile} userId={user.id} />;
}
