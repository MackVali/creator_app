export default function EnvCheck() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return (
    <pre className="p-4 text-xs text-zinc-300">
      {JSON.stringify(
        {
          NEXT_PUBLIC_SUPABASE_URL: url ?? null,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: key
            ? `${key.slice(0, 8)}…${key.slice(-6)}`
            : null,
        },
        null,
        2
      )}
    </pre>
  );
}
