import { NextResponse } from "next/server";

import { getBuyerProductCheckoutOrders } from "@/lib/queries/product-checkouts";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ orders: [] }, { status: 200 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const orders = await getBuyerProductCheckoutOrders({
    buyerUserId: user.id,
    limit: 50,
  });

  return NextResponse.json({ orders }, { status: 200 });
}
