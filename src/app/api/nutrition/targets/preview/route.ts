import { NextResponse } from "next/server";
import { authenticateNutritionTargetRequest, authoritativePreview, readJson } from "@/lib/nutrition/targetApi";

export async function POST(request: Request) {
  const auth = await authenticateNutritionTargetRequest(); if ("response" in auth) return auth.response;
  const json = await readJson(request); if ("response" in json) return json.response;
  const calculated = authoritativePreview(json.body); if ("response" in calculated) return calculated.response;
  return NextResponse.json({ preview: calculated.preview });
}
