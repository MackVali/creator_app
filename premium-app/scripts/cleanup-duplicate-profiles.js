// Script to clean up duplicate profile entries
// Run this with: node scripts/cleanup-duplicate-profiles.js

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanupDuplicateProfiles() {
  try {
    console.log("🧹 Cleaning up duplicate profile entries...\n");

    const testUserId = "57e8b61e-c9fc-416c-8d0d-cbb02e78e100";

    // Check how many profiles exist for this user
    console.log("📋 Checking existing profiles...");
    const { data: profiles, error: fetchError } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", testUserId);

    if (fetchError) {
      console.error("❌ Error fetching profiles:", fetchError.message);
      return;
    }

    console.log(`📊 Found ${profiles.length} profiles for user ${testUserId}`);

    if (profiles.length > 1) {
      console.log("🔄 Cleaning up duplicate profiles...");

      // Keep the first profile (oldest) and delete the rest
      const profilesToDelete = profiles.slice(1);

      for (const profile of profilesToDelete) {
        console.log(
          `🗑️  Deleting profile ID: ${profile.id} (username: ${profile.username})`
        );

        const { error: deleteError } = await supabase
          .from("profiles")
          .delete()
          .eq("id", profile.id);

        if (deleteError) {
          console.error(
            `❌ Failed to delete profile ${profile.id}:`,
            deleteError.message
          );
        } else {
          console.log(`✅ Deleted profile ${profile.id}`);
        }
      }

      console.log("\n✅ Cleanup completed!");
    } else {
      console.log("✅ No duplicate profiles found.");
    }

    // Verify we now have only one profile
    console.log("\n🔍 Verifying cleanup...");
    const { data: finalProfiles, error: finalError } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", testUserId);

    if (finalError) {
      console.error("❌ Error verifying cleanup:", finalError.message);
    } else {
      console.log(`📊 Final profile count: ${finalProfiles.length}`);
      if (finalProfiles.length === 1) {
        console.log("🎉 Cleanup successful! Only one profile remains.");
        console.log("📋 Profile details:", finalProfiles[0]);
      }
    }
  } catch (error) {
    console.error("💥 Unexpected error:", error);
  }
}

cleanupDuplicateProfiles();
