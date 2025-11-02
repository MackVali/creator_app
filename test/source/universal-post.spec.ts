import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}))

vi.mock("@/app/api/source/listings/route", async () => {
  const actual = await vi.importActual<typeof import("@/app/api/source/listings/route")>(
    "@/app/api/source/listings/route"
  )
  return {
    ...actual,
    publishToIntegrations: vi.fn(),
  }
})

import { POST } from "@/app/api/universal-post/route"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { publishToIntegrations } from "@/app/api/source/listings/route"
import type { PublishResult } from "@/types/source"

const createSupabaseServerClientMock = vi.mocked(createSupabaseServerClient)
const publishToIntegrationsMock = vi.mocked(publishToIntegrations)

describe("POST /api/universal-post", () => {
  beforeEach(() => {
    createSupabaseServerClientMock.mockReset()
    publishToIntegrationsMock.mockReset()
  })

  it("returns 401 when the user is not authenticated", async () => {
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as never)

    const request = new Request("http://localhost/api/universal-post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Hello", content: "World" }),
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Not authenticated" })
  })

  it("persists the listing, fans out to integrations, and returns the stored record", async () => {
    const integrationRow = {
      id: "integration-1",
      provider: "threads",
      display_name: "Threads",
      connection_url: "https://threads.example.com",
      publish_url: "https://threads.example.com/api/post",
      publish_method: "POST",
      auth_mode: "bearer",
      auth_token: "token",
      auth_header: "Authorization",
      headers: null,
      payload_template: null,
      status: "active",
      oauth_token_url: null,
      oauth_client_id: null,
      oauth_client_secret: null,
      oauth_access_token: null,
      oauth_refresh_token: null,
      oauth_expires_at: null,
      oauth_scopes: null,
      oauth_metadata: null,
    }

    const integrationQueryResult = {
      data: [integrationRow],
      error: null,
    }

    const integrationQuery = Promise.resolve(integrationQueryResult) as unknown as {
      select: (...args: unknown[]) => typeof integrationQuery
      eq: (...args: unknown[]) => typeof integrationQuery
      in: (...args: unknown[]) => typeof integrationQuery
    }
    integrationQuery.select = vi.fn().mockReturnValue(integrationQuery)
    integrationQuery.eq = vi.fn().mockReturnValue(integrationQuery)
    integrationQuery.in = vi.fn().mockReturnValue(integrationQuery)

    const now = new Date().toISOString()

    const insertedRow = {
      id: "post-1",
      user_id: "user-1",
      type: "post",
      title: "Launch day",
      description: "We just shipped",
      price: null,
      currency: "USD",
      status: "queued",
      metadata: {
        kind: "post",
        post: {
          title: "Launch day",
          content: "We just shipped",
          media: [
            { url: "https://cdn.example.com/launch.png", type: "image" },
          ],
          mediaTypes: ["image"],
          selectedIntegrationIds: ["integration-1"],
          deliveredIntegrationIds: ["integration-1"],
          missingIntegrationIds: null,
        },
      },
      publish_results: null,
      published_at: null,
      created_at: now,
      updated_at: now,
    }

    const updatedRow = {
      ...insertedRow,
      status: "published",
      publish_results: [
        {
          integrationId: "integration-1",
          integrationName: "Threads",
          status: "synced",
          responseCode: 200,
          responseBody: { ok: true },
          error: null,
          externalId: "post-42",
          completedAt: now,
        },
      ],
      published_at: now,
    }

    const insertSingle = vi.fn().mockResolvedValue({ data: insertedRow, error: null })
    const updateSingle = vi.fn().mockResolvedValue({ data: updatedRow, error: null })

    const sourceListingsTable = {
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: insertSingle,
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: updateSingle,
            }),
          }),
        }),
      }),
    }

    const supabaseStub = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
      from: vi.fn((table: string) => {
        if (table === "source_integrations") {
          return integrationQuery
        }
        if (table === "source_listings") {
          return sourceListingsTable
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    }

    createSupabaseServerClientMock.mockResolvedValue(supabaseStub as never)

    const publishResults: PublishResult[] = [
      {
        integrationId: "integration-1",
        integrationName: "Threads",
        status: "synced",
        responseCode: 200,
        responseBody: { ok: true },
        error: null,
        externalId: "post-42",
        completedAt: now,
      },
    ]

    publishToIntegrationsMock.mockResolvedValue({
      publishResults,
      nextStatus: "published",
    })

    const request = new Request("http://localhost/api/universal-post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Launch day",
        content: "We just shipped",
        media: [{ url: "https://cdn.example.com/launch.png", type: "image" }],
        mediaTypes: ["image"],
        integrationIds: ["integration-1"],
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(201)

    const payload = await response.json()
    expect(payload.listing).toMatchObject({
      id: "post-1",
      type: "post",
      status: "published",
    })
    expect(payload.results).toEqual(publishResults)
    expect(payload.usedIntegrationIds).toEqual(["integration-1"])

    expect(sourceListingsTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        type: "post",
        metadata: expect.objectContaining({
          kind: "post",
        }),
      })
    )

    expect(publishToIntegrationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        listing: expect.objectContaining({
          type: "post",
          metadata: expect.objectContaining({
            post: expect.objectContaining({
              mediaTypes: ["image"],
            }),
          }),
        }),
      })
    )

    expect(sourceListingsTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        publish_results: publishResults,
        status: "published",
      })
    )
    expect(updateSingle).toHaveBeenCalled()
  })
})
