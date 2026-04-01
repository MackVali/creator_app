import { PageShell } from "@/components/ui";
import BillingPageClient from "./BillingPageClient";

export const metadata = {
  title: "Billing",
};

export default function BillingPage() {
  return (
    <PageShell title="Billing">
      <BillingPageClient />
    </PageShell>
  );
}
