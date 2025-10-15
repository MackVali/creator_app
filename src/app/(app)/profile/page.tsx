import { redirect } from "next/navigation";
import { getCurrentUser, ensureProfile, getProfile } from "@/lib/db/profiles";
import ProfileContent from "./ProfileContent";

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth");
  }

  await ensureProfile(user.id);

  const profile = await getProfile(user.id);

  if (!profile) {
    redirect("/auth");
  }

  return <ProfileContent profile={profile} userId={user.id} />;
}
