import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SourceListing } from "@/types/source"
import { publishToIntegrations, type IntegrationRow } from "@/lib/source/publisher"

describe("publishToIntegrations", () => {
  const supabaseStub = {
    from: vi.fn(),
  }

  beforeEach(() => {
    vi.spyOn(global, "fetch")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("sends the listing payload to every integration and reports their outcomes", async () => {
    const listing: SourceListing = {
      id: "listing-1",
      type: "product",
      title: "Vintage jacket",
      description: "90s denim jacket",
      price: 120,
      currency: "USD",
      status: "queued",
      metadata: { color: "blue", size: "L" },
      publish_results: null,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const integrations: IntegrationRow[] = [
      {
        id: "integration-1",
        provider: "shopify",
        display_name: "Shopify Store",
        connection_url: "https://shopify.example.com",
        publish_url: "https://shopify.example.com/products",
        publish_method: "POST",
        auth_mode: "api_key",
        auth_token: "secret",
        auth_header: "X-Shopify-Token",
        headers: { "X-Channel": "{{ integration.provider }}" },
        payload_template: {
          title: "{{ listing.title }}",
          price: "{{ listing.price }}",
          metadata: "{{ listing.metadata }}",
        },
        status: "active",
        oauth_token_url: null,
        oauth_client_id: null,
        oauth_client_secret: null,
        oauth_access_token: null,
        oauth_refresh_token: null,
        oauth_expires_at: null,
        oauth_scopes: null,
        oauth_metadata: null,
      },
      {
        id: "integration-2",
        provider: "facebook",
        display_name: "Facebook Marketplace",
        connection_url: "https://facebook.example.com",
        publish_url: "https://facebook.example.com/listings",
        publish_method: "POST",
        auth_mode: "bearer",
        auth_token: "fb-token",
        auth_header: null,
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
      },
    ]

    const fetchMock = vi
      .mocked(global.fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "shopify-42" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "quota" }), {
          status: 429,
          statusText: "Too Many Requests",
          headers: { "content-type": "application/json" },
        })
      )

    const publishContext = {
      ...listing,
      metadata: listing.metadata ?? {},
    }

    const { publishResults, nextStatus } = await publishToIntegrations({
      supabase: supabaseStub as never,
      integrations,
      userId: "user-1",
      context: {
        key: "listing",
        data: publishContext,
        buildDefaultPayload: ({ data, integration }) => ({
          id: data.id,
          type: data.type,
          title: data.title,
          description: data.description,
          price: data.price,
          currency: data.currency,
          metadata: data.metadata,
          published_at: data.published_at,
          updated_at: data.updated_at,
          integration,
        }),
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      integrations[0].publish_url,
      expect.objectContaining({
        method: "POST",
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      integrations[1].publish_url,
      expect.objectContaining({
        method: "POST",
      })
    )

    expect(publishResults).toHaveLength(2)
    expect(publishResults[0]).toMatchObject({
      integrationId: "integration-1",
      status: "synced",
      externalId: "shopify-42",
    })
    expect(publishResults[1]).toMatchObject({
      integrationId: "integration-2",
      status: "failed",
      error: "Too Many Requests",
    })
    expect(nextStatus).toBe("needs_attention")
  })
})
