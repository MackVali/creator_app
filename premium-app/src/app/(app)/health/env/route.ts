import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    if (!supabaseUrl) {
      return NextResponse.json(
        { 
          ok: false, 
          missing: ["NEXT_PUBLIC_SUPABASE_URL"] 
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { 
        ok: false, 
        error: "Internal server error" 
      },
      { status: 500 }
    );
  }
}
