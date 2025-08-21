export default function EnvCheckPage() {
  // Helper function to mask sensitive values
  function maskValue(value: string | undefined): string {
    if (!value) return "undefined";
    if (value.length <= 14) return "***"; // Too short to mask meaningfully

    const first = value.substring(0, 8);
    const last = value.substring(value.length - 6);
    const masked = "*".repeat(Math.max(0, value.length - 14));

    return `${first}${masked}${last}`;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-zinc-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Environment Variables Debug</h1>

        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-3">
              Supabase Configuration
            </h2>
            <pre className="bg-zinc-900 p-4 rounded-lg overflow-x-auto text-sm">
              {`NEXT_PUBLIC_SUPABASE_URL=${maskValue(supabaseUrl)}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${maskValue(supabaseAnonKey)}`}
            </pre>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-3">Environment Status</h2>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span>URL:</span>
                <span
                  className={`px-2 py-1 rounded text-sm ${
                    supabaseUrl
                      ? "bg-green-900 text-green-300"
                      : "bg-red-900 text-red-300"
                  }`}
                >
                  {supabaseUrl ? "Present" : "Missing"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span>Key:</span>
                <span
                  className={`px-2 py-1 rounded text-sm ${
                    supabaseAnonKey
                      ? "bg-green-900 text-green-300"
                      : "bg-red-900 text-red-300"
                  }`}
                >
                  {supabaseAnonKey ? "Present" : "Missing"}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-3">
              Raw Values (First 8 + Last 6)
            </h2>
            <pre className="bg-zinc-900 p-4 rounded-lg overflow-x-auto text-sm">
              {`URL: ${
                supabaseUrl
                  ? `${supabaseUrl.substring(0, 8)}...${supabaseUrl.substring(
                      supabaseUrl.length - 6
                    )}`
                  : "undefined"
              }
Key: ${
                supabaseAnonKey
                  ? `${supabaseAnonKey.substring(
                      0,
                      8
                    )}...${supabaseAnonKey.substring(
                      supabaseAnonKey.length - 6
                    )}`
                  : "undefined"
              }`}
            </pre>
          </div>

          <div className="text-sm text-zinc-400">
            <p>
              This page is for debugging environment variable configuration.
            </p>
            <p>
              Values are masked for security - only showing first 8 and last 6
              characters.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
