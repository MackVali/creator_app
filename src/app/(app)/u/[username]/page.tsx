import { Suspense } from "react";
import PublicProfileContent from "./PublicProfileContent";
import { ProfileSkeleton } from "@/components/profile/ProfileSkeleton";

interface PublicProfilePageProps {
  params: Promise<{
    username: string;
  }>;
}

export default async function PublicProfilePage({
  params,
}: PublicProfilePageProps) {
  const { username } = await params;

  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <PublicProfileContent username={username} />
    </Suspense>
  );
}
