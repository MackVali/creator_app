// Quick test to verify the database fix
// Run this after fixing the database schema

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testProfileFix() {
  try {
    console.log("🧪 Testing Profile feature after database fix...\n");

    // Test 1: Check if all columns exist
    console.log("📋 Checking table structure...");
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .limit(1);

    if (profileError) {
      console.error("❌ Error checking profiles:", profileError.message);
      return;
    }

    if (profileData && profileData.length > 0) {
      console.log("✅ Available columns:", Object.keys(profileData[0]));

      // Check if we have all required columns
      const requiredColumns = [
        "name",
        "dob",
        "city",
        "bio",
        "avatar_url",
        "updated_at",
      ];
      const missingColumns = requiredColumns.filter(
        (col) => !(col in profileData[0])
      );

      if (missingColumns.length === 0) {
        console.log("🎉 All required columns are present!");
      } else {
        console.log("⚠️  Missing columns:", missingColumns);
        return;
      }
    }

    // Test 2: Try to create a profile with all fields
    console.log("\n🧪 Testing profile creation...");
    const testUserId = "57e8b61e-c9fc-416c-8d0d-cbb02e78e100";

    const { data: testData, error: testError } = await supabase
      .from("profiles")
      .upsert({
        user_id: testUserId,
        username: "mackvali_test_fix",
        name: "Mack Vali",
        bio: "Premium App User - Fixed!",
        dob: "1990-01-01",
        city: "San Francisco",
        avatar_url: null,
      })
      .select()
      .single();

    if (testError) {
      console.error("❌ Profile creation failed:", testError.message);
    } else {
      console.log("✅ Profile created successfully:", testData);
      console.log("\n🎉 Profile feature is now working!");
      console.log("🚀 You can now re-run TestSprite tests!");
    }
  } catch (error) {
    console.error("💥 Test failed:", error);
  }
}

testProfileFix();
