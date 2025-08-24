import { redirect } from "next/navigation";
import { getCurrentUser, getProfile } from "@/lib/db/profiles";
import ProfileEditForm from "./ProfileEditForm";

export default async function ProfileEditPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth");
  }

  const profile = await getProfile(user.id);

  if (!profile) {
    redirect("/profile");
  }

  return <ProfileEditForm profile={profile} userId={user.id} />;
}
