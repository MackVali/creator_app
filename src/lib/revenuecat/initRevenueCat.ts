import { Capacitor } from "@capacitor/core"
import { Purchases } from "@revenuecat/purchases-capacitor"

let configured = false

export async function initRevenueCatIfCapacitor(userId: string) {
  if (!Capacitor.isNativePlatform()) {
    return
  }

  if (configured) {
    return
  }

  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY_IOS
  if (!apiKey) {
    return
  }

  try {
    await Purchases.configure({ apiKey, appUserID: userId })
    configured = true
  } catch (error) {
    console.error("Unable to configure RevenueCat", error)
  }
}
