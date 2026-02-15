import { NextRequest, NextResponse } from "next/server";
import { updateMyOnboarding } from "@/lib/db/profiles";
import type { OnboardingUpdate } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as OnboardingUpdate;
    console.log("[onboarding/update] body", body);
    const result = await updateMyOnboarding(body);
    console.log("[onboarding/update] result", result);

    if (result.success) {
      return NextResponse.json(result, { status: 200 });
    }

    return NextResponse.json(result, { status: 400 });
  } catch (error) {
    console.error("Error in onboarding update route:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update onboarding" },
      { status: 400 }
    );
  }
}
