import { Capacitor } from "@capacitor/core"
import { Purchases } from "@revenuecat/purchases-capacitor"

let configuredUserId: string | null = null
let configurePromise: Promise<void> | null = null

export async function ensureRevenueCatConfigured(userId: string) {
  if (!Capacitor.isNativePlatform()) {
    return
  }

  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY_IOS
  if (!apiKey) {
    throw new Error("RevenueCat iOS API key is not configured.")
  }

  if (configuredUserId === userId) {
    return
  }

  const { isConfigured } = await Purchases.isConfigured().catch(() => ({
    isConfigured: false,
  }))

  if (isConfigured) {
    const currentAppUser = await Purchases.getAppUserID().catch(() => null)

    if (currentAppUser?.appUserID !== userId) {
      await Purchases.logIn({ appUserID: userId })
    }

    configuredUserId = userId
    return
  }

  configurePromise ??= Purchases.configure({ apiKey, appUserID: userId })
    .then(() => {
      configuredUserId = userId
    })
    .catch((error) => {
      configurePromise = null
      throw error
    })

  await configurePromise
}

export async function initRevenueCatIfCapacitor(userId: string) {
  if (!Capacitor.isNativePlatform()) {
    return
  }

  try {
    await ensureRevenueCatConfigured(userId)
  } catch (error) {
    console.error("Unable to configure RevenueCat", error)
  }
}
