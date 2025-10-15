import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase-server"

export const runtime = "nodejs"

type Params = {
  params: {
    id: string
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = params

  if (!id) {
    return NextResponse.json({ error: "Integration id is required" }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 }
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const { error } = await supabase
    .from("source_integrations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .single()

  if (error) {
    console.error("Failed to remove integration", error)
    const status = error.code === "PGRST116" ? 404 : 500
    return NextResponse.json(
      { error: status === 404 ? "Integration not found" : "Unable to remove integration" },
      { status }
    )
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
