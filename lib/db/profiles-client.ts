import { z } from "zod";
import type { OnboardingUpdate, Profile } from "@/lib/types";

// Profile schema validation
export const profileSchema = z.object({
  name: z.string().min(1).max(80),
  username: z
    .string()
    .regex(/^[a-z0-9_]{3,20}$/)
    .toLowerCase(),
  dob: z.string().min(1, "Date of birth is required"),
  city: z.string().max(100).nullable(),
  bio: z.string().max(300).nullable(),
  is_private: z.boolean().optional().default(false),
});

export type ProfileFormData = z.infer<typeof profileSchema>;

// Client-side profile update function
export async function updateMyProfile(
  input: ProfileFormData
): Promise<{ success: boolean; profile?: ProfileFormData; error?: string }> {
  try {
    const response = await fetch("/api/profile/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(input),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    return { success: false, error: "Failed to update profile" };
  }
}

export async function updateMyOnboarding(
  input: OnboardingUpdate
): Promise<{ success: boolean; profile?: Profile; error?: string }> {
  try {
    const response = await fetch("/api/onboarding/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(input),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    return { success: false, error: "Failed to update onboarding" };
  }
}
