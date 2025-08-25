import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return new Response("Failed to create Supabase client", { status: 500 });
    
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return new Response("Unauthorized", { status: 401 });

    const { name, icon, monument_id } = await req.json();
    if (!name?.trim() || !icon?.trim()) return new Response("Missing fields", { status: 400 });

    const { data, error } = await supabase
      .from("skills")
      .insert({
        user_id: auth.user.id,
        name: name.trim(),
        icon: icon.trim(),
        monument_id: monument_id || null,
        level: 1,
      })
      .select("id")
      .single();

    if (error) return new Response(error.message, { status: 400 });
    return Response.json({ id: data.id });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return new Response(message, { status: 500 });
  }
}
