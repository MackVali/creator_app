import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const INQUIRY_SELECT =
  "id,site_handle,page_id,section_id,sender_name,sender_email,message,status,created_at";

type InquiryRow = {
  id: string;
  site_handle: string;
  page_id: string;
  section_id: string;
  sender_name: string;
  sender_email: string;
  message: string;
  status: "new" | "read" | "archived";
  created_at: string;
};

type InquiryQueryResult<T> = PromiseLike<{
  data: T | null;
  error: PostgrestError | null;
}>;

type InquirySelectBuilder =
  InquiryQueryResult<InquiryRow[]> & {
    eq(
      column: "site_user_id",
      value: string,
    ): InquirySelectBuilder;

    order(
      column: "created_at",
      options: {
        ascending: boolean;
      },
    ): InquirySelectBuilder;

    limit(
      count: number,
    ): InquiryQueryResult<InquiryRow[]>;
  };

type InquiryTable = {
  select(
    columns: typeof INQUIRY_SELECT,
  ): InquirySelectBuilder;
};

function getInquiryTable(
  supabase: NonNullable<
    Awaited<
      ReturnType<
        typeof createSupabaseServerClient
      >
    >
  >,
) {
  const from = supabase.from as unknown as (
    table: "site_builder_inquiries",
  ) => InquiryTable;

  return from("site_builder_inquiries");
}

export async function GET() {
  const supabase =
    await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 },
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 },
    );
  }

  const { data, error } =
    await getInquiryTable(supabase)
      .select(INQUIRY_SELECT)
      .eq("site_user_id", user.id)
      .order("created_at", {
        ascending: false,
      })
      .limit(100);

  if (error) {
    console.error(
      "Failed to load Site inquiries",
      error,
    );

    return NextResponse.json(
      { error: "Unable to load inquiries" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    inquiries: data ?? [],
  });
}
