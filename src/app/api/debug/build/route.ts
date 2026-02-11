export async function GET() {
  const payload = {
    vercel_git_commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    vercel_env: process.env.VERCEL_ENV ?? null,
    now: new Date().toISOString(),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: { "content-type": "application/json" },
  });
}
