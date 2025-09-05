"use client";

import { ChevronLeft, ExternalLink, Share2 } from "lucide-react";
import { Profile } from "@/lib/types";

interface HeroHeaderProps {
  profile: Profile;
  onShare?: () => void;
  onBack?: () => void;
}

export default function HeroHeader({
  profile,
  onShare,
  onBack,
}: HeroHeaderProps) {
  const getInitials = (name: string | null, username: string) => {
    if (name) {
      return name
        .split(" ")
        .map((word) => word.charAt(0))
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return username.slice(0, 2).toUpperCase();
  };

  const initials = getInitials(profile.name || null, profile.username);

  // Format tagline with bullet separators
  const formatTagline = (bio: string | null | undefined) => {
    if (!bio) return "Creator • Entrepreneur • Innovator";

    // Split by common separators and join with bullets
    const parts = bio
      .split(/[•,|]/)
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.join(" • ");
  };

  const tagline = formatTagline(profile.bio);

  return (
    <div className="relative">
      {/* Cover Block */}
      <div className="relative h-[200px] overflow-hidden rounded-2xl mx-4 mt-4">
        {profile.banner_url ? (
          <div
            className="w-full h-full bg-cover bg-center"
            style={{ backgroundImage: `url(${profile.banner_url})` }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#1E293B] via-[#222224] to-[#0B1220]" />
        )}

        {/* Overlay gradient for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      </div>

      {/* Top Row - Back, Title, Share */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/30 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2 text-white/80">
          <span className="text-sm font-medium">Bio Link</span>
          <ExternalLink className="w-4 h-4" />
        </div>

        <button
          onClick={onShare}
          className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/30 transition-colors"
        >
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      {/* Profile Info Container */}
      <div className="px-4 -mt-14 relative z-10">
        {/* Avatar */}
        <div className="flex justify-center mb-4">
          <div className="relative">
            <div className="w-[84px] h-[84px] rounded-full overflow-hidden ring-4 ring-slate-900 bg-slate-800">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={`${profile.name || profile.username}'s avatar`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-slate-700 flex items-center justify-center text-white text-2xl font-bold">
                  {initials}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Name and Handle */}
        <div className="text-center mb-3">
          <div className="flex items-center justify-center space-x-2 mb-1">
            <h1 className="text-2xl font-bold text-white">
              {profile.name || profile.username}
            </h1>
            {profile.verified && (
              <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                <svg
                  className="w-3 h-3 text-white"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            )}
          </div>
          <p className="text-white/70 text-lg">@{profile.username}</p>
        </div>

        {/* Tagline */}
        <div className="text-center mb-6">
          <p className="text-white/70 text-base leading-relaxed max-w-md mx-auto line-clamp-2">
            {tagline}
          </p>
        </div>
      </div>
    </div>
  );
}
