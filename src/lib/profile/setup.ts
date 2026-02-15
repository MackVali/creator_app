import type { Profile } from "@/lib/types";

export function isProfileSetupIncomplete(profile: Profile | null): boolean {
  if (!profile) {
    return true;
  }

  const hasUsername = profile.username?.trim().length > 0;
  const hasDisplayName = profile.name?.trim().length > 0;
  const hasDob = profile.dob?.trim().length > 0;

  return !hasUsername || !hasDisplayName || !hasDob;
}
