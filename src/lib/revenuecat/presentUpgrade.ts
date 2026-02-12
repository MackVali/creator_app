import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";

export async function presentUpgrade(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    if (typeof window !== "undefined" && window.location) {
      window.location.href = "/settings/billing";
    } else {
      console.log("Redirect to /settings/billing");
    }
    return;
  }

  const offerings = await Purchases.getOfferings();
  const currentOffering = offerings?.current;
  if (!currentOffering) {
    throw new Error("Missing current offering");
  }

  const [firstPackage] = currentOffering.availablePackages;
  if (!firstPackage) {
    throw new Error("No packages available");
  }

  await Purchases.purchasePackage(firstPackage);
}
