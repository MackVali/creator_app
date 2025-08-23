export const dynamic = "force-static"; // simple, no data fetching

export default function Page() {
  const builtAt = new Date().toISOString();
  return (
    <main style={{padding: 24, fontFamily: "ui-sans-serif, system-ui"}}>
      <h1 style={{fontSize: 24, fontWeight: 700, marginBottom: 8}}>Codex Smoke Test ✅</h1>
      <p>If you can see this page, Codex edits are flowing, build is good, and the deploy picked it up.</p>
      <pre style={{marginTop: 16, padding: 12, border: "1px solid #e5e7eb", borderRadius: 8}}>
{`route: /codex-ok
builtAt: ${builtAt}`}
      </pre>
    </main>
  );
}
