import { NextRequest, NextResponse } from "next/server";
import { updateMyProfile } from "@/lib/db/profiles";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await updateMyProfile(body);

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
