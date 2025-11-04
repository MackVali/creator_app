"use client";

import { useEffect, useState } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AtSign,
  Calendar,
  CalendarDays,
  MapPin,
  ShieldCheck,
  User,
  type LucideIcon,
} from "lucide-react";
import { getProfileByUsername } from "@/lib/db";
import { Profile } from "@/lib/types";
import LinkedAccountsBar from "@/components/profile/LinkedAccountsBar";

interface PublicProfileContentProps {
  username: string;
}

type Fact = {
  label: string;
  value: string;
  icon: LucideIcon;
};

type Highlight = {
  icon: LucideIcon;
  text: string;
};

export default function PublicProfileContent({
  username,
}: PublicProfileContentProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      try {
        const userProfile = await getProfileByUsername(username);
        if (!isMounted) return;
        if (!userProfile) {
          setError("Profile not found");
          return;
        }
        setProfile(userProfile);
      } catch (err) {
        if (!isMounted) return;
        setError("Failed to load profile");
        console.error("Error loading profile:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [username]);

  if (loading) {
    return <ProfileContentSkeleton />;
  }

  if (error || !profile) {
    return (
      <Card className="rounded-3xl border border-destructive/40 bg-destructive/10 p-0 text-destructive shadow-sm">
        <CardContent className="p-10 text-center">
          <p className="text-lg font-semibold">
            {error || "Profile not found"}
          </p>
          <p className="mt-2 text-sm text-destructive/70">
            The profile you&apos;re looking for may have been moved or is currently unavailable.
          </p>
        </CardContent>
      </Card>
    );
  }

  const initials = getInitials(profile.name, profile.username);
  const formattedDob = formatDate(profile.dob, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const memberSince = formatDate(profile.created_at, {
    month: "long",
    year: "numeric",
  });

  const quickFacts: Fact[] = [
    { label: "Username", value: `@${profile.username}`, icon: AtSign },
  ];

  if (profile.name) {
    quickFacts.unshift({ label: "Name", value: profile.name, icon: User });
  }

  if (formattedDob) {
    quickFacts.push({ label: "Birthday", value: formattedDob, icon: Calendar });
  }

  if (profile.verified) {
    quickFacts.push({ label: "Status", value: "Verified creator", icon: ShieldCheck });
  }

  if (memberSince) {
    quickFacts.push({ label: "Member since", value: memberSince, icon: CalendarDays });
  }

  const highlights: Highlight[] = [];

  if (profile.city) {
    highlights.push({ icon: MapPin, text: profile.city });
  }

  if (memberSince) {
    highlights.push({ icon: CalendarDays, text: `Joined ${memberSince}` });
  }

  return (
    <div className="space-y-10">
      <Card className="relative overflow-hidden rounded-3xl border border-border/40 bg-background/60 p-0 shadow-[0_25px_60px_-40px_rgba(15,23,42,0.65)]">
        <div
          className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent"
          aria-hidden="true"
        />
        <div
          className="absolute -top-20 -right-10 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
          aria-hidden="true"
        />
        <CardContent className="relative flex flex-col gap-8 p-8 sm:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end">
            <div className="flex items-center gap-6">
              <div className="relative inline-flex rounded-[32px] bg-gradient-to-br from-primary/40 via-primary/10 to-transparent p-[3px] shadow-[0_20px_45px_-25px_rgba(59,130,246,0.65)]">
                <Avatar className="h-28 w-28 rounded-[28px] border border-white/10 bg-background/80">
                  {profile.avatar_url ? (
                    <AvatarImage
                      src={profile.avatar_url}
                      alt={`${profile.name || profile.username}'s avatar`}
                      className="object-cover"
                    />
                  ) : null}
                  <AvatarFallback className="rounded-[24px] text-2xl font-semibold uppercase">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-3xl font-semibold sm:text-4xl">
                      {profile.name || profile.username}
                    </h2>
                    {profile.verified ? (
                      <Badge className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-primary shadow-sm">
                        <ShieldCheck className="h-4 w-4" />
                        Verified
                      </Badge>
                    ) : null}
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-background/80 px-3 py-1 text-sm text-muted-foreground shadow-sm">
                    <AtSign className="h-4 w-4 text-primary" />
                    {profile.username}
                  </span>
                </div>
                {profile.bio ? (
                  <p className="max-w-2xl text-base leading-relaxed text-muted-foreground line-clamp-3">
                    {profile.bio}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This creator hasn&apos;t written a bio yet.
                  </p>
                )}
              </div>
            </div>
          </div>
          <LinkedAccountsBar userId={profile.user_id} className="justify-start" />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card className="rounded-3xl border border-border/40 bg-background/60 p-0 shadow-[0_20px_45px_-35px_rgba(15,23,42,0.85)]">
          <CardHeader className="pb-0">
            <CardTitle>
              About {profile.name?.split(" ")[0] ?? profile.username}
            </CardTitle>
            <CardDescription>
              Get to know the person behind the profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {profile.bio ? (
              <p className="text-base leading-relaxed text-muted-foreground">
                {profile.bio}
              </p>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 p-6 text-sm text-muted-foreground">
                {profile.name ? (
                  <>
                    <span className="font-medium text-foreground">{profile.name}</span>{" "}
                    hasn&apos;t added a story yet. Check back soon!
                  </>
                ) : (
                  "This creator hasn&apos;t added a story yet. Check back soon!"
                )}
              </div>
            )}

            {highlights.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Highlights
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {highlights.map(({ icon: Icon, text }) => (
                    <span
                      key={text}
                      className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-background/80 px-3 py-1 text-sm text-foreground shadow-sm"
                    >
                      <Icon className="h-4 w-4 text-primary" />
                      {text}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-border/40 bg-background/60 p-0 shadow-[0_20px_45px_-35px_rgba(15,23,42,0.85)]">
          <CardHeader>
            <CardTitle>Quick facts</CardTitle>
            <CardDescription>The essentials at a glance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {quickFacts.map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="flex items-start gap-3 rounded-2xl border border-border/40 bg-background/80 p-4 shadow-sm"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/30 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {label}
                    </p>
                    <p className="text-base font-semibold text-foreground">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function getInitials(name: string | null | undefined, username: string) {
  if (name) {
    const initials = name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase();

    if (initials) {
      return initials.slice(0, 2);
    }
  }

  return username.slice(0, 2).toUpperCase();
}

function formatDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions
) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, options);
}

function ProfileContentSkeleton() {
  return (
    <div className="space-y-10">
      <div className="rounded-3xl border border-border/40 bg-background/60 p-8 shadow-[0_25px_60px_-40px_rgba(15,23,42,0.65)] sm:p-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end">
          <div className="flex items-center gap-6">
            <Skeleton className="h-28 w-28 rounded-[32px]" />
            <div className="space-y-4">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-9 w-32 rounded-full" />
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-4 rounded-3xl border border-border/40 bg-background/60 p-6 shadow-sm">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="rounded-3xl border border-border/40 bg-background/60 p-6 shadow-sm">
          <Skeleton className="h-5 w-32" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="space-y-3 rounded-2xl border border-border/40 bg-background/70 p-4"
              >
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
