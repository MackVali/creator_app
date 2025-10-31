#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Auth Gate Test Script
 *
 * This script helps test the auth gate implementation by making HTTP requests
 * and checking redirects and responses.
 */

const http = require("http");

const BASE_URL = "http://localhost:3000";
const baseUrl = new URL(BASE_URL);
const defaultPort = baseUrl.port
  ? Number(baseUrl.port)
  : baseUrl.protocol === "https:"
    ? 443
    : 80;

// Test cases based on PRD acceptance criteria
const testCases = [
  {
    name: "Root route (/) - should redirect to /auth",
    path: "/",
    expectedRedirect: "/auth?redirect=%2F",
    description: "GET / logged-out → 307 /auth?redirect=/",
  },
  {
    name: "Dashboard route (/dashboard) - should redirect to /auth with redirect param",
    path: "/dashboard",
    expectedRedirect: "/auth?redirect=%2Fdashboard",
    description: "GET /dashboard logged-out → 307 /auth?redirect=/dashboard",
  },
  {
    name: "Skills route (/skills) - should redirect to /auth with redirect param",
    path: "/skills",
    expectedRedirect: "/auth?redirect=%2Fskills",
    description: "GET /skills logged-out → 307 /auth?redirect=/skills",
  },
  {
    name: "Goals route (/goals) - should redirect to /auth with redirect param",
    path: "/goals",
    expectedRedirect: "/auth?redirect=%2Fgoals",
    description: "GET /goals logged-out → 307 /auth?redirect=/goals",
  },
  {
    name: "API health route (/api/health) - should not be intercepted",
    path: "/api/health",
    expectedRedirect: null,
    description: "API routes should not be intercepted by middleware",
  },
];

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      protocol: baseUrl.protocol,
      hostname: baseUrl.hostname,
      port: defaultPort,
      path,
      method: "GET",
      followRedirect: false,
    };

    const req = http.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data,
        });
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.end();
  });
}

async function runTests() {
  console.log("🚀 Starting Auth Gate Tests...\n");
  console.log(
    `Make sure the dev server is running at ${baseUrl.hostname}:${defaultPort}\n`
  );

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    try {
      console.log(`🧪 Testing: ${testCase.name}`);
      console.log(`   Expected: ${testCase.description}`);

      const response = await makeRequest(testCase.path);

      if (testCase.expectedRedirect) {
        // Should redirect
        if (
          response.statusCode === 302 ||
          response.statusCode === 301 ||
          response.statusCode === 307
        ) {
          const location = response.headers.location;
          if (location === testCase.expectedRedirect) {
            console.log(`   ✅ PASS: Redirected to ${location}`);
            passed++;
          } else {
            console.log(
              `   ❌ FAIL: Expected redirect to ${testCase.expectedRedirect}, got ${location}`
            );
            failed++;
          }
        } else {
          console.log(
            `   ❌ FAIL: Expected redirect (302/301/307), got ${response.statusCode}`
          );
          failed++;
        }
      } else {
        // Should not redirect
        if (response.statusCode === 200) {
          console.log(`   ✅ PASS: No redirect, status ${response.statusCode}`);
          passed++;
        } else {
          console.log(`   ❌ FAIL: Unexpected status ${response.statusCode}`);
          failed++;
        }
      }

      console.log(`   Status: ${response.statusCode}`);
      if (response.headers.location) {
        console.log(`   Location: ${response.headers.location}`);
      }
      console.log("");
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failed++;
      console.log("");
    }
  }

  console.log("📊 Test Results:");
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(
    `   📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`
  );

  if (failed === 0) {
    console.log("\n🎉 All tests passed! Auth gate is working correctly.");
  } else {
    console.log("\n⚠️  Some tests failed. Check the implementation.");
  }
}

// Check if server is running before starting tests
async function checkServer() {
  try {
    await makeRequest("/api/health");
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();

  if (!serverRunning) {
    console.log(
      `❌ Dev server is not running at ${baseUrl.hostname}:${defaultPort}`
    );
    console.log("   Please start the server with: pnpm dev");
    process.exit(1);
  }

  await runTests();
}

main().catch(console.error);
