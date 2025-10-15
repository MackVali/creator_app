export async function GET() {
  const keys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const body = Object.fromEntries(
    keys.map((k) => {
      const v = process.env[k];
      const value = !v
        ? null
        : k.startsWith("NEXT_PUBLIC_")
        ? v
        : v.replace(/.(?=.{4})/g, "•");
      return [k, { present: !!v, value }];
    })
  );
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json" },
  });
}
