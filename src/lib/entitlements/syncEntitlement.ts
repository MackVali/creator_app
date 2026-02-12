export type EntitlementSyncResponse = {
  tier: "CREATOR" | "CREATOR PLUS"
  is_active: boolean
  current_period_end: string | null
}

export async function syncEntitlement(): Promise<EntitlementSyncResponse> {
  const response = await fetch("/api/me/entitlement/sync", {
    method: "POST",
  })

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null
    const message = errorPayload?.error ?? response.statusText ?? "Failed to sync entitlement."
    throw new Error(message)
  }

  return response.json() as Promise<EntitlementSyncResponse>
}
