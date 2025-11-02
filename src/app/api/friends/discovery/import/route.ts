import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { mapContactImportStatus } from "@/lib/friends/mappers";
import { getSupabaseServer } from "@/lib/supabase";

const BodySchema = z.object({
  totalContacts: z
    .number()
    .int()
    .min(0)
    .max(100_000)
    .optional(),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const parseResult = BodySchema.safeParse(payload ?? {});

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const cookieStore = cookies();
  const supabase = getSupabaseServer({
    get: (name: string) => cookieStore.get(name),
    set: () => {},
  });

  if (!supabase) {
    return NextResponse.json(
      { contactImport: mapContactImportStatus(null) },
      { status: 200 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { contactImport: mapContactImportStatus(null) },
      { status: 200 }
    );
  }

  const { totalContacts } = parseResult.data;

  const {
    data: existingRow,
    error: existingError,
  } = await supabase
    .from("friend_contact_imports")
    .select("id, user_id, total_contacts, imported_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    console.error("Failed to read contact import status", existingError);
    return NextResponse.json(
      { error: "Unable to update contacts." },
      { status: 500 }
    );
  }

  const desiredTotal = totalContacts ?? existingRow?.total_contacts ?? 0;

  const { data: upsertedRow, error: upsertError } = await supabase
    .from("friend_contact_imports")
    .upsert(
      {
        id: existingRow?.id,
        user_id: user.id,
        total_contacts: desiredTotal,
        imported_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("id, user_id, total_contacts, imported_at, updated_at")
    .single();

  if (upsertError) {
    console.error("Failed to update contact import status", upsertError);
    return NextResponse.json(
      { error: "Unable to update contacts." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { contactImport: mapContactImportStatus(upsertedRow) },
    { status: 200 }
  );
}
