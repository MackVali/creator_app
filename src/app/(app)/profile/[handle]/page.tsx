import type { Metadata } from "next";

import ProfilePageClient from "./ProfilePageClient";
import { loadPublicProfile } from "./loader";

export const metadata: Metadata = {
  title: "Creator profile",
};

interface ProfileByHandlePageProps {
  params: { handle: string };
}

export default async function ProfileByHandlePage({
  params,
}: ProfileByHandlePageProps) {
  const handle = decodeURIComponent(params.handle);
  const result = await loadPublicProfile(handle);

  return <ProfilePageClient handle={handle} loaderResult={result} />;
}
