import { testDatabaseViews } from "../actions/test-views";

export default async function TestViewsPage() {
  const results = await testDatabaseViews();

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10 text-zinc-100">
      <h1 className="text-3xl font-bold mb-8">Database Views Test Results</h1>

      {/* Summary */}
      <div
        className={`mb-8 p-6 rounded-2xl border ${
          results.hasErrors
            ? "border-red-500/50 bg-red-900/20"
            : "border-green-500/50 bg-green-900/20"
        }`}
      >
        <h2 className="text-xl font-semibold mb-4">
          {results.hasErrors ? "❌ Tests Failed" : "✅ All Tests Passed"}
        </h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-zinc-400">Total Tests</div>
            <div className="text-2xl font-bold">{results.totalTests}</div>
          </div>
          <div>
            <div className="text-zinc-400">Passed</div>
            <div className="text-2xl font-bold text-green-400">
              {results.passedTests}
            </div>
          </div>
          <div>
            <div className="text-zinc-400">Failed</div>
            <div className="text-2xl font-bold text-red-400">
              {results.failedTests}
            </div>
          </div>
        </div>
      </div>

      {/* Individual Test Results */}
      <div className="space-y-4">
        {results.results.map((result, index) => (
          <div
            key={index}
            className={`p-6 rounded-2xl border ${
              result.success
                ? "border-green-500/50 bg-green-900/20"
                : "border-red-500/50 bg-red-900/20"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {result.success ? "✅" : "❌"} {result.view}
              </h3>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  result.success
                    ? "bg-green-600 text-green-100"
                    : "bg-red-600 text-red-100"
                }`}
              >
                {result.success ? "PASS" : "FAIL"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-zinc-400">Status</div>
                <div
                  className={result.success ? "text-green-400" : "text-red-400"}
                >
                  {result.success ? "Success" : "Error"}
                </div>
              </div>
              <div>
                <div className="text-zinc-400">Rows Returned</div>
                <div className="font-mono">{result.rowCount}</div>
              </div>
            </div>

            {result.error && (
              <div className="mt-4 p-4 bg-red-900/40 rounded-lg border border-red-500/30">
                <div className="text-red-300 font-semibold mb-2">
                  Error Details:
                </div>
                <div className="font-mono text-sm text-red-200">
                  {result.error}
                </div>
              </div>
            )}

            {result.sampleData && (
              <div className="mt-4 p-4 bg-zinc-800/40 rounded-lg border border-zinc-600/30">
                <div className="text-zinc-300 font-semibold mb-2">
                  Sample Data:
                </div>
                <pre className="text-sm text-zinc-200 overflow-x-auto">
                  {JSON.stringify(result.sampleData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Instructions */}
      <div className="mt-8 p-6 bg-zinc-800/40 rounded-2xl border border-zinc-600/30">
        <h3 className="text-lg font-semibold mb-4">What This Tests</h3>
        <ul className="space-y-2 text-sm text-zinc-300">
          <li>
            • <strong>RLS Policies:</strong> Verifies users can only access
            their own data
          </li>
          <li>
            • <strong>View Permissions:</strong> Confirms SELECT access works
            for authenticated users
          </li>
          <li>
            • <strong>Data Structure:</strong> Validates views return expected
            columns and data types
          </li>
          <li>
            • <strong>Authentication:</strong> Ensures cookie-based auth is
            working correctly
          </li>
        </ul>

        <div className="mt-4 p-4 bg-purple-900/20 rounded-lg border border-purple-500/30">
          <div className="text-purple-300 text-sm">
            <strong>Note:</strong> This page must be accessed by an
            authenticated user to properly test RLS policies. If you see
            authentication errors, ensure you&apos;re logged in.
          </div>
        </div>
      </div>
    </div>
  );
}
