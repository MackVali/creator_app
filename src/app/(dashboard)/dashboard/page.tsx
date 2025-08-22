import { fetchDashboardData } from "./data";
import ClientDashboard from "./ClientDashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function DashboardPage() {
  const data = await fetchDashboardData();
  return <ClientDashboard {...data} />;
}
