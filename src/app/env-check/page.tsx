export const runtime = "nodejs";

export default async function EnvCheckPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const envInfo = {
    NEXT_PUBLIC_SUPABASE_URL: {
      present: !!supabaseUrl,
      length: supabaseUrl?.length || 0,
      preview: supabaseUrl?.slice(0, 24) + "…" || "MISSING",
    },
    NEXT_PUBLIC_SUPABASE_ANON_KEY: {
      present: !!supabaseKey,
      length: supabaseKey?.length || 0,
      preview: supabaseKey?.slice(0, 16) + "…" || "MISSING",
    },
    NODE_ENV: process.env.NODE_ENV || "NOT_SET",
    VERCEL_ENV: process.env.VERCEL_ENV || "NOT_SET",
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV || "NOT_SET",
  };

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10 text-zinc-100">
      <h1 className="text-3xl font-bold mb-8">Environment Variables Check</h1>

      <div className="space-y-6">
        <div className="p-6 bg-zinc-900/40 rounded-2xl border border-zinc-800/70">
          <h2 className="text-xl font-semibold mb-4">Supabase Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-zinc-800/40 rounded-lg">
              <div className="text-sm text-zinc-400 mb-2">
                NEXT_PUBLIC_SUPABASE_URL
              </div>
              <div className="text-lg font-mono">
                {envInfo.NEXT_PUBLIC_SUPABASE_URL.present
                  ? "✅ Present"
                  : "❌ Missing"}
              </div>
              <div className="text-sm text-zinc-300">
                Length: {envInfo.NEXT_PUBLIC_SUPABASE_URL.length}
              </div>
              <div className="text-sm text-zinc-400">
                Preview: {envInfo.NEXT_PUBLIC_SUPABASE_URL.preview}
              </div>
            </div>

            <div className="p-4 bg-zinc-800/40 rounded-lg">
              <div className="text-sm text-zinc-400 mb-2">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </div>
              <div className="text-lg font-mono">
                {envInfo.NEXT_PUBLIC_SUPABASE_ANON_KEY.present
                  ? "✅ Present"
                  : "❌ Missing"}
              </div>
              <div className="text-sm text-zinc-300">
                Length: {envInfo.NEXT_PUBLIC_SUPABASE_ANON_KEY.length}
              </div>
              <div className="text-sm text-zinc-400">
                Preview: {envInfo.NEXT_PUBLIC_SUPABASE_ANON_KEY.preview}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-zinc-900/40 rounded-2xl border border-zinc-800/70">
          <h2 className="text-xl font-semibold mb-4">
            Environment Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-zinc-800/40 rounded-lg">
              <div className="text-sm text-zinc-400 mb-2">NODE_ENV</div>
              <div className="text-lg font-mono">{envInfo.NODE_ENV}</div>
            </div>

            <div className="p-4 bg-zinc-800/40 rounded-lg">
              <div className="text-sm text-zinc-400 mb-2">VERCEL_ENV</div>
              <div className="text-lg font-mono">{envInfo.VERCEL_ENV}</div>
            </div>

            <div className="p-4 bg-zinc-800/40 rounded-lg">
              <div className="text-sm text-zinc-400 mb-2">
                NEXT_PUBLIC_VERCEL_ENV
              </div>
              <div className="text-lg font-mono">
                {envInfo.NEXT_PUBLIC_VERCEL_ENV}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-zinc-900/40 rounded-2xl border border-zinc-800/70">
          <h2 className="text-xl font-semibold mb-4">Raw Environment Data</h2>
          <pre className="p-4 bg-zinc-800/40 rounded-lg text-sm overflow-x-auto">
            {JSON.stringify(envInfo, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
