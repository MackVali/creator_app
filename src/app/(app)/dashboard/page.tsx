import React from "react";
import DashboardClient from "./DashboardClient";
import { getMySkills } from "@/data/skills";

export default async function DashboardPage() {
  // Fetch skills data on the server
  const skills = await getMySkills();
  
  return <DashboardClient skills={skills} />;
}
