import React from "react";
import { headers } from "next/headers";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const h = headers();
  const host = h.get("host");
  const safeHost = host ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${safeHost}`;
  const response = await fetch(`${origin}/api/dashboard`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return <DashboardClient />;
  }

  const data = await response.json();
  await response.json();

  return <DashboardClient />;
}
