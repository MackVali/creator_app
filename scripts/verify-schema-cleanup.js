#!/usr/bin/env node

/**
 * Simple verification script to check if the schema cleanup was successful
 * Run this after applying the migration to verify everything is working
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Missing required environment variables:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✅" : "❌");
  console.error(
    "   NEXT_PUBLIC_SUPABASE_ANON_KEY:",
    supabaseAnonKey ? "✅" : "❌"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verifySchema() {
  console.log("🔍 Verifying Schema Cleanup Results");
  console.log("====================================\n");

  const results = {
    tables: {},
    views: {},
    columns: {},
    triggers: {},
  };

  try {
    // 1. Check if missing tables exist
    console.log("📊 Checking Tables...");
    const tables = ["cats", "social_links", "content_cards"];

    for (const table of tables) {
      try {
        const { data, error } = await supabase.from(table).select("*").limit(1);

        if (error) {
          results.tables[table] = { exists: false, error: error.message };
          console.log(`   ${table}: ❌ ${error.message}`);
        } else {
          results.tables[table] = { exists: true, count: data?.length || 0 };
          console.log(`   ${table}: ✅ Exists`);
        }
      } catch (e) {
        results.tables[table] = { exists: false, error: e.message };
        console.log(`   ${table}: ❌ ${e.message}`);
      }
    }

    // 2. Check if skills_by_cats_v view exists
    console.log("\n🔍 Checking Views...");
    try {
      const { data, error } = await supabase
        .from("skills_by_cats_v")
        .select("*")
        .limit(1);

      if (error) {
        results.views["skills_by_cats_v"] = {
          exists: false,
          error: error.message,
        };
        console.log(`   skills_by_cats_v: ❌ ${error.message}`);
      } else {
        results.views["skills_by_cats_v"] = {
          exists: true,
          count: data?.length || 0,
        };
        console.log(`   skills_by_cats_v: ✅ Exists`);
      }
    } catch (e) {
      results.views["skills_by_cats_v"] = { exists: false, error: e.message };
      console.log(`   skills_by_cats_v: ❌ ${e.message}`);
    }

    // 3. Check if profiles table has the expected columns
    console.log("\n🔍 Checking Profile Columns...");
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, dob, city, bio, avatar_url, updated_at")
        .limit(1);

      if (error) {
        console.log(`   profiles columns: ❌ ${error.message}`);
      } else {
        const sampleCount = data?.length ?? 0;
        console.log(
          `   profiles columns: ✅ All expected columns accessible (sample rows: ${sampleCount})`
        );
      }
    } catch (e) {
      console.log(`   profiles columns: ❌ ${e.message}`);
    }

    // 4. Check if updated_at triggers work
    console.log("\n🔍 Checking Updated At Triggers...");
    try {
      // Try to update a profile to test the trigger
      const { data: profiles, error: selectError } = await supabase
        .from("profiles")
        .select("id, updated_at")
        .limit(1);

      if (selectError || !profiles || profiles.length === 0) {
        console.log(`   updated_at triggers: ⚠️  No profiles to test with`);
      } else {
        const profile = profiles[0];
        const oldUpdatedAt = profile.updated_at;

        // Wait a moment to ensure timestamp difference
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const { error: updateError } = await supabase
          .from("profiles")
          .update({ bio: "Test update for trigger verification" })
          .eq("id", profile.id);

        if (updateError) {
          console.log(`   updated_at triggers: ❌ ${updateError.message}`);
        } else {
          // Check if updated_at changed
          const { data: updatedProfile, error: checkError } = await supabase
            .from("profiles")
            .select("updated_at")
            .eq("id", profile.id)
            .single();

          if (checkError) {
            console.log(`   updated_at triggers: ❌ Could not verify update`);
          } else if (updatedProfile.updated_at !== oldUpdatedAt) {
            console.log(`   updated_at triggers: ✅ Working correctly`);
          } else {
            console.log(
              `   updated_at triggers: ⚠️  Timestamp may not have changed`
            );
          }
        }
      }
    } catch (e) {
      console.log(`   updated_at triggers: ❌ ${e.message}`);
    }

    // 5. Test basic functionality
    console.log("\n🔍 Testing Basic Functionality...");

    // Test cats table insert/select
    try {
      const testCatName = `test_cat_${Date.now()}`;
      const { data: insertData, error: insertError } = await supabase
        .from("cats")
        .insert({
          name: testCatName,
          user_id: "00000000-0000-0000-0000-000000000000",
        })
        .select();

      if (insertError) {
        console.log(`   cats CRUD: ❌ Insert failed: ${insertError.message}`);
      } else {
        const insertedCount = insertData?.length ?? 0;
        console.log(
          `   cats CRUD: ✅ Insert successful (rows inserted: ${insertedCount})`
        );

        // Clean up test data
        await supabase.from("cats").delete().eq("name", testCatName);
      }
    } catch (e) {
      console.log(`   cats CRUD: ❌ ${e.message}`);
    }

    // 6. Summary
    console.log("\n📋 Summary");
    console.log("==========");

    const tableCount = Object.values(results.tables).filter(
      (t) => t.exists
    ).length;
    const viewCount = Object.values(results.views).filter(
      (v) => v.exists
    ).length;

    console.log(
      `Tables: ${tableCount}/${Object.keys(results.tables).length} ✅`
    );
    console.log(`Views: ${viewCount}/${Object.keys(results.views).length} ✅`);

    if (
      tableCount === Object.keys(results.tables).length &&
      viewCount === Object.keys(results.views).length
    ) {
      console.log("\n🎉 Schema cleanup appears to be successful!");
      console.log(
        "Your database should now have all the expected tables, views, and functionality."
      );
    } else {
      console.log("\n⚠️  Some cleanup tasks may have failed.");
      console.log(
        "Check the errors above and consider re-running the migration."
      );
    }
  } catch (error) {
    console.error("❌ Error during verification:", error.message);
  }
}

// Run verification
verifySchema().catch(console.error);
