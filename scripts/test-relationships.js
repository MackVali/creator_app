#!/usr/bin/env node

/**
 * Test script to verify Goal → Project → Task relationships
 * Run with: node scripts/test-relationships.js
 */

/* eslint-disable @typescript-eslint/no-require-imports */

const { createClient } = require("@supabase/supabase-js");

// Load environment variables
require("dotenv").config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing required environment variables");
  console.log("NEXT_PUBLIC_SUPABASE_URL:", !!supabaseUrl);
  console.log("SUPABASE_SERVICE_ROLE_KEY:", !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testRelationships() {
  console.log("🔍 Testing Goal → Project → Task relationships...\n");

  try {
    // 1. Test Goals table
    console.log("1. Testing Goals table...");
    const { data: goals, error: goalsError } = await supabase
      .from("goals")
      .select("id, name, user_id, created_at")
      .limit(5);

    if (goalsError) {
      console.error("❌ Error fetching goals:", goalsError);
    } else {
      console.log(`✅ Found ${goals.length} goals`);
      goals.forEach((goal) => {
        console.log(`   - ${goal.name} (${goal.id})`);
      });
    }

    // 2. Test Projects table and goal_id constraint
    console.log("\n2. Testing Projects table...");
    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("id, name, goal_id, user_id, created_at")
      .limit(5);

    if (projectsError) {
      console.error("❌ Error fetching projects:", projectsError);
    } else {
      console.log(`✅ Found ${projects.length} projects`);
      projects.forEach((project) => {
        console.log(
          `   - ${project.name} (${project.id}) -> Goal: ${project.goal_id}`
        );
      });
    }

    // 3. Test Tasks table and project_id constraint
    console.log("\n3. Testing Tasks table...");
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("id, name, project_id, user_id, created_at")
      .limit(5);

    if (tasksError) {
      console.error("❌ Error fetching tasks:", tasksError);
    } else {
      console.log(`✅ Found ${tasks.length} tasks`);
      tasks.forEach((task) => {
        console.log(
          `   - ${task.name} (${task.id}) -> Project: ${task.project_id}`
        );
      });
    }

    // 4. Test foreign key constraints
    console.log("\n4. Testing Foreign Key constraints...");

    // Check if projects.goal_id is NOT NULL
    const { data: nullGoalProjects, error: nullGoalError } = await supabase
      .from("projects")
      .select("id, name")
      .is("goal_id", null);

    if (nullGoalError) {
      console.error("❌ Error checking null goal_id:", nullGoalError);
    } else if (nullGoalProjects.length > 0) {
      console.log(
        `⚠️  Found ${nullGoalProjects.length} projects without goal_id (constraint violation)`
      );
      nullGoalProjects.forEach((p) => console.log(`   - ${p.name} (${p.id})`));
    } else {
      console.log("✅ All projects have goal_id (constraint enforced)");
    }

    // Check if tasks.project_id is NOT NULL
    const { data: nullProjectTasks, error: nullProjectError } = await supabase
      .from("tasks")
      .select("id, name")
      .is("project_id", null);

    if (nullProjectError) {
      console.error("❌ Error checking null project_id:", nullProjectError);
    } else if (nullProjectTasks.length > 0) {
      console.log(
        `⚠️  Found ${nullProjectTasks.length} tasks without project_id (constraint violation)`
      );
      nullProjectTasks.forEach((t) => console.log(`   - ${t.name} (${t.id})`));
    } else {
      console.log("✅ All tasks have project_id (constraint enforced)");
    }

    // 5. Test cascade relationships
    console.log("\n5. Testing cascade relationships...");
    if (goals && goals.length > 0) {
      const testGoalId = goals[0].id;
      console.log(
        `   Testing cascade delete for goal: ${goals[0].name} (${testGoalId})`
      );

      // Count projects and tasks that would be affected
      const { data: affectedProjects } = await supabase
        .from("projects")
        .select("id, name")
        .eq("goal_id", testGoalId);

      const { data: affectedTasks } = await supabase
        .from("tasks")
        .select("id, name")
        .in("project_id", affectedProjects?.map((p) => p.id) || []);

      console.log(
        `   - Would affect ${affectedProjects?.length || 0} projects`
      );
      console.log(`   - Would affect ${affectedTasks?.length || 0} tasks`);
      console.log("   (Cascade delete not tested - would destroy data)");
    }

    console.log("\n✅ Relationship testing complete!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test
testRelationships();
