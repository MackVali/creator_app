#!/usr/bin/env node

/**
 * Script to apply the consolidated migration cleanup and verify the results
 * This script will help ensure your database schema matches what your application expects
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing required environment variables:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✅" : "❌");
  console.error(
    "   SUPABASE_SERVICE_ROLE_KEY:",
    supabaseServiceKey ? "✅" : "❌"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkCurrentSchema() {
  console.log("🔍 Checking current database schema...");

  try {
    // Check if missing tables exist
    const missingTables = ["cats", "social_links", "content_cards"];
    const tableChecks = {};

    for (const table of missingTables) {
      const { data, error } = await supabase.from(table).select("*").limit(1);

      if (error) {
        tableChecks[table] = { exists: false, error: error.message };
      } else {
        tableChecks[table] = { exists: true, count: data?.length || 0 };
      }
    }

    console.log("\n📊 Current Table Status:");
    Object.entries(tableChecks).forEach(([table, status]) => {
      if (status.exists) {
        console.log(`   ${table}: ✅ Exists`);
      } else {
        console.log(`   ${table}: ❌ Missing (${status.error})`);
      }
    });

    // Check if missing columns exist
    console.log("\n🔍 Checking for missing columns...");

    const { data: profileColumns, error: profileError } = await supabase.rpc(
      "get_table_columns",
      { table_name: "profiles" }
    );

    if (profileError) {
      console.log("   profiles table columns: Could not check");
    } else {
      const expectedColumns = [
        "name",
        "dob",
        "city",
        "bio",
        "avatar_url",
        "updated_at",
      ];
      const existingColumns =
        profileColumns?.map((col) => col.column_name) || [];

      console.log("   profiles table missing columns:");
      expectedColumns.forEach((col) => {
        if (existingColumns.includes(col)) {
          console.log(`     ${col}: ✅`);
        } else {
          console.log(`     ${col}: ❌`);
        }
      });
    }

    // Check if skills_by_cats_v view exists
    console.log("\n🔍 Checking for missing views...");
    try {
      const { error: viewError } = await supabase
        .from("skills_by_cats_v")
        .select("*")
        .limit(1);

      if (viewError) {
        console.log("   skills_by_cats_v: ❌ Missing or inaccessible");
      } else {
        console.log("   skills_by_cats_v: ✅ Exists");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Missing or inaccessible";
      console.log(`   skills_by_cats_v: ❌ ${message}`);
    }

    return tableChecks;
  } catch (error) {
    console.error("❌ Error checking schema:", error.message);
    return null;
  }
}

async function applyMigration() {
  console.log("\n🚀 Applying consolidated migration cleanup...");

  try {
    // Read the migration file
    const fs = await import("fs");
    const path = await import("path");

    const migrationPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "20250101000022_consolidated_schema_cleanup.sql"
    );

    if (!fs.existsSync(migrationPath)) {
      console.error("❌ Migration file not found:", migrationPath);
      return false;
    }

    const migrationSQL = fs.readFileSync(migrationPath, "utf8");

    // Split the migration into individual statements
    const statements = migrationSQL
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

    console.log(`   Found ${statements.length} SQL statements to execute`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          const { error } = await supabase.rpc("exec_sql", { sql: statement });
          if (error) {
            console.log(`   Statement ${i + 1}: ❌ ${error.message}`);
            errorCount++;
          } else {
            console.log(`   Statement ${i + 1}: ✅`);
            successCount++;
          }
        } catch (e) {
          console.log(`   Statement ${i + 1}: ❌ ${e.message}`);
          errorCount++;
        }
      }
    }

    console.log(`\n📊 Migration Results:`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);

    return errorCount === 0;
  } catch (error) {
    console.error("❌ Error applying migration:", error.message);
    return false;
  }
}

async function verifyCleanup() {
  console.log("\n🔍 Verifying cleanup results...");

  try {
    // Check if all missing tables now exist
    const tables = ["cats", "social_links", "content_cards"];
    const results = {};

    for (const table of tables) {
      const { data, error } = await supabase.from(table).select("*").limit(1);

      if (error) {
        results[table] = { exists: false, error: error.message };
      } else {
        results[table] = { exists: true, count: data?.length || 0 };
      }
    }

    console.log("\n📊 Verification Results:");
    let allGood = true;

    Object.entries(results).forEach(([table, status]) => {
      if (status.exists) {
        console.log(`   ${table}: ✅ Exists`);
      } else {
        console.log(`   ${table}: ❌ Still missing (${status.error})`);
        allGood = false;
      }
    });

    // Check if skills_by_cats_v view exists
    try {
      const { error: viewError } = await supabase
        .from("skills_by_cats_v")
        .select("*")
        .limit(1);

      if (viewError) {
        console.log("   skills_by_cats_v: ❌ Still missing or inaccessible");
        allGood = false;
      } else {
        console.log("   skills_by_cats_v: ✅ Exists");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Still missing or inaccessible";
      console.log(`   skills_by_cats_v: ❌ ${message}`);
      allGood = false;
    }

    if (allGood) {
      console.log("\n🎉 All cleanup tasks completed successfully!");
    } else {
      console.log(
        "\n⚠️  Some cleanup tasks may have failed. Check the errors above."
      );
    }

    return allGood;
  } catch (error) {
    console.error("❌ Error verifying cleanup:", error.message);
    return false;
  }
}

async function main() {
  console.log("🧹 Supabase Migration Cleanup Script");
  console.log("=====================================\n");

  // Step 1: Check current schema
  const currentStatus = await checkCurrentSchema();
  if (!currentStatus) {
    console.error("❌ Failed to check current schema");
    process.exit(1);
  }

  // Step 2: Apply migration
  const migrationSuccess = await applyMigration();
  if (!migrationSuccess) {
    console.error("❌ Migration failed");
    process.exit(1);
  }

  // Step 3: Verify cleanup
  const verificationSuccess = await verifyCleanup();
  if (!verificationSuccess) {
    console.error("❌ Verification failed");
    process.exit(1);
  }

  console.log("\n✅ Migration cleanup completed successfully!");
  console.log(
    "Your database schema should now match what your application expects."
  );
}

// Run the script
main().catch(console.error);
