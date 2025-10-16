import React from "react";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  // This is now a pure server component that can fetch data
  // No interactive elements, just data fetching and rendering

  // TODO: Add data fetching here when needed

  return <DashboardClient />;
}
