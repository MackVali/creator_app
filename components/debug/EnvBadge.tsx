"use client";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    __ENV_OK__: boolean;
  }
}

export default function EnvBadge() {
  const isPreview =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const has = Boolean(url && key);
    window.__ENV_OK__ = has;
    setOk(has);
  }, [url, key]);

  if (!isPreview) return null;
  return (
    <div
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        padding: "10px 12px",
        background: "rgba(20,20,20,.8)",
        color: "#ddd",
        border: "1px solid #333",
        borderRadius: 10,
        fontSize: 12,
        zIndex: 9999,
        backdropFilter: "blur(6px)",
      }}
    >
      <div>PREVIEW DIAG</div>
      <div>VERCEL_ENV: preview</div>
      <div>SUPABASE_URL: {url ? `${url.slice(0, 24)}…` : "MISSING"}</div>
      <div>ENV_OK: {ok ? "true" : "false"}</div>
    </div>
  );
}
