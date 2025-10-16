import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PublicProfileView from "@/components/profile/PublicProfileView";
import { getPublicProfileReadModel } from "@/lib/profile/public-profile";

interface ProfilePageProps {
  params: {
    handle: string;
  };
}

export const revalidate = 120;

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const handle = decodeURIComponent(params.handle ?? "");

  if (!handle) {
    return {
      title: "Creator profile",
      description: "Explore cinematic creator profiles on Creator App.",
    };
  }

  try {
    const readModel = await getPublicProfileReadModel(handle);

    if (!readModel) {
      return {
        title: "Creator not found",
        description: "We couldn't find a public profile for that handle.",
      };
    }

    const { profile } = readModel;
    const displayName = profile.name?.trim() || profile.username;
    const title = `${displayName} • Creator Profile`;
    const description =
      profile.tagline?.trim() ||
      profile.bio?.split("\n")[0]?.trim() ||
      `See the latest launches, offers, and socials from @${profile.username}.`;

    const previewImage = profile.hero_media_url || profile.banner_url || profile.avatar_url || undefined;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `/profile/${profile.username}`,
        images: previewImage
          ? [
              {
                url: previewImage,
                alt: `${displayName}'s profile preview`,
              },
            ]
          : undefined,
      },
      twitter: {
        card: previewImage ? "summary_large_image" : "summary",
        title,
        description,
        images: previewImage ? [previewImage] : undefined,
      },
    };
  } catch (error) {
    console.error("Failed to generate public profile metadata", { handle, error });
    return {
      title: "Creator profile",
      description: "Explore cinematic creator profiles on Creator App.",
    };
  }
}

export default async function PublicProfilePage({ params }: ProfilePageProps) {
  const handleParam = params.handle;

  if (!handleParam) {
    notFound();
  }

  const handle = decodeURIComponent(handleParam);

  try {
    const readModel = await getPublicProfileReadModel(handle);

    if (!readModel) {
      notFound();
    }

    return <PublicProfileView readModel={readModel} />;
  } catch (error) {
    console.error("Failed to load public profile route", { handle, error });
    notFound();
  }
}
