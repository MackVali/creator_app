import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    vercel_git_commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    vercel_env: process.env.VERCEL_ENV ?? null,
    node_env: process.env.NODE_ENV ?? null,
    timestamp: new Date().toISOString(),
  });
}
