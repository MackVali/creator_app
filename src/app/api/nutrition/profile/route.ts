import { NextResponse } from "next/server";
import { authenticateNutritionTargetRequest, profileRowFromProfileInput, readJson } from "@/lib/nutrition/targetApi";

export async function GET() {
  const auth = await authenticateNutritionTargetRequest(); if ("response" in auth) return auth.response;
  const [{ data: profile, error }, { data: goal }] = await Promise.all([
    auth.db.from("nutrition_profiles").select("*").eq("user_id", auth.user.id).maybeSingle(),
    auth.db.from("nutrition_goal_versions").select("*").eq("user_id", auth.user.id).is("effective_to", null).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: "Unable to load Nutrition profile" }, { status: 500 });
  return NextResponse.json({ profile, activeGoal: goal });
}

export async function PUT(request: Request) {
  const auth = await authenticateNutritionTargetRequest(); if ("response" in auth) return auth.response;
  const json = await readJson(request); if ("response" in json) return json.response;
  const profile = profileRowFromProfileInput(json.body); if ("response" in profile) return profile.response;
  const row = { user_id: auth.user.id, ...profile.row };
  const { data, error } = await auth.db.from("nutrition_profiles").upsert(row, { onConflict: "user_id" }).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to update Nutrition profile" }, { status: 500 });
  return NextResponse.json({ profile: data, activeGoalChanged: false });
}
