// Script to check the current profile state
// Run this with: node scripts/check-profile-state.js

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkProfileState() {
  try {
    console.log("🔍 Checking profile state...\n");

    const testUserId = "57e8b61e-c9fc-416c-8d0d-cbb02e78e100";

    // Check profiles table structure
    console.log("📋 Checking profiles table structure...");
    const { data: structureData, error: structureError } = await supabase
      .from("profiles")
      .select("*")
      .limit(1);

    if (structureError) {
      console.error(
        "❌ Error checking table structure:",
        structureError.message
      );
      return;
    }

    if (structureData && structureData.length > 0) {
      console.log("✅ Table structure:", Object.keys(structureData[0]));
    }

    // Check all profiles for this user
    console.log("\n👤 Checking profiles for user:", testUserId);
    const { data: userProfiles, error: userError } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", testUserId);

    if (userError) {
      console.error("❌ Error fetching user profiles:", userError.message);
      return;
    }

    console.log(`📊 Found ${userProfiles.length} profiles for user`);

    if (userProfiles && userProfiles.length > 0) {
      userProfiles.forEach((profile, index) => {
        console.log(`\n--- Profile ${index + 1} ---`);
        console.log("ID:", profile.id);
        console.log("Username:", profile.username);
        console.log("Name:", profile.name);
        console.log("Bio:", profile.bio);
        console.log("City:", profile.city);
        console.log("DOB:", profile.dob);
        console.log("Avatar URL:", profile.avatar_url);
        console.log("Created:", profile.created_at);
        console.log("Updated:", profile.updated_at);
      });
    }

    // Check for any duplicate usernames
    console.log("\n🔍 Checking for duplicate usernames...");
    const { data: allProfiles, error: allError } = await supabase
      .from("profiles")
      .select("username, user_id, id");

    if (allError) {
      console.error("❌ Error fetching all profiles:", allError.message);
      return;
    }

    const usernameCounts = {};
    allProfiles.forEach((profile) => {
      usernameCounts[profile.username] =
        (usernameCounts[profile.username] || 0) + 1;
    });

    const duplicates = Object.entries(usernameCounts).filter(
      ([username, count]) => count > 1
    );

    if (duplicates.length > 0) {
      console.log("⚠️  Found duplicate usernames:");
      duplicates.forEach(([username, count]) => {
        console.log(`  ${username}: ${count} profiles`);
      });
    } else {
      console.log("✅ No duplicate usernames found");
    }
  } catch (error) {
    console.error("💥 Unexpected error:", error);
  }
}

checkProfileState();
