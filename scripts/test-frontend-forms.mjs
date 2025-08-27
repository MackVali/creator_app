#!/usr/bin/env node

/**
 * Test script to verify frontend form components
 * Run with: node scripts/test-frontend-forms.mjs
 */

import fs from "node:fs";

console.log("🧪 Testing Frontend Form Components...\n");

// Test 1: Check if EventModal has required fields
console.log("1. Testing EventModal component...");
const eventModalPath = "components/ui/EventModal.tsx";
if (fs.existsSync(eventModalPath)) {
  const content = fs.readFileSync(eventModalPath, "utf8");

  // Check for required imports
  const hasGoalQueries = content.includes("getGoalsForUser");
  const hasProjectQueries = content.includes("getProjectsForGoal");

  // Check for form fields
  const hasGoalSelection = content.includes("Goal Selection for Projects");
  const hasProjectSelection = content.includes(
    'Project <span className="text-red-400">*</span>'
  );
  const hasValidation =
    content.includes("!formData.goal_id") ||
    content.includes("!formData.project_id");

  console.log(`   ✅ EventModal exists`);
  console.log(`   ${hasGoalQueries ? "✅" : "❌"} Goal queries imported`);
  console.log(`   ${hasProjectQueries ? "✅" : "❌"} Project queries imported`);
  console.log(`   ${hasGoalSelection ? "✅" : "❌"} Goal selection field`);
  console.log(
    `   ${hasProjectSelection ? "✅" : "❌"} Project selection field`
  );
  console.log(`   ${hasValidation ? "✅" : "❌"} Form validation`);
} else {
  console.log("   ❌ EventModal not found");
}

// Test 2: Check if query helpers exist
console.log("\n2. Testing Query Helper Components...");
const goalsPath = "lib/queries/goals.ts";
const projectsPath = "lib/queries/projects.ts";

if (fs.existsSync(goalsPath)) {
  const content = fs.readFileSync(goalsPath, "utf8");
  const hasGetGoalsForUser = content.includes("getGoalsForUser");
  const hasGetGoalById = content.includes("getGoalById");
  console.log(`   ✅ Goals queries exist`);
  console.log(
    `   ${hasGetGoalsForUser ? "✅" : "❌"} getGoalsForUser function`
  );
  console.log(`   ${hasGetGoalById ? "✅" : "❌"} getGoalById function`);
} else {
  console.log("   ❌ Goals queries not found");
}

if (fs.existsSync(projectsPath)) {
  const content = fs.readFileSync(projectsPath, "utf8");
  const hasGetProjectsForGoal = content.includes("getProjectsForGoal");
  const hasGetProjectsForUser = content.includes("getProjectsForUser");
  console.log(`   ✅ Projects queries exist`);
  console.log(
    `   ${hasGetProjectsForGoal ? "✅" : "❌"} getProjectsForGoal function`
  );
  console.log(
    `   ${hasGetProjectsForUser ? "✅" : "❌"} getProjectsForUser function`
  );
} else {
  console.log("   ❌ Projects queries not found");
}

// Test 3: Check if list components exist
console.log("\n3. Testing List Components...");
const projectListPath = "components/ui/ProjectList.tsx";
const taskListPath = "components/ui/TaskList.tsx";

if (fs.existsSync(projectListPath)) {
  console.log("   ✅ ProjectList component exists");
} else {
  console.log("   ❌ ProjectList component not found");
}

if (fs.existsSync(taskListPath)) {
  console.log("   ✅ TaskList component exists");
} else {
  console.log("   ❌ TaskList component not found");
}

// Test 4: Check if pages are updated
console.log("\n4. Testing Page Updates...");
const projectsPagePath = "src/app/(app)/projects/page.tsx";
const tasksPagePath = "src/app/(app)/tasks/page.tsx";

if (fs.existsSync(projectsPagePath)) {
  const content = fs.readFileSync(projectsPagePath, "utf8");
  const usesProjectList = content.includes("ProjectList");
  console.log(`   ✅ Projects page exists`);
  console.log(`   ${usesProjectList ? "✅" : "❌"} Uses ProjectList component`);
} else {
  console.log("   ❌ Projects page not found");
}

if (fs.existsSync(tasksPagePath)) {
  const content = fs.readFileSync(tasksPagePath, "utf8");
  const usesTaskList = content.includes("TaskList");
  console.log(`   ✅ Tasks page exists`);
  console.log(`   ${usesTaskList ? "✅" : "❌"} Uses TaskList component`);
} else {
  console.log("   ❌ Tasks page not found");
}

// Test 5: Check UI exports
console.log("\n5. Testing UI Component Exports...");
const uiIndexPath = "components/ui/index.ts";
if (fs.existsSync(uiIndexPath)) {
  const content = fs.readFileSync(uiIndexPath, "utf8");
  const exportsProjectList = content.includes("ProjectList");
  const exportsTaskList = content.includes("TaskList");
  const exportsEventModal = content.includes("EventModal");

  console.log(`   ✅ UI index exists`);
  console.log(`   ${exportsProjectList ? "✅" : "❌"} Exports ProjectList`);
  console.log(`   ${exportsTaskList ? "✅" : "❌"} Exports TaskList`);
  console.log(`   ${exportsEventModal ? "✅" : "❌"} Exports EventModal`);
} else {
  console.log("   ❌ UI index not found");
}

console.log("\n🎯 Frontend Component Testing Complete!");
console.log("\n📝 Next Steps:");
console.log("1. Apply the database migration in Supabase Dashboard");
console.log("2. Test the FAB menu: add GOAL → add PROJECT → add TASK");
console.log("3. Verify relationships are enforced in forms");
console.log("4. Check that Projects and Tasks pages display data correctly");
