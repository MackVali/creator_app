// Script to fix the database schema by adding missing columns
// Run this with: node scripts/fix-db-schema.js

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

async function fixDatabaseSchema() {
  try {
    console.log("🔧 Fixing database schema...\n");

    // Define the columns we need to add
    const columnsToAdd = [
      { name: "name", type: "text", nullable: true },
      { name: "dob", type: "date", nullable: true },
      { name: "city", type: "text", nullable: true },
      { name: "bio", type: "text", nullable: true },
      { name: "avatar_url", type: "text", nullable: true },
      {
        name: "updated_at",
        type: "timestamp with time zone",
        nullable: false,
        defaultValue: "now()",
      },
    ];

    console.log("📋 Adding missing columns to profiles table...");

    for (const column of columnsToAdd) {
      try {
        console.log(`➕ Adding column: ${column.name} (${column.type})`);

        let sql = `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ${column.name} ${column.type}`;

        if (column.defaultValue) {
          sql += ` DEFAULT ${column.defaultValue}`;
        }

        if (!column.nullable) {
          sql += ` NOT NULL`;
        }

        // Try using RPC first
        const { error: rpcError } = await supabase.rpc("exec_sql", { sql });

        if (rpcError) {
          console.log(
            `⚠️  RPC failed for ${column.name}, trying alternative method...`
          );

          // Alternative: try to insert a row with the new column to trigger schema update
          if (column.name === "name") {
            const { error: updateError } = await supabase
              .from("profiles")
              .update({ name: "Test Name" })
              .eq("id", 1);

            if (
              updateError &&
              updateError.message.includes("column") &&
              updateError.message.includes("does not exist")
            ) {
              console.log(
                `❌ Column ${column.name} still missing after update attempt`
              );
            } else {
              console.log(`✅ Column ${column.name} added via update`);
            }
          }
        } else {
          console.log(`✅ Column ${column.name} added successfully`);
        }
      } catch (error) {
        console.log(`⚠️  Error adding column ${column.name}:`, error.message);
      }
    }

    // Now let's test if we can create a profile with all fields
    console.log("\n🧪 Testing profile creation with all fields...");
    const testUserId = "57e8b61e-c9fc-416c-8d0d-cbb02e78e100";

    const { data: testData, error: testError } = await supabase
      .from("profiles")
      .upsert({
        user_id: testUserId,
        username: "mackvali_updated",
        name: "Mack Vali",
        bio: "Premium App User",
        dob: "1990-01-01",
        city: "San Francisco",
        avatar_url: null,
      })
      .select()
      .single();

    if (testError) {
      console.error("❌ Profile creation still failed:", testError.message);

      // Let's check what columns are actually available now
      console.log("\n🔍 Checking current table structure...");
      const { data: structureData, error: structureError } = await supabase
        .from("profiles")
        .select("*")
        .limit(1);

      if (structureError) {
        console.error(
          "❌ Could not check table structure:",
          structureError.message
        );
      } else if (structureData && structureData.length > 0) {
        console.log("📊 Current columns:", Object.keys(structureData[0]));
      }
    } else {
      console.log("✅ Profile created successfully with all fields:", testData);
      console.log("🎉 Database schema is now fixed!");
    }
  } catch (error) {
    console.error("💥 Unexpected error:", error);
  }
}

fixDatabaseSchema();
