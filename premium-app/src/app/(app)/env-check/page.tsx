"use client";
export default function Page() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return (
    <div style={{ padding: 20 }}>
      <h1>Env Check</h1>
      <pre>NEXT_PUBLIC_SUPABASE_URL: {url ? url : "(missing)"}</pre>
      <pre>NEXT_PUBLIC_SUPABASE_ANON_KEY: {anon ? "present" : "(missing)"}</pre>
    </div>
  );
}
