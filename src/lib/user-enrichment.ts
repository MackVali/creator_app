import { z } from "zod";

export const userEnrichmentSchema = z.object({
  eventType: z.string().min(1),
  context: z.record(z.any()).optional(),
});

export type UserEnrichmentPayload = z.infer<typeof userEnrichmentSchema>;

export async function enqueueUserEnrichment(
  payload: UserEnrichmentPayload,
): Promise<void> {
  try {
    const response = await fetch("/api/user-enrichment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const detail = await safeReadText(response);
      console.error("Failed to enqueue user enrichment", detail);
    }
  } catch (error) {
    console.error("Failed to enqueue user enrichment", error);
  }
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch (error) {
    console.error("Failed to read enrichment response body", error);
    return undefined;
  }
}
