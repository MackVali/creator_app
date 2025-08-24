"use client";

import { useState, useEffect } from "react";

interface EnvironmentInfo {
  timestamp: string;
  nodeVersion: string;
  nextVersion: string;
  environment: string;
  buildTime: string;
  runtime: string;
  platform: string;
  userAgent: string;
  viewport: string;
  cookies: string;
  localStorage: string;
  sessionStorage: string;
  envVars: Record<string, string>;
  buildId: string;
  deploymentId: string;
  region: string;
  url: string;
  referrer: string;
  timezone: string;
  language: string;
  colorScheme: string;
}

export default function DebugEnvPage() {
  const [envInfo, setEnvInfo] = useState<EnvironmentInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const gatherInfo = async () => {
      try {
        // Get environment variables (only public ones)
        const envVars: Record<string, string> = {};
        Object.keys(process.env).forEach((key) => {
          if (key.startsWith("NEXT_PUBLIC_") || key.startsWith("VITE_")) {
            envVars[key] = process.env[key] || "";
          }
        });

        // Get build information
        const buildId = process.env.NEXT_PUBLIC_BUILD_ID || "unknown";
        const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || "local";
        const region = process.env.VERCEL_REGION || "local";

        const info: EnvironmentInfo = {
          timestamp: new Date().toISOString(),
          nodeVersion: process.version,
          nextVersion: process.env.NEXT_VERSION || "unknown",
          environment: process.env.NODE_ENV || "development",
          buildTime: process.env.BUILD_TIME || "unknown",
          runtime: typeof window === "undefined" ? "server" : "client",
          platform: navigator?.platform || "unknown",
          userAgent: navigator?.userAgent || "unknown",
          viewport: `${window?.innerWidth || 0}x${window?.innerHeight || 0}`,
          cookies: document?.cookie || "none",
          localStorage: localStorage
            ? Object.keys(localStorage).join(", ")
            : "none",
          sessionStorage: sessionStorage
            ? Object.keys(sessionStorage).join(", ")
            : "none",
          envVars,
          buildId,
          deploymentId,
          region,
          url: window?.location.href || "unknown",
          referrer: document?.referrer || "none",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: navigator?.language || "unknown",
          colorScheme: window?.matchMedia("(prefers-color-scheme: dark)")
            ?.matches
            ? "dark"
            : "light",
        };

        setEnvInfo(info);
      } catch (error) {
        console.error("Error gathering environment info:", error);
      } finally {
        setLoading(false);
      }
    };

    gatherInfo();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">🔍 Environment Debug</h1>
          <div className="animate-pulse">
            Loading environment information...
          </div>
        </div>
      </div>
    );
  }

  if (!envInfo) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">🔍 Environment Debug</h1>
          <div className="text-red-400">
            Failed to load environment information
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">🔍 Environment Debug</h1>
        <p className="text-gray-300 mb-8">
          Compare this information between your local environment and Vercel
          preview to identify differences.
        </p>

        {/* Quick Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="font-semibold text-blue-400">Environment</h3>
            <p className="text-2xl font-bold">{envInfo.environment}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="font-semibold text-green-400">Runtime</h3>
            <p className="text-2xl font-bold">{envInfo.runtime}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="font-semibold text-purple-400">Build ID</h3>
            <p className="text-lg font-mono">{envInfo.buildId}</p>
          </div>
        </div>

        {/* Detailed Information */}
        <div className="space-y-6">
          {/* Build Information */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-bold mb-4 text-blue-400">
              🚀 Build Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-gray-400">Build Time:</span>
                <span className="ml-2 font-mono">{envInfo.buildTime}</span>
              </div>
              <div>
                <span className="text-gray-400">Build ID:</span>
                <span className="ml-2 font-mono">{envInfo.buildId}</span>
              </div>
              <div>
                <span className="text-gray-400">Deployment ID:</span>
                <span className="ml-2 font-mono">{envInfo.deploymentId}</span>
              </div>
              <div>
                <span className="text-gray-400">Region:</span>
                <span className="ml-2 font-mono">{envInfo.region}</span>
              </div>
            </div>
          </div>

          {/* Runtime Information */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-bold mb-4 text-green-400">
              ⚡ Runtime Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-gray-400">Node Version:</span>
                <span className="ml-2 font-mono">{envInfo.nodeVersion}</span>
              </div>
              <div>
                <span className="text-gray-400">Next Version:</span>
                <span className="ml-2 font-mono">{envInfo.nextVersion}</span>
              </div>
              <div>
                <span className="text-gray-400">Platform:</span>
                <span className="ml-2 font-mono">{envInfo.platform}</span>
              </div>
              <div>
                <span className="text-gray-400">Timezone:</span>
                <span className="ml-2 font-mono">{envInfo.timezone}</span>
              </div>
            </div>
          </div>

          {/* Browser Information */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-bold mb-4 text-yellow-400">
              🌐 Browser Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-gray-400">Language:</span>
                <span className="ml-2 font-mono">{envInfo.language}</span>
              </div>
              <div>
                <span className="text-gray-400">Color Scheme:</span>
                <span className="ml-2 font-mono">{envInfo.colorScheme}</span>
              </div>
              <div>
                <span className="text-gray-400">Viewport:</span>
                <span className="ml-2 font-mono">{envInfo.viewport}</span>
              </div>
              <div>
                <span className="text-gray-400">URL:</span>
                <span className="ml-2 font-mono text-sm break-all">
                  {envInfo.url}
                </span>
              </div>
            </div>
          </div>

          {/* Environment Variables */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-bold mb-4 text-purple-400">
              🔧 Environment Variables
            </h2>
            <div className="space-y-2">
              {Object.entries(envInfo.envVars).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center">
                  <span className="text-gray-400 font-mono text-sm">
                    {key}:
                  </span>
                  <span className="font-mono text-sm text-green-400">
                    {value || "(empty)"}
                  </span>
                </div>
              ))}
              {Object.keys(envInfo.envVars).length === 0 && (
                <div className="text-gray-500 italic">
                  No public environment variables found
                </div>
              )}
            </div>
          </div>

          {/* Storage Information */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-bold mb-4 text-orange-400">
              💾 Storage Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-gray-400">Local Storage Keys:</span>
                <div className="mt-1 font-mono text-sm text-gray-300 break-all">
                  {envInfo.localStorage}
                </div>
              </div>
              <div>
                <span className="text-gray-400">Session Storage Keys:</span>
                <div className="mt-1 font-mono text-sm text-gray-300 break-all">
                  {envInfo.sessionStorage}
                </div>
              </div>
            </div>
          </div>

          {/* User Agent */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-bold mb-4 text-red-400">
              📱 User Agent
            </h2>
            <div className="font-mono text-sm break-all bg-gray-700 p-3 rounded">
              {envInfo.userAgent}
            </div>
          </div>

          {/* Timestamp */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-bold mb-4 text-indigo-400">
              ⏰ Timestamp
            </h2>
            <div className="font-mono text-lg">{envInfo.timestamp}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-wrap gap-4">
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-semibold"
          >
            🔄 Refresh Data
          </button>
          <button
            onClick={() =>
              navigator.clipboard.writeText(JSON.stringify(envInfo, null, 2))
            }
            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-semibold"
          >
            📋 Copy JSON
          </button>
          <button
            onClick={() => window.print()}
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg font-semibold"
          >
            🖨️ Print Report
          </button>
        </div>
      </div>
    </div>
  );
}
