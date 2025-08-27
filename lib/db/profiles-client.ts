import { z } from "zod";

// Profile schema validation
export const profileSchema = z.object({
  name: z.string().min(1).max(80),
  username: z
    .string()
    .regex(/^[a-z0-9_]{3,20}$/)
    .toLowerCase(),
  dob: z.string().nullable(),
  city: z.string().max(100).nullable(),
  bio: z.string().max(300).nullable(),
  avatar_url: z.string().url().nullable().optional(),
  banner_url: z.string().url().nullable().optional(),
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
      body: JSON.stringify(input),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    return { success: false, error: "Failed to update profile" };
  }
}
