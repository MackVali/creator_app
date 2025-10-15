#!/usr/bin/env node

/**
 * CLI script to test database views and RLS policies
 * Run with: node scripts/test-views.js
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role for testing

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing environment variables:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✅" : "❌");
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", supabaseKey ? "✅" : "❌");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testView(viewName, description) {
  console.log(`\n🔍 Testing ${viewName} (${description})`);
  console.log("─".repeat(50));

  try {
    const { data, error } = await supabase.from(viewName).select("*").limit(3);

    if (error) {
      console.log(`❌ Error: ${error.message}`);
      console.log(`   Code: ${error.code}`);
      console.log(`   Details: ${error.details}`);
      return false;
    }

    console.log(`✅ Success: ${data?.length || 0} rows returned`);

    if (data && data.length > 0) {
      console.log("   Sample data:");
      console.log("   └─", JSON.stringify(data[0], null, 2));
    }

    return true;
  } catch (err) {
    console.log(`❌ Exception: ${err.message}`);
    return false;
  }
}

async function testRLSPolicies() {
  console.log("\n🔒 Testing RLS Policies");
  console.log("─".repeat(50));

  // Test with a fake user ID to see if RLS blocks access
  const fakeUserId = "00000000-0000-0000-0000-000000000000";

  try {
    // Test user_stats table directly
    const { data, error } = await supabase
      .from("user_stats")
      .select("*")
      .eq("user_id", fakeUserId)
      .limit(1);

    if (error) {
      console.log(`✅ RLS working: ${error.message}`);
    } else {
      console.log(
        `⚠️  RLS may not be working: returned ${data?.length || 0} rows`
      );
    }
  } catch (err) {
    console.log(`❌ RLS test error: ${err.message}`);
  }
}

async function main() {
  console.log("🚀 Database Views Test Suite");
  console.log("=".repeat(50));
  console.log(`Testing against: ${supabaseUrl}`);
  console.log(`Using service role key: ${supabaseKey ? "✅" : "❌"}`);

  const views = [
    { name: "user_stats_v", description: "User level and XP data" },
    { name: "monuments_summary_v", description: "Monument counts by category" },
    { name: "skills_progress_v", description: "Skills with progress values" },
    { name: "goals_active_v", description: "Active goals for users" },
  ];

  let passed = 0;
  let total = views.length;

  for (const view of views) {
    const success = await testView(view.name, view.description);
    if (success) passed++;
  }

  // Test RLS policies
  await testRLSPolicies();

  // Summary
  console.log("\n📊 Test Summary");
  console.log("─".repeat(50));
  console.log(`Total tests: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`Success rate: ${Math.round((passed / total) * 100)}%`);

  if (passed === total) {
    console.log("\n🎉 All tests passed! Database views are working correctly.");
  } else {
    console.log("\n⚠️  Some tests failed. Check the errors above.");
    process.exit(1);
  }
}

// Run the tests
main().catch((err) => {
  console.error("\n💥 Test suite crashed:", err.message);
  process.exit(1);
});
