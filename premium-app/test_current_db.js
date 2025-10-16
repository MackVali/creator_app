import { createClient } from "@supabase/supabase-js";

// Load environment variables
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDatabase() {
  console.log("🔍 Testing current database structure...\n");

  try {
    // 1. Check what tables exist
    console.log("📋 Checking tables...");
    const { data: tables, error: tablesError } = await supabase
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public")
      .eq("table_type", "BASE TABLE");

    if (tablesError) {
      console.error("Error checking tables:", tablesError);
    } else {
      console.log(
        "Tables found:",
        tables.map((t) => t.table_name)
      );
    }

    // 2. Check if skills table exists and its structure
    console.log("\n🎯 Checking skills table...");
    const { data: skillsColumns, error: skillsError } = await supabase
      .from("information_schema.columns")
      .select("column_name, data_type, is_nullable")
      .eq("table_schema", "public")
      .eq("table_name", "skills")
      .order("ordinal_position");

    if (skillsError) {
      console.error("Error checking skills columns:", skillsError);
    } else if (skillsColumns.length === 0) {
      console.log("❌ Skills table does not exist");
    } else {
      console.log("Skills table columns:");
      skillsColumns.forEach((col) => {
        console.log(
          `  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`
        );
      });
    }

    // 3. Check if cats table exists
    console.log("\n🐱 Checking cats table...");
    const { data: catsColumns, error: catsError } = await supabase
      .from("information_schema.columns")
      .select("column_name, data_type, is_nullable")
      .eq("table_schema", "public")
      .eq("table_name", "cats")
      .order("ordinal_position");

    if (catsError) {
      console.error("Error checking cats columns:", catsError);
    } else if (catsColumns.length === 0) {
      console.log("❌ Cats table does not exist");
    } else {
      console.log("Cats table columns:");
      catsColumns.forEach((col) => {
        console.log(
          `  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`
        );
      });
    }

    // 4. Check what views exist
    console.log("\n👁️ Checking views...");
    const { data: views, error: viewsError } = await supabase
      .from("information_schema.views")
      .select("table_name")
      .eq("table_schema", "public");

    if (viewsError) {
      console.error("Error checking views:", viewsError);
    } else {
      console.log(
        "Views found:",
        views.map((v) => v.table_name)
      );
    }

    // 5. Try to query skills data
    console.log("\n📊 Testing skills data query...");
    try {
      const { data: skillsData, error: skillsQueryError } = await supabase
        .from("skills")
        .select("*")
        .limit(5);

      if (skillsQueryError) {
        console.error("Error querying skills:", skillsQueryError);
      } else {
        console.log(`Found ${skillsData.length} skills:`, skillsData);
      }
    } catch (e) {
      console.error("Skills table query failed:", e.message);
    }

    // 6. Try to query the skills_by_cats_v view
    console.log("\n🔍 Testing skills_by_cats_v view...");
    try {
      const { data: catsData, error: catsQueryError } = await supabase
        .from("skills_by_cats_v")
        .select("*")
        .limit(5);

      if (catsQueryError) {
        console.error("Error querying skills_by_cats_v:", catsQueryError);
      } else {
        console.log(`Found ${catsData.length} categories:`, catsData);
      }
    } catch (e) {
      console.error("skills_by_cats_v view query failed:", e.message);
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

testDatabase();
