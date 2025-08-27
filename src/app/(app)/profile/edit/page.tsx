import ProfileEditForm from "./ProfileEditForm";
import { ensureProfile, getCurrentUser } from "@/lib/db/profiles";
import { redirect } from "next/navigation";

export default async function EditProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth");
  }
  const profile = await ensureProfile(user.id);
  if (!profile) {
    redirect("/profile");
  }
  return <ProfileEditForm profile={profile} userId={user.id} />;
}
