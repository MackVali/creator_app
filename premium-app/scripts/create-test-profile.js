// Script to create a test profile for testing
// Run this with: node scripts/create-test-profile.js

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestProfile() {
  try {
    console.log("Creating test profile...");

    // Test user ID from TestSprite logs
    const testUserId = "57e8b61e-c9fc-416c-8d0d-cbb02e78e100";

    // First, check if the profiles table has the required columns
    const { data: columns, error: columnsError } = await supabase
      .from("profiles")
      .select("*")
      .limit(1);

    if (columnsError) {
      console.error("Error checking profiles table:", columnsError);
      return;
    }

    console.log("Profiles table structure:", Object.keys(columns[0] || {}));

    // Try to insert a test profile with only existing columns first
    const { data, error } = await supabase
      .from("profiles")
      .upsert({
        user_id: testUserId,
        username: "mackvali",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating basic test profile:", error);
      return;
    }

    console.log("Successfully created basic test profile:", data);

    // Now try to update with additional fields if they exist
    try {
      const updateData = {
        name: "Mack Vali",
        bio: "Premium App User",
      };

      // Only add fields that exist in the table
      if (columns[0] && columns[0].dob !== undefined) {
        updateData.dob = "1990-01-01";
      }
      if (columns[0] && columns[0].city !== undefined) {
        updateData.city = "San Francisco";
      }
      if (columns[0] && columns[0].avatar_url !== undefined) {
        updateData.avatar_url = null;
      }

      const { data: updatedData, error: updateError } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("user_id", testUserId)
        .select()
        .single();

      if (updateError) {
        console.log(
          "Could not update with additional fields:",
          updateError.message
        );
      } else {
        console.log(
          "Successfully updated profile with additional fields:",
          updatedData
        );
      }
    } catch (updateError) {
      console.log(
        "Could not update with additional fields:",
        updateError.message
      );
    }

    console.log(
      "\nProfile creation completed. The profiles table is missing some columns."
    );
    console.log(
      "You need to run the database migration to add the missing columns:"
    );
    console.log("- name, dob, city, bio, avatar_url, updated_at");
    console.log("\nFor now, the basic profile with username has been created.");
  } catch (error) {
    console.error("Unexpected error:", error);
  }
}

createTestProfile();
