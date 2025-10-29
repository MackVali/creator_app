"use client"

import { type ReactNode, useEffect, useRef, useState } from "react"
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Plug,
  RefreshCcw,
  Send,
  UploadCloud,
  X,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem } from "./ui/select"
import { Textarea } from "./ui/textarea"
import { PostModal } from "./ui/PostModal"

import type {
  IntegrationsResponse,
  ListingsResponse,
  PublishResult,
  SourceIntegration,
  SourceListing,
} from "@/types/source"
import { cn } from "@/lib/utils"

const httpMethods = ["POST", "PUT", "PATCH"] as const
const authModes = ["none", "bearer", "basic", "api_key", "oauth2"] as const
const listingStatuses: Record<SourceListing["status"], string> = {
  draft: "Draft",
  queued: "Queued",
  published: "Published",
  needs_attention: "Needs attention",
}

const statusAccent: Record<SourceListing["status"], string> = {
  draft: "bg-slate-800 text-slate-200",
  queued: "bg-sky-500/10 text-sky-300 border border-sky-500/30",
  published: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30",
  needs_attention: "bg-amber-500/10 text-amber-300 border border-amber-500/40",
}

type IntegrationFormState = {
  provider: string
  displayName: string
  connectionUrl: string
  publishUrl: string
  publishMethod: (typeof httpMethods)[number]
  authMode: (typeof authModes)[number]
  authToken: string
  authHeader: string
  headers: string
  payloadTemplate: string
  status: "active" | "disabled"
  oauthAuthorizeUrl: string
  oauthTokenUrl: string
  oauthScopes: string
  oauthClientId: string
  oauthClientSecret: string
  oauthMetadata: string
}

type ListingFormState = {
  type: "product" | "service"
  title: string
  description: string
  price: string
  currency: string
  inventory: string
  durationMinutes: string
  mediaUrls: string
  caption: string
  callToActionUrl: string
  socialNetworks: string
  hashtags: string
  metadata: string
}

type ApiError = { error: string }

const defaultIntegrationForm: IntegrationFormState = {
  provider: "",
  displayName: "",
  connectionUrl: "",
  publishUrl: "",
  publishMethod: "POST",
  authMode: "none",
  authToken: "",
  authHeader: "X-API-Key",
  headers: "",
  payloadTemplate: "",
  status: "active",
  oauthAuthorizeUrl: "",
  oauthTokenUrl: "",
  oauthScopes: "",
  oauthClientId: "",
  oauthClientSecret: "",
  oauthMetadata: "",
}

const defaultListingForm: ListingFormState = {
  type: "product",
  title: "",
  description: "",
  price: "",
  currency: "USD",
  inventory: "",
  durationMinutes: "",
  mediaUrls: "",
  caption: "",
  callToActionUrl: "",
  socialNetworks: "",
  hashtags: "",
  metadata: "",
}

type IntegrationPresetField = {
  id: string
  label: string
  placeholder?: string
  help?: string
  type?: "text" | "url" | "password"
}

type IntegrationPreset = {
  id: string
  label: string
  description: string
  docsUrl?: string
  fields: IntegrationPresetField[]
  build(inputs: Record<string, string>): Partial<IntegrationFormState>
}

const integrationPresets: IntegrationPreset[] = [
  {
    id: "shopify",
    label: "Shopify Admin",
    description:
      "Create products via the Shopify Admin REST API using a private app access token.",
    docsUrl: "https://shopify.dev/docs/api/admin-rest",
    fields: [
      {
        id: "storeDomain",
        label: "Store domain",
        placeholder: "your-shop.myshopify.com",
        help: "Use the myshopify.com domain for your storefront.",
      },
      {
        id: "accessToken",
        label: "Admin API access token",
        placeholder: "shpat_xxxxx",
        type: "password",
        help: "Generate from Shopify admin under Apps → Develop apps.",
      },
    ],
    build: (inputs) => {
      const domainInput = inputs.storeDomain?.trim()
      if (!domainInput) {
        throw new Error("Shopify store domain is required")
      }

      const normalizedDomain = domainInput.startsWith("http")
        ? domainInput
        : `https://${domainInput}`

      let parsed: URL
      try {
        parsed = new URL(normalizedDomain)
      } catch {
        throw new Error("Enter a valid Shopify domain")
      }

      const token = inputs.accessToken?.trim()
      if (!token) {
        throw new Error("Shopify access token is required")
      }

      const base = `${parsed.protocol}//${parsed.host}`

      const payload = {
        product: {
          title: "{{listing.title}}",
          body_html: "{{listing.description}}",
          status: "active",
          variants: [
            {
              price: "{{listing.price}}",
              sku: "{{listing.id}}",
              inventory_quantity: "{{listing.metadata.inventory}}",
            },
          ],
          tags: "{{listing.metadata.tags}}",
          product_type: "{{listing.metadata.product_type}}",
        },
      }

      return {
        provider: "Shopify",
        displayName: "Shopify Admin",
        connectionUrl: base,
        publishUrl: `${base}/admin/api/2024-01/products.json`,
        publishMethod: "POST",
        authMode: "api_key",
        authToken: token,
        authHeader: "X-Shopify-Access-Token",
        headers: JSON.stringify({}, null, 2),
        payloadTemplate: JSON.stringify(payload, null, 2),
        status: "active",
      }
    },
  },
  {
    id: "wix",
    label: "Wix Stores",
    description:
      "Push inventory into Wix Stores using an OAuth app and your site identifier.",
    docsUrl: "https://dev.wix.com/docs/rest/api-reference/stores",
    fields: [
      {
        id: "siteId",
        label: "Wix site ID",
        placeholder: "12345678-1234-1234-1234-1234567890ab",
        help: "Copy from Wix Developers → My Apps → Site details.",
      },
      {
        id: "accessToken",
        label: "OAuth access token",
        placeholder: "wix-access-token",
        type: "password",
        help: "Exchange your refresh token for an access token before saving.",
      },
    ],
    build: (inputs) => {
      const siteId = inputs.siteId?.trim()
      if (!siteId) {
        throw new Error("Wix site ID is required")
      }

      const token = inputs.accessToken?.trim()
      if (!token) {
        throw new Error("Wix access token is required")
      }

      const headers = {
        "wix-site-id": siteId,
      }

      const payload = {
        product: {
          name: "{{listing.title}}",
          description: {
            plainText: "{{listing.description}}",
          },
          price: {
            price: "{{listing.price}}",
            currency: "{{listing.currency}}",
          },
          ribbon: "{{listing.metadata.ribbon}}",
          sku: "{{listing.id}}",
        },
      }

      return {
        provider: "Wix Stores",
        displayName: "Wix",
        connectionUrl: "https://www.wix.com",
        publishUrl: "https://www.wixapis.com/stores/v1/products",
        publishMethod: "POST",
        authMode: "bearer",
        authToken: token,
        authHeader: "Authorization",
        headers: JSON.stringify(headers, null, 2),
        payloadTemplate: JSON.stringify(payload, null, 2),
        status: "active",
      }
    },
  },
  {
    id: "woocommerce",
    label: "WooCommerce",
    description:
      "Publish catalog entries to WooCommerce using the REST API consumer credentials.",
    docsUrl: "https://woocommerce.github.io/woocommerce-rest-api-docs/",
    fields: [
      {
        id: "storeUrl",
        label: "Storefront URL",
        placeholder: "https://store.example.com",
      },
      {
        id: "consumerKey",
        label: "Consumer key",
        placeholder: "ck_xxxxxxxxx",
        type: "password",
      },
      {
        id: "consumerSecret",
        label: "Consumer secret",
        placeholder: "cs_xxxxxxxxx",
        type: "password",
      },
    ],
    build: (inputs) => {
      const rawUrl = inputs.storeUrl?.trim()
      if (!rawUrl) {
        throw new Error("WooCommerce store URL is required")
      }

      let parsed: URL
      try {
        parsed = new URL(rawUrl)
      } catch {
        throw new Error("Enter a valid WooCommerce store URL")
      }

      const key = inputs.consumerKey?.trim()
      const secret = inputs.consumerSecret?.trim()
      if (!key || !secret) {
        throw new Error("WooCommerce consumer key and secret are required")
      }

      const base = `${parsed.protocol}//${parsed.host}`

      const payload = {
        name: "{{listing.title}}",
        type: "simple",
        regular_price: "{{listing.price}}",
        description: "{{listing.description}}",
        sku: "{{listing.id}}",
        stock_quantity: "{{listing.metadata.inventory}}",
        manage_stock: true,
      }

      return {
        provider: "WooCommerce",
        displayName: parsed.host,
        connectionUrl: base,
        publishUrl: `${base}/wp-json/wc/v3/products`,
        publishMethod: "POST",
        authMode: "basic",
        authToken: `${key}:${secret}`,
        authHeader: "Authorization",
        headers: JSON.stringify({ "Content-Type": "application/json" }, null, 2),
        payloadTemplate: JSON.stringify(payload, null, 2),
        status: "active",
      }
    },
  },
  {
    id: "ebay",
    label: "eBay Marketplace",
    description:
      "Authenticate with the eBay Sell APIs to push inventory into your connected marketplace account.",
    docsUrl: "https://developer.ebay.com/api-docs/sell/static/overview.html",
    fields: [
      {
        id: "environment",
        label: "Environment",
        placeholder: "production or sandbox",
        help: "Use production for live sellers or sandbox for testing credentials.",
      },
      {
        id: "clientId",
        label: "OAuth client ID",
        placeholder: "Your eBay App ID",
      },
      {
        id: "clientSecret",
        label: "OAuth client secret",
        placeholder: "Your eBay Cert ID",
        type: "password",
      },
    ],
    build: (inputs) => {
      const rawEnvironment = inputs.environment?.trim().toLowerCase()
      const environment = rawEnvironment === "sandbox" ? "sandbox" : "production"

      const clientId = inputs.clientId?.trim()
      if (!clientId) {
        throw new Error("eBay client ID is required")
      }

      const clientSecret = inputs.clientSecret?.trim()
      if (!clientSecret) {
        throw new Error("eBay client secret is required")
      }

      const authorizeUrl =
        environment === "sandbox"
          ? "https://auth.sandbox.ebay.com/oauth2/authorize"
          : "https://auth.ebay.com/oauth2/authorize"
      const tokenUrl =
        environment === "sandbox"
          ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
          : "https://api.ebay.com/identity/v1/oauth2/token"
      const apiBase =
        environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com"

      const payload = {
        sku: "{{listing.id}}",
        product: {
          title: "{{listing.title}}",
          description: "{{listing.description}}",
          aspects: {},
        },
        availability: {
          shipToLocationAvailability: {
            quantity: "{{listing.metadata.inventory}}",
          },
        },
        price: {
          currency: "{{listing.currency}}",
          value: "{{listing.price}}",
        },
      }

      const metadata = {
        environment,
        authorize_params: {
          prompt: "login",
        },
      }

      return {
        provider: "eBay",
        displayName: `eBay ${environment === "sandbox" ? "Sandbox" : "Marketplace"}`,
        connectionUrl: apiBase,
        publishUrl: `${apiBase}/sell/inventory/v1/inventory_item`,
        publishMethod: "POST" as const,
        authMode: "oauth2" as const,
        authToken: "",
        authHeader: "",
        headers: JSON.stringify({ "Content-Type": "application/json" }, null, 2),
        payloadTemplate: JSON.stringify(payload, null, 2),
        status: "active" as const,
        oauthAuthorizeUrl: authorizeUrl,
        oauthTokenUrl: tokenUrl,
        oauthScopes:
          "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.fulfillment",
        oauthClientId: clientId,
        oauthClientSecret: clientSecret,
        oauthMetadata: JSON.stringify(metadata, null, 2),
      }
    },
  },
  {
    id: "square",
    label: "Square Catalog",
    description:
      "Connect a Square application to keep your item catalog in sync with the listings you publish.",
    docsUrl: "https://developer.squareup.com/docs/catalog-api/overview",
    fields: [
      {
        id: "environment",
        label: "Environment",
        placeholder: "production or sandbox",
        help: "Match the environment configured for your Square OAuth app.",
      },
      {
        id: "applicationId",
        label: "OAuth application ID",
        placeholder: "sq0idp-xxxx",
      },
      {
        id: "applicationSecret",
        label: "OAuth application secret",
        placeholder: "sq0csp-xxxx",
        type: "password",
      },
      {
        id: "locationId",
        label: "Default location ID",
        placeholder: "L88917ABCD0X1",
        help: "Find this under Locations in the Square Dashboard.",
      },
    ],
    build: (inputs) => {
      const rawEnvironment = inputs.environment?.trim().toLowerCase()
      const environment = rawEnvironment === "sandbox" ? "sandbox" : "production"

      const applicationId = inputs.applicationId?.trim()
      if (!applicationId) {
        throw new Error("Square application ID is required")
      }

      const applicationSecret = inputs.applicationSecret?.trim()
      if (!applicationSecret) {
        throw new Error("Square application secret is required")
      }

      const locationId = inputs.locationId?.trim()
      if (!locationId) {
        throw new Error("Square location ID is required")
      }

      const domain =
        environment === "sandbox"
          ? "connect.squareupsandbox.com"
          : "connect.squareup.com"
      const baseUrl = `https://${domain}`

      const payload = {
        idempotency_key: "{{listing.id}}-{{listing.updated_at}}",
        object: {
          type: "ITEM",
          id: "#{{listing.id}}",
          item_data: {
            name: "{{listing.title}}",
            description: "{{listing.description}}",
            variations: [
              {
                type: "ITEM_VARIATION",
                id: "#{{listing.id}}-default",
                item_variation_data: {
                  item_id: "#{{listing.id}}",
                  name: "Standard",
                  pricing_type: "FIXED_PRICING",
                  price_money: {
                    amount: "{{listing.price}}",
                    currency: "{{listing.currency}}",
                  },
                  location_overrides: [
                    {
                      location_id: locationId,
                      track_inventory: true,
                    },
                  ],
                },
              },
            ],
          },
        },
      }

      const metadata = {
        environment,
      }

      return {
        provider: "Square",
        displayName: `Square ${environment === "sandbox" ? "Sandbox" : "Catalog"}`,
        connectionUrl: baseUrl,
        publishUrl: `${baseUrl}/v2/catalog/object`,
        publishMethod: "POST" as const,
        authMode: "oauth2" as const,
        authToken: "",
        authHeader: "",
        headers: JSON.stringify(
          {
            "Content-Type": "application/json",
            "Square-Version": "2024-05-15",
          },
          null,
          2
        ),
        payloadTemplate: JSON.stringify(payload, null, 2),
        status: "active" as const,
        oauthAuthorizeUrl: `${baseUrl}/oauth2/authorize`,
        oauthTokenUrl: `${baseUrl}/oauth2/token`,
        oauthScopes: "ITEMS_READ ITEMS_WRITE MERCHANT_PROFILE_READ",
        oauthClientId: applicationId,
        oauthClientSecret: applicationSecret,
        oauthMetadata: JSON.stringify(metadata, null, 2),
      }
    },
  },
  {
    id: "automation",
    label: "Zapier / Make bridge",
    description:
      "Trigger a no-code automation that can fan listings out to Depop, Facebook Marketplace, Craigslist, eBay, and more.",
    docsUrl: "https://zapier.com/apps/webhooks",
    fields: [
      {
        id: "webhookUrl",
        label: "Webhook URL",
        placeholder: "https://hooks.zapier.com/hooks/catch/...",
        type: "url",
        help: "Paste the catch hook URL from Zapier, Make, or n8n.",
      },
      {
        id: "connectionName",
        label: "Connection label",
        placeholder: "Marketplace autoposter",
      },
    ],
    build: (inputs) => {
      const urlInput = inputs.webhookUrl?.trim()
      if (!urlInput) {
        throw new Error("Webhook URL is required")
      }

      let parsed: URL
      try {
        parsed = new URL(urlInput)
      } catch {
        throw new Error("Enter a valid webhook URL")
      }

      const label = inputs.connectionName?.trim() || "Marketplace bridge"

      const payload = {
        listing: {
          id: "{{listing.id}}",
          title: "{{listing.title}}",
          description: "{{listing.description}}",
          price: "{{listing.price}}",
          currency: "{{listing.currency}}",
          type: "{{listing.type}}",
          metadata: "{{listing.metadata}}",
        },
        integration: {
          id: "{{integration.id}}",
          provider: "{{integration.provider}}",
          connectionUrl: "{{integration.connectionUrl}}",
        },
      }

      return {
        provider: label,
        displayName: label,
        connectionUrl: `${parsed.protocol}//${parsed.host}`,
        publishUrl: parsed.toString(),
        publishMethod: "POST",
        authMode: "none",
        authToken: "",
        authHeader: "X-API-Key",
        headers: JSON.stringify({ "X-Source-Channel": "source-automation" }, null, 2),
        payloadTemplate: JSON.stringify(payload, null, 2),
        status: "active",
      }
    },
  },
  {
    id: "universal-social",
    label: "Universal social poster",
    description:
      "Cross-post photo drops to Snapchat, Facebook, Instagram, and every other network from a single endpoint.",
    docsUrl: "https://buffer.com/developers/api",
    fields: [
      {
        id: "endpointUrl",
        label: "Poster endpoint",
        placeholder: "https://api.yourposter.com/posts",
        type: "url",
        help: "Use Buffer, a Zapier webhook, or your own API that fans posts out to each network.",
      },
      {
        id: "apiKey",
        label: "API key",
        placeholder: "Optional secret",
        type: "password",
        help: "If required, we send this as an X-API-Key header on every publish call.",
      },
      {
        id: "defaultNetworks",
        label: "Default networks",
        placeholder: "snapchat, facebook, instagram",
        help: "Comma or line separated list used when a post doesn't specify networks.",
      },
    ],
    build: (inputs) => {
      const rawEndpoint = inputs.endpointUrl?.trim()
      if (!rawEndpoint) {
        throw new Error("Poster endpoint URL is required")
      }

      let parsed: URL
      try {
        parsed = new URL(rawEndpoint)
      } catch {
        throw new Error("Enter a valid poster endpoint URL")
      }

      const apiKey = inputs.apiKey?.trim() ?? ""
      const defaultNetworks = inputs.defaultNetworks?.trim() ?? ""
      const networks = Array.from(
        new Set(
          defaultNetworks
            .split(/[\n,]+/)
            .flatMap((entry) => entry.split(/\s+/))
            .map((entry) => entry.trim().toLowerCase())
            .filter(Boolean)
        )
      )

      const headers: Record<string, string> = {
        "X-Source-Channel": "source-universal-poster",
      }

      if (networks.length > 0) {
        headers["X-Default-Platforms"] = networks.join(",")
      }

      const payload = {
        caption: "{{social.caption}}",
        media: "{{social.media}}",
        link: "{{social.link}}",
        platforms: "{{social.platforms}}",
        hashtags: "{{social.hashtags}}",
        defaults: {
          platforms: networks,
        },
        listing: {
          id: "{{listing.id}}",
          title: "{{listing.title}}",
          description: "{{listing.description}}",
          price: "{{listing.price}}",
          currency: "{{listing.currency}}",
          metadata: "{{listing.metadata}}",
        },
        integration: {
          id: "{{integration.id}}",
          provider: "{{integration.provider}}",
          connectionUrl: "{{integration.connectionUrl}}",
        },
      }

      const authMode = apiKey ? ("api_key" as const) : ("none" as const)

      return {
        provider: "Universal Social Poster",
        displayName: parsed.host,
        connectionUrl: `${parsed.protocol}//${parsed.host}`,
        publishUrl: parsed.toString(),
        publishMethod: "POST" as const,
        authMode,
        authToken: apiKey,
        authHeader: "X-API-Key",
        headers: JSON.stringify(headers, null, 2),
        payloadTemplate: JSON.stringify(payload, null, 2),
        status: "active" as const,
      }
    },
  },
]

const setupSteps: { id: string; title: string; description: string; icon: LucideIcon }[] = [
  {
    id: "choose",
    title: "Choose a connector",
    description:
      "Start with a preset to auto-fill URLs, headers, and payload tokens for popular storefronts.",
    icon: Plug,
  },
  {
    id: "authorize",
    title: "Authorize access",
    description:
      "Sign in with OAuth or drop in API keys so Source can publish on your behalf securely.",
    icon: Lock,
  },
  {
    id: "publish",
    title: "Publish everywhere",
    description:
      "Create a product or service once and we fan the listing out to every active integration instantly.",
    icon: UploadCloud,
  },
]

export default function Source() {
  const queryClient = useQueryClient()
  const [integrationForm, setIntegrationForm] = useState(defaultIntegrationForm)
  const [listingForm, setListingForm] = useState(defaultListingForm)
  const [integrationError, setIntegrationError] = useState<string | null>(null)
  const [listingError, setListingError] = useState<string | null>(null)
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [presetInputs, setPresetInputs] = useState<Record<string, string>>({})
  const [presetNotice, setPresetNotice] = useState<string | null>(null)
  const [presetError, setPresetError] = useState<string | null>(null)
  const [connectingIntegrationId, setConnectingIntegrationId] = useState<string | null>(null)
  const [showIntegrationAdvanced, setShowIntegrationAdvanced] = useState(false)
  const [isPostModalOpen, setIsPostModalOpen] = useState(false)
  const oauthWindowRef = useRef<Window | null>(null)

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (typeof window === "undefined") return
      if (event.origin !== window.location.origin) return
      if (!event.data || typeof event.data !== "object") return

      const data = event.data as Record<string, unknown>
      if (data.type !== "source:oauth:complete") return

      if (oauthWindowRef.current && !oauthWindowRef.current.closed) {
        oauthWindowRef.current.close()
      }
      oauthWindowRef.current = null
      setConnectingIntegrationId(null)

      if (data.status === "error" && typeof data.message === "string") {
        setIntegrationError(data.message)
      } else {
        setIntegrationError(null)
      }

      queryClient.invalidateQueries({ queryKey: ["source", "integrations"] })
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [queryClient])

  useEffect(() => {
    if (!connectingIntegrationId) return

    const watcher = window.setInterval(() => {
      const popup = oauthWindowRef.current
      if (!popup) {
        window.clearInterval(watcher)
        return
      }

      if (popup.closed) {
        window.clearInterval(watcher)
        oauthWindowRef.current = null
        setConnectingIntegrationId(null)
        setIntegrationError((prev) => prev ?? "Connection window closed before finishing authentication.")
      }
    }, 750)

    return () => window.clearInterval(watcher)
  }, [connectingIntegrationId])

  const beginOAuthConnection = async (integration: SourceIntegration) => {
    if (integration.auth_mode !== "oauth2") return

    if (!integration.oauth || !integration.oauth.authorize_url || !integration.oauth.token_url) {
      setIntegrationError(
        "Complete the OAuth configuration (authorization and token URLs) before connecting."
      )
      return
    }

    try {
      setIntegrationError(null)
      setConnectingIntegrationId(integration.id)

      const res = await fetch(`/api/source/integrations/${integration.id}/oauth/start`, {
        method: "POST",
      })

      const json = (await res.json().catch(() => null)) as
        | { authorizationUrl?: string }
        | ApiError
        | null

      if (!res.ok) {
        const error = json as ApiError | null
        throw new Error(error?.error ?? "Unable to start OAuth flow")
      }

      const authorizationUrl = (json as { authorizationUrl?: string } | null)?.authorizationUrl
      if (!authorizationUrl || typeof authorizationUrl !== "string") {
        throw new Error("OAuth provider did not return a redirect URL")
      }

      const popup = window.open(
        authorizationUrl,
        `source-oauth-${integration.id}`,
        "width=480,height=720,menubar=no,toolbar=no,status=no,scrollbars=yes"
      )

      if (!popup) {
        throw new Error("Enable pop-ups to continue connecting your account")
      }

      oauthWindowRef.current = popup
    } catch (error) {
      setConnectingIntegrationId(null)
      setIntegrationError(
        error instanceof Error ? error.message : "Unable to launch OAuth authentication"
      )
    }
  }

  const selectedPreset =
    selectedPresetId === null
      ? null
      : integrationPresets.find((preset) => preset.id === selectedPresetId) ?? null

  const handlePresetChange = (value: string) => {
    if (value === "manual") {
      setSelectedPresetId(null)
      setPresetInputs({})
      setPresetNotice(null)
      setPresetError(null)
      setShowIntegrationAdvanced(false)
      return
    }

    const preset = integrationPresets.find((item) => item.id === value) ?? null
    setSelectedPresetId(preset ? preset.id : null)

    if (preset) {
      const defaults: Record<string, string> = {}
      for (const field of preset.fields) {
        defaults[field.id] = ""
      }
      setPresetInputs(defaults)
      setShowIntegrationAdvanced(true)
    } else {
      setPresetInputs({})
      setShowIntegrationAdvanced(false)
    }

    setPresetNotice(null)
    setPresetError(null)
  }

  const handlePresetApply = () => {
    if (!selectedPreset) return

    try {
      const next = selectedPreset.build(presetInputs)
      setIntegrationForm((prev) => ({
        ...prev,
        ...next,
      }))
      setPresetNotice(
        `${selectedPreset.label} defaults applied. Review and save to finish.`
      )
      setPresetError(null)
      setShowIntegrationAdvanced(true)
    } catch (error) {
      setPresetNotice(null)
      setPresetError(
        error instanceof Error
          ? error.message
          : "Unable to apply connector template"
      )
    }
  }

  const integrationsQuery = useQuery<IntegrationsResponse, Error>({
    queryKey: ["source", "integrations"],
    queryFn: async () => {
      const res = await fetch("/api/source/integrations")
      const json = (await res.json().catch(() => null)) as
        | IntegrationsResponse
        | ApiError
        | null

      if (!res.ok) {
        throw new Error((json as ApiError | null)?.error ?? "Unable to load integrations")
      }

      return (json ?? { integrations: [] }) as IntegrationsResponse
    },
  })

  const listingsQuery = useQuery<ListingsResponse, Error>({
    queryKey: ["source", "listings"],
    queryFn: async () => {
      const res = await fetch("/api/source/listings")
      const json = (await res.json().catch(() => null)) as
        | ListingsResponse
        | ApiError
        | null

      if (!res.ok) {
        throw new Error((json as ApiError | null)?.error ?? "Unable to load listings")
      }

      return (json ?? { listings: [] }) as ListingsResponse
    },
  })

  const createIntegration = useMutation({
    mutationFn: async (payload: IntegrationFormState) => {
      let parsedHeaders: Record<string, unknown> | null = null
      if (payload.headers.trim()) {
        try {
          parsedHeaders = JSON.parse(payload.headers)
        } catch {
          throw new Error("Custom headers must be valid JSON")
        }
      }

      let parsedTemplate: Record<string, unknown> | null = null
      if (payload.payloadTemplate.trim()) {
        try {
          parsedTemplate = JSON.parse(payload.payloadTemplate)
        } catch {
          throw new Error("Payload template must be valid JSON")
        }
      }

      let parsedOauthMetadata: Record<string, unknown> | null = null
      if (payload.oauthMetadata.trim()) {
        try {
          parsedOauthMetadata = JSON.parse(payload.oauthMetadata)
        } catch {
          throw new Error("OAuth metadata must be valid JSON")
        }
      }

      const body = {
        provider: payload.provider.trim(),
        displayName: payload.displayName.trim() || null,
        connectionUrl: payload.connectionUrl.trim(),
        publishUrl: payload.publishUrl.trim(),
        publishMethod: payload.publishMethod,
        authMode: payload.authMode,
        authToken:
          payload.authMode === "none" || payload.authMode === "oauth2"
            ? null
            : payload.authToken.trim() || null,
        authHeader:
          payload.authMode === "api_key"
            ? payload.authHeader.trim() || "X-API-Key"
            : null,
        headers: parsedHeaders,
        payloadTemplate: parsedTemplate,
        status: payload.status,
        oauthAuthorizeUrl:
          payload.authMode === "oauth2" ? payload.oauthAuthorizeUrl.trim() || null : null,
        oauthTokenUrl:
          payload.authMode === "oauth2" ? payload.oauthTokenUrl.trim() || null : null,
        oauthScopes:
          payload.authMode === "oauth2"
            ? payload.oauthScopes.trim()
              ? payload.oauthScopes
              : null
            : null,
        oauthClientId:
          payload.authMode === "oauth2" ? payload.oauthClientId.trim() || null : null,
        oauthClientSecret:
          payload.authMode === "oauth2" ? payload.oauthClientSecret.trim() || null : null,
        oauthMetadata:
          payload.authMode === "oauth2" ? parsedOauthMetadata : null,
      }

      const res = await fetch("/api/source/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const error = (await res.json().catch(() => null)) as ApiError | null
        throw new Error(error?.error ?? "Unable to create integration")
      }

      return (await res.json()) as { integration: SourceIntegration }
    },
    onSuccess: (response) => {
      setIntegrationForm(defaultIntegrationForm)
      setIntegrationError(null)
      setSelectedPresetId(null)
      setPresetInputs({})
      setPresetNotice(null)
      setPresetError(null)
      queryClient.invalidateQueries({ queryKey: ["source", "integrations"] })

      if (
        response?.integration &&
        response.integration.auth_mode === "oauth2" &&
        response.integration.oauth &&
        !response.integration.oauth.connected
      ) {
        void beginOAuthConnection(response.integration)
      }
    },
    onError: (err: Error) => setIntegrationError(err.message),
  })

  const deleteIntegration = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/source/integrations/${id}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const error = (await res.json().catch(() => null)) as ApiError | null
        throw new Error(error?.error ?? "Unable to remove integration")
      }

      return true
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["source", "integrations"] })
    },
    onError: (err: Error) => setIntegrationError(err.message),
  })

  const createListing = useMutation({
    mutationFn: async (payload: ListingFormState) => {
      const metadata: Record<string, unknown> = {}

      if (payload.type === "product" && payload.inventory.trim()) {
        const count = Number.parseInt(payload.inventory, 10)
        if (Number.isNaN(count) || count < 0) {
          throw new Error("Inventory must be a positive integer")
        }
        metadata.inventory = count
      }

      if (payload.type === "service" && payload.durationMinutes.trim()) {
        const duration = Number.parseInt(payload.durationMinutes, 10)
        if (Number.isNaN(duration) || duration <= 0) {
          throw new Error("Duration must be a positive number of minutes")
        }
        metadata.duration_minutes = duration
      }

      if (payload.mediaUrls.trim()) {
        const mediaEntries = payload.mediaUrls
          .split(/[\n,]+/)
          .map((entry) => entry.trim())
          .filter(Boolean)

        if (mediaEntries.length > 0) {
          const media = mediaEntries.map((entry) => {
            try {
              const url = new URL(entry)
              return {
                url: url.toString(),
                type: "image" as const,
              }
            } catch {
              throw new Error(`Media URL must be valid: ${entry}`)
            }
          })

          metadata.media = media
        }
      }

      if (payload.caption.trim()) {
        metadata.caption = payload.caption.trim()
      }

      if (payload.callToActionUrl.trim()) {
        try {
          const url = new URL(payload.callToActionUrl.trim())
          metadata.call_to_action_url = url.toString()
        } catch {
          throw new Error("Call-to-action link must be a valid URL")
        }
      }

      if (payload.socialNetworks.trim()) {
        const networks = payload.socialNetworks
          .split(/[\n,]+/)
          .map((entry) => entry.trim().toLowerCase())
          .filter(Boolean)

        if (networks.length > 0) {
          metadata.social_channels = Array.from(new Set(networks))
        }
      }

      if (payload.hashtags.trim()) {
        const tags = payload.hashtags
          .split(/[\n,]+/)
          .map((entry) => entry.trim().replace(/^#+/, ""))
          .filter(Boolean)

        if (tags.length > 0) {
          metadata.hashtags = Array.from(
            new Set(tags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)))
          )
        }
      }

      if (payload.metadata.trim()) {
        const parsed = JSON.parse(payload.metadata)
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Additional metadata must be a JSON object")
        }
        Object.assign(metadata, parsed as Record<string, unknown>)
      }

      if (metadata.media || metadata.caption || metadata.social_channels || metadata.call_to_action_url) {
        metadata.post_kind = "universal_poster"
      }

      const body = {
        type: payload.type,
        title: payload.title.trim(),
        description: payload.description.trim() || null,
        price: payload.price.trim() ? Number.parseFloat(payload.price) : null,
        currency: payload.currency.trim() || "USD",
        metadata,
        publishNow: true,
      }

      if (!body.title) {
        throw new Error("A title is required")
      }

      if (body.price !== null && Number.isNaN(body.price)) {
        throw new Error("Price must be a number")
      }

      const res = await fetch("/api/source/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const error = (await res.json().catch(() => null)) as ApiError | null
        throw new Error(error?.error ?? "Unable to create listing")
      }

      return (await res.json()) as { listing: SourceListing }
    },
    onSuccess: () => {
      setListingForm(defaultListingForm)
      setListingError(null)
      queryClient.invalidateQueries({ queryKey: ["source", "listings"] })
    },
    onError: (err: Error) => setListingError(err.message),
  })

  const integrations = integrationsQuery.data?.integrations ?? []
  const listings = listingsQuery.data?.listings ?? []

  const activeIntegrationCount = integrations.filter(
    (integration) =>
      integration.status === "active" &&
      (integration.auth_mode !== "oauth2" || integration.oauth?.connected)
  ).length

  const integrationAdvancedForced = integrationForm.authMode === "oauth2"
  const integrationAdvancedVisible = integrationAdvancedForced || showIntegrationAdvanced

  const scrollToIntegrationForm = () => {
    if (typeof document === "undefined") return
    const el = document.getElementById("integration-form")
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-900/60 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Source
              </p>
              <h1 className="mt-1 text-3xl font-semibold text-white">
                Connect your storefronts
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-300">
                Link every website you sell on and publish listings once. Source
                will send the payload to each integration with the structure and
                headers you provide.
              </p>
            </div>
            <div className="flex flex-col gap-2 self-start md:flex-row md:items-center md:gap-3">
              <Button
                type="button"
                className="gap-2 bg-sky-500 text-white hover:bg-sky-400"
                onClick={() => setIsPostModalOpen(true)}
              >
                <Send className="size-4" /> Post everywhere
              </Button>
              <Badge className="h-fit gap-2 bg-amber-500/20 text-amber-200">
                <Plug className="size-3" /> Paid upgrade
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <Plug className="size-4 text-slate-300" />
              <span>
                {integrationsQuery.isLoading
                  ? "Loading connections..."
                  : `${activeIntegrationCount} active connection${
                      activeIntegrationCount === 1 ? "" : "s"
                    }`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <UploadCloud className="size-4 text-slate-300" />
              <span>
                {listingsQuery.isLoading
                  ? "Loading listings..."
                  : `${listings.length} recent listing${
                      listings.length === 1 ? "" : "s"
                    }`}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10">
        <section className="overflow-hidden rounded-2xl border border-slate-900/60 bg-slate-950/70 shadow-lg shadow-slate-950/40">
          <div className="flex flex-col gap-3 border-b border-slate-900/60 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">How Source syncs your listings</h2>
              <p className="text-sm text-slate-300">
                Follow these steps to connect storefronts and publish everywhere in minutes.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start md:self-auto"
              onClick={scrollToIntegrationForm}
            >
              Start connecting
            </Button>
          </div>
          <div className="grid gap-4 px-6 py-6 sm:grid-cols-2 lg:grid-cols-3">
            {setupSteps.map((step) => {
              const Icon = step.icon
              return (
                <div
                  key={step.id}
                  className="flex gap-3 rounded-xl border border-slate-900/60 bg-slate-950/60 p-4"
                >
                  <div className="rounded-lg bg-slate-900/60 p-2">
                    <Icon className="size-4 text-sky-300" />
                  </div>
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-white">{step.title}</p>
                    <p className="text-xs text-slate-400">{step.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Connected websites
              </h2>
              <p className="text-sm text-slate-300">
                Each integration defines how Source authenticates, which
                endpoint receives payloads, and any custom headers you need.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({
                  queryKey: ["source", "integrations"],
                })
              }}
              disabled={integrationsQuery.isFetching}
            >
              <RefreshCcw className="size-4" />
              Refresh
            </Button>
          </div>

          {integrationError && (
            <div className="rounded-md border border-rose-500/40 bg-rose-950/40 p-3 text-sm text-rose-200">
              {integrationError}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {integrationsQuery.isLoading &&
              Array.from({ length: 2 }).map((_, idx) => (
                <div
                  key={`integration-skeleton-${idx}`}
                  className="h-40 animate-pulse rounded-xl border border-slate-800/80 bg-slate-900/50"
                />
              ))}

            {!integrationsQuery.isLoading && integrations.length === 0 && (
              <div className="col-span-full rounded-xl border border-slate-800/70 bg-slate-900/40 p-6 text-sm text-slate-300">
                No connections yet. Add your first integration to sync listings
                anywhere you publish.
              </div>
            )}

            {integrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onRemove={() => deleteIntegration.mutate(integration.id)}
                removing={
                  deleteIntegration.isPending &&
                  deleteIntegration.variables === integration.id
                }
                onConnect={
                  integration.auth_mode === "oauth2" && !integration.oauth?.connected
                    ? () => beginOAuthConnection(integration)
                    : undefined
                }
                connecting={connectingIntegrationId === integration.id}
              />
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <form
            id="integration-form"
            className="rounded-2xl border border-slate-900/60 bg-slate-950/70 p-6 shadow-xl shadow-slate-950/40"
            onSubmit={(event) => {
              event.preventDefault()
              setIntegrationError(null)

              try {
                createIntegration.mutate(integrationForm)
              } catch (err) {
                if (err instanceof Error) setIntegrationError(err.message)
              }
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Add integration
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Provide the destination endpoint and any authentication so
                  Source can call it when you publish a listing.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4 rounded-xl border border-slate-900/70 bg-slate-950/60 p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">Connector library</p>
                <p className="text-xs text-slate-400">
                  Prefill this form for Shopify, Wix, WooCommerce, or trigger automation
                  hooks that fan listings out to Depop, Facebook Marketplace, Craigslist,
                  and more.
                </p>
              </div>
              <Select
                value={selectedPresetId ?? "manual"}
                onValueChange={handlePresetChange}
                placeholder="Manual setup"
              >
                <SelectContent>
                  <SelectItem value="manual">Manual setup</SelectItem>
                  {integrationPresets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedPreset && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-300">
                      {selectedPreset.description}
                    </p>
                    {selectedPreset.docsUrl && (
                      <a
                        href={selectedPreset.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-sky-300 hover:text-sky-200"
                      >
                        View docs
                      </a>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {selectedPreset.fields.map((field) => (
                      <div key={field.id} className="space-y-2">
                        <Label htmlFor={`preset-${field.id}`}>{field.label}</Label>
                        <Input
                          id={`preset-${field.id}`}
                          type={
                            field.type === "password"
                              ? "password"
                              : field.type === "url"
                              ? "url"
                              : "text"
                          }
                          value={presetInputs[field.id] ?? ""}
                          onChange={(event) =>
                            setPresetInputs((prev) => ({
                              ...prev,
                              [field.id]: event.target.value,
                            }))
                          }
                          placeholder={field.placeholder}
                        />
                        {field.help && (
                          <p className="text-xs text-slate-500">{field.help}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    {presetError ? (
                      <span className="text-rose-300">{presetError}</span>
                    ) : presetNotice ? (
                      <span className="text-emerald-300">{presetNotice}</span>
                    ) : (
                      <span className="text-slate-400">
                        Fill in the required details, then apply to load the integration
                        fields automatically.
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handlePresetApply}
                      disabled={!selectedPreset}
                    >
                      Apply details
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="space-y-5">
                <FormSubheading
                  title="Connection basics"
                  description="Tell Source where to send your listings and what to call the integration."
                />
                <div className="grid gap-4">
                  <FieldStack label="Platform" htmlFor="provider">
                    <Input
                      id="provider"
                      value={integrationForm.provider}
                      onChange={(event) =>
                        setIntegrationForm((prev) => ({
                          ...prev,
                          provider: event.target.value,
                        }))
                      }
                      placeholder="Shopify, Wix, Depop, Custom"
                      required
                    />
                  </FieldStack>

                  <FieldStack label="Display name" htmlFor="displayName">
                    <Input
                      id="displayName"
                      value={integrationForm.displayName}
                      onChange={(event) =>
                        setIntegrationForm((prev) => ({
                          ...prev,
                          displayName: event.target.value,
                        }))
                      }
                      placeholder="Shown in your integration list"
                    />
                  </FieldStack>

                  <FieldStack label="Website URL" htmlFor="connectionUrl">
                    <Input
                      id="connectionUrl"
                      value={integrationForm.connectionUrl}
                      onChange={(event) =>
                        setIntegrationForm((prev) => ({
                          ...prev,
                          connectionUrl: event.target.value,
                        }))
                      }
                      placeholder="https://yourstore.com"
                      type="url"
                      required
                    />
                  </FieldStack>

                  <FieldStack label="Publish endpoint" htmlFor="publishUrl">
                    <Input
                      id="publishUrl"
                      value={integrationForm.publishUrl}
                      onChange={(event) =>
                        setIntegrationForm((prev) => ({
                          ...prev,
                          publishUrl: event.target.value,
                        }))
                      }
                      placeholder="https://api.marketplace.com/v1/listings"
                      type="url"
                      required
                    />
                  </FieldStack>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldStack label="HTTP method" htmlFor="publishMethod">
                    <Select
                      value={integrationForm.publishMethod}
                      onValueChange={(value) =>
                        setIntegrationForm((prev) => ({
                          ...prev,
                          publishMethod: value as IntegrationFormState["publishMethod"],
                        }))
                      }
                    >
                      <SelectContent>
                        {httpMethods.map((method) => (
                          <SelectItem key={method} value={method}>
                            {method}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldStack>

                  <FieldStack label="Status" htmlFor="status">
                    <Select
                      value={integrationForm.status}
                      onValueChange={(value) =>
                        setIntegrationForm((prev) => ({
                          ...prev,
                          status: value as IntegrationFormState["status"],
                        }))
                      }
                    >
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldStack>
                </div>
              </div>

              <div className="space-y-5">
                <FormSubheading
                  title="Authentication"
                  description="Choose how Source authenticates when publishing to this channel."
                />
                <div className="grid gap-4">
                  <FieldStack label="Authentication" htmlFor="authMode">
                    <Select
                      value={integrationForm.authMode}
                      onValueChange={(value) => {
                        const nextMode = value as IntegrationFormState["authMode"]
                        setIntegrationForm((prev) => {
                          if (nextMode === "oauth2") {
                            return {
                              ...prev,
                              authMode: nextMode,
                              authToken: "",
                            }
                          }

                          return {
                            ...prev,
                            authMode: nextMode,
                            authToken: nextMode === "none" ? "" : prev.authToken,
                            oauthAuthorizeUrl: "",
                            oauthTokenUrl: "",
                            oauthScopes: "",
                            oauthClientId: "",
                            oauthClientSecret: "",
                            oauthMetadata: "",
                          }
                        })

                        if (nextMode === "oauth2") {
                          setShowIntegrationAdvanced(true)
                        }
                      }}
                    >
                      <SelectContent>
                        {authModes.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {mode === "api_key"
                              ? "API key header"
                              : mode === "none"
                              ? "No auth"
                              : mode.charAt(0).toUpperCase() + mode.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {integrationForm.authMode !== "none" && integrationForm.authMode !== "oauth2" && (
                      <p className="text-xs text-slate-400">
                        Stored securely in your Supabase project. Bearer tokens add
                        an Authorization header automatically. API keys let you
                        choose the header name (for example
                        <code className="mx-1 rounded bg-slate-800 px-1">
                          X-Shopify-Access-Token
                        </code>
                        ). Basic auth expects username:password.
                      </p>
                    )}
                    {integrationForm.authMode === "oauth2" && (
                      <p className="text-xs text-slate-400">
                        After saving, Source opens the provider&apos;s consent screen so you can
                        authorize access and capture tokens securely.
                      </p>
                    )}
                  </FieldStack>

                  {integrationForm.authMode !== "none" && integrationForm.authMode !== "oauth2" && (
                    <FieldStack label="Credentials" htmlFor="authToken">
                      <Input
                        id="authToken"
                        value={integrationForm.authToken}
                        onChange={(event) =>
                          setIntegrationForm((prev) => ({
                            ...prev,
                            authToken: event.target.value,
                          }))
                        }
                        placeholder={
                          integrationForm.authMode === "basic"
                            ? "username:password"
                            : "Secret value"
                        }
                        required
                      />
                    </FieldStack>
                  )}

                  {integrationForm.authMode === "api_key" && (
                    <FieldStack
                      label="API key header"
                      htmlFor="authHeader"
                      description="Choose the header name to send your key with (for example X-Shopify-Access-Token)."
                    >
                      <Input
                        id="authHeader"
                        value={integrationForm.authHeader}
                        onChange={(event) =>
                          setIntegrationForm((prev) => ({
                            ...prev,
                            authHeader: event.target.value,
                          }))
                        }
                        placeholder="X-API-Key"
                        required
                      />
                    </FieldStack>
                  )}

                  {integrationForm.authMode === "oauth2" && (
                    <div className="grid gap-4">
                      <FieldStack
                        label="Authorization URL"
                        htmlFor="oauth-authorize"
                        description="Where Source sends users to approve access."
                      >
                        <Input
                          id="oauth-authorize"
                          value={integrationForm.oauthAuthorizeUrl}
                          onChange={(event) =>
                            setIntegrationForm((prev) => ({
                              ...prev,
                              oauthAuthorizeUrl: event.target.value,
                            }))
                          }
                          placeholder="https://provider.com/oauth/authorize"
                          type="url"
                          required
                        />
                      </FieldStack>

                      <FieldStack
                        label="Token URL"
                        htmlFor="oauth-token"
                        description="Source exchanges the authorization code for tokens at this URL."
                      >
                        <Input
                          id="oauth-token"
                          value={integrationForm.oauthTokenUrl}
                          onChange={(event) =>
                            setIntegrationForm((prev) => ({
                              ...prev,
                              oauthTokenUrl: event.target.value,
                            }))
                          }
                          placeholder="https://provider.com/oauth/token"
                          type="url"
                          required
                        />
                      </FieldStack>

                      <FieldStack
                        label="Client ID"
                        htmlFor="oauth-client-id"
                        description="Registered OAuth client identifier."
                      >
                        <Input
                          id="oauth-client-id"
                          value={integrationForm.oauthClientId}
                          onChange={(event) =>
                            setIntegrationForm((prev) => ({
                              ...prev,
                              oauthClientId: event.target.value,
                            }))
                          }
                          placeholder="client-id-123"
                          required
                        />
                      </FieldStack>

                      <FieldStack
                        label="Client secret"
                        htmlFor="oauth-client-secret"
                        description="Stored securely and used during token refresh."
                      >
                        <Input
                          id="oauth-client-secret"
                          value={integrationForm.oauthClientSecret}
                          onChange={(event) =>
                            setIntegrationForm((prev) => ({
                              ...prev,
                              oauthClientSecret: event.target.value,
                            }))
                          }
                          placeholder="Optional"
                          type="password"
                        />
                      </FieldStack>

                      <FieldStack
                        label="Scopes"
                        htmlFor="oauth-scopes"
                        description="Space separated list of scopes requested during authorization."
                      >
                        <Input
                          id="oauth-scopes"
                          value={integrationForm.oauthScopes}
                          onChange={(event) =>
                            setIntegrationForm((prev) => ({
                              ...prev,
                              oauthScopes: event.target.value,
                            }))
                          }
                          placeholder="inventory.write listings.read"
                        />
                      </FieldStack>

                      <FieldStack
                        label="OAuth metadata (JSON)"
                        htmlFor="oauth-metadata"
                        description="Optional JSON persisted with the integration for custom providers."
                      >
                        <Textarea
                          id="oauth-metadata"
                          value={integrationForm.oauthMetadata}
                          onChange={(event) =>
                            setIntegrationForm((prev) => ({
                              ...prev,
                              oauthMetadata: event.target.value,
                            }))
                          }
                          rows={3}
                          placeholder='{"audience": "marketplace"}'
                        />
                      </FieldStack>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-4 rounded-2xl border border-slate-900/70 bg-slate-950/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Advanced options
                  </p>
                  <p className="text-xs text-slate-400">
                    Control custom headers and the JSON body Source sends to your integration.
                  </p>
                </div>
                {!integrationAdvancedForced && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowIntegrationAdvanced((prev) => !prev)}
                  >
                    {integrationAdvancedVisible ? "Hide advanced" : "Show advanced"}
                  </Button>
                )}
              </div>

              {integrationAdvancedVisible && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <FieldStack
                    label="Custom headers (JSON)"
                    htmlFor="headers"
                    description="Use key/value pairs for any additional headers you want on publish requests."
                  >
                    <Textarea
                      id="headers"
                      value={integrationForm.headers}
                      onChange={(event) =>
                        setIntegrationForm((prev) => ({
                          ...prev,
                          headers: event.target.value,
                        }))
                      }
                      placeholder='{"X-Shop-Domain": "{{integration.connectionUrl}}"}'
                      rows={integrationAdvancedForced ? 4 : 3}
                    />
                  </FieldStack>

                  <FieldStack
                    label="Payload template (JSON)"
                    htmlFor="payloadTemplate"
                    description="Optional structure for the request body. Use {{listing.title}} style tokens to reference listing data."
                  >
                    <Textarea
                      id="payloadTemplate"
                      value={integrationForm.payloadTemplate}
                      onChange={(event) =>
                        setIntegrationForm((prev) => ({
                          ...prev,
                          payloadTemplate: event.target.value,
                        }))
                      }
                      placeholder='{"name": "{{listing.title}}", "price": "{{listing.price}}"}'
                      rows={integrationAdvancedForced ? 6 : 5}
                    />
                  </FieldStack>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setIntegrationForm(defaultIntegrationForm)
                  setIntegrationError(null)
                  setSelectedPresetId(null)
                  setPresetInputs({})
                  setPresetNotice(null)
                  setPresetError(null)
                  setShowIntegrationAdvanced(false)
                }}
              >
                Reset
              </Button>
              <Button type="submit" disabled={createIntegration.isPending}>
                {createIntegration.isPending ? "Saving..." : "Save integration"}
              </Button>
            </div>
          </form>

          <form
            className="rounded-2xl border border-slate-900/60 bg-slate-950/70 p-6 shadow-xl shadow-slate-950/40"
            onSubmit={(event) => {
              event.preventDefault()
              setListingError(null)

              try {
                createListing.mutate(listingForm)
              } catch (err) {
                if (err instanceof Error) setListingError(err.message)
              }
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Publish listing
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Listings publish to every active integration immediately when
                  you choose “Publish now”.
                </p>
              </div>
            </div>

            {listingError && (
              <div className="mt-4 rounded-md border border-rose-500/40 bg-rose-950/40 p-3 text-sm text-rose-200">
                {listingError}
              </div>
            )}


            <div className="mt-5 space-y-6">
              <div className="rounded-xl border border-slate-900/60 bg-slate-950/60 p-4 text-xs text-slate-300">
                {activeIntegrationCount > 0 ? (
                  <span>
                    Publishing now will post to
                    {" "}
                    <span className="font-semibold text-white">
                      all {activeIntegrationCount} active connection{activeIntegrationCount === 1 ? "" : "s"}
                    </span>
                    . Check the delivery log below to confirm every marketplace accepts the payload.
                  </span>
                ) : (
                  <span>
                    Connect at least one integration above to start auto-posting listings everywhere you sell. We&apos;ll keep the draft ready until you finish connecting.
                  </span>
                )}
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div className="space-y-5">
                  <FormSubheading
                    title="Listing basics"
                    description="Give shoppers the title and context they&apos;ll see across every channel."
                  />
                  <div className="grid gap-4">
                    <FieldStack label="Type" htmlFor="listing-type">
                      <Select
                        value={listingForm.type}
                        onValueChange={(value) =>
                          setListingForm((prev) => ({
                            ...prev,
                            type: value as ListingFormState["type"],
                          }))
                        }
                      >
                        <SelectContent>
                          <SelectItem value="product">Product</SelectItem>
                          <SelectItem value="service">Service</SelectItem>
                        </SelectContent>
                      </Select>
                    </FieldStack>

                    <FieldStack label="Title" htmlFor="listing-title">
                      <Input
                        id="listing-title"
                        value={listingForm.title}
                        onChange={(event) =>
                          setListingForm((prev) => ({
                            ...prev,
                            title: event.target.value,
                          }))
                        }
                        placeholder="Summer drop or design sprint"
                        required
                      />
                    </FieldStack>

                    <FieldStack label="Description" htmlFor="listing-description">
                      <Textarea
                        id="listing-description"
                        value={listingForm.description}
                        onChange={(event) =>
                          setListingForm((prev) => ({
                            ...prev,
                            description: event.target.value,
                          }))
                        }
                        placeholder="What customers receive when they purchase"
                        rows={5}
                      />
                    </FieldStack>
                  </div>

                  <FormSubheading
                    title="Universal poster"
                    description="Attach media, captions, and destinations to fan out social posts automatically."
                  />
                  <div className="grid gap-4">
                    <FieldStack
                      label="Media URLs"
                      htmlFor="listing-media"
                      description="Paste one or more image links (comma or line separated) to share with every network."
                    >
                      <Textarea
                        id="listing-media"
                        value={listingForm.mediaUrls}
                        onChange={(event) =>
                          setListingForm((prev) => ({
                            ...prev,
                            mediaUrls: event.target.value,
                          }))
                        }
                        placeholder="https://cdn.example.com/post.jpg"
                        rows={3}
                      />
                    </FieldStack>

                    <FieldStack
                      label="Caption"
                      htmlFor="listing-caption"
                      description="We'll reuse this copy everywhere (falls back to your description if blank)."
                    >
                      <Textarea
                        id="listing-caption"
                        value={listingForm.caption}
                        onChange={(event) =>
                          setListingForm((prev) => ({
                            ...prev,
                            caption: event.target.value,
                          }))
                        }
                        placeholder="Announce your drop or story"
                        rows={3}
                      />
                    </FieldStack>

                    <FieldStack
                      label="Call-to-action link"
                      htmlFor="listing-cta"
                      description="Optional link we include with every social post."
                    >
                      <Input
                        id="listing-cta"
                        type="url"
                        value={listingForm.callToActionUrl}
                        onChange={(event) =>
                          setListingForm((prev) => ({
                            ...prev,
                            callToActionUrl: event.target.value,
                          }))
                        }
                        placeholder="https://yourstore.com/drop"
                      />
                    </FieldStack>

                    <FieldStack
                      label="Social networks"
                      htmlFor="listing-networks"
                      description="Comma separated list (snapchat, facebook, instagram) to target by default."
                    >
                      <Input
                        id="listing-networks"
                        value={listingForm.socialNetworks}
                        onChange={(event) =>
                          setListingForm((prev) => ({
                            ...prev,
                            socialNetworks: event.target.value,
                          }))
                        }
                        placeholder="snapchat, facebook, instagram"
                      />
                    </FieldStack>

                    <FieldStack
                      label="Hashtags"
                      htmlFor="listing-hashtags"
                      description="Add tags (comma or # separated) and we&apos;ll normalize them for each post."
                    >
                      <Input
                        id="listing-hashtags"
                        value={listingForm.hashtags}
                        onChange={(event) =>
                          setListingForm((prev) => ({
                            ...prev,
                            hashtags: event.target.value,
                          }))
                        }
                        placeholder="#summerdrop, #newin"
                      />
                    </FieldStack>
                  </div>
                </div>

                <div className="space-y-5">
                  <FormSubheading
                    title="Pricing & availability"
                    description="These values merge into every integration payload the moment you publish."
                  />
                  <div className="grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FieldStack label="Price" htmlFor="listing-price">
                        <Input
                          id="listing-price"
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={listingForm.price}
                          onChange={(event) =>
                            setListingForm((prev) => ({
                              ...prev,
                              price: event.target.value,
                            }))
                          }
                          placeholder="99.00"
                        />
                      </FieldStack>

                      <FieldStack label="Currency" htmlFor="listing-currency">
                        <Input
                          id="listing-currency"
                          value={listingForm.currency}
                          onChange={(event) =>
                            setListingForm((prev) => ({
                              ...prev,
                              currency: event.target.value.toUpperCase(),
                            }))
                          }
                          placeholder="USD"
                          maxLength={3}
                        />
                      </FieldStack>
                    </div>

                    {listingForm.type === "product" && (
                      <FieldStack label="Inventory" htmlFor="listing-inventory">
                        <Input
                          id="listing-inventory"
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={listingForm.inventory}
                          onChange={(event) =>
                            setListingForm((prev) => ({
                              ...prev,
                              inventory: event.target.value,
                            }))
                          }
                          placeholder="50"
                        />
                      </FieldStack>
                    )}

                    {listingForm.type === "service" && (
                      <FieldStack
                        label="Duration (minutes)"
                        htmlFor="listing-duration"
                      >
                        <Input
                          id="listing-duration"
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={listingForm.durationMinutes}
                          onChange={(event) =>
                            setListingForm((prev) => ({
                              ...prev,
                              durationMinutes: event.target.value,
                            }))
                          }
                          placeholder="60"
                        />
                      </FieldStack>
                    )}

                    <FieldStack
                      label="Additional metadata (JSON)"
                      htmlFor="listing-metadata"
                      description="Merge extra fields into the payload you send to partners."
                    >
                      <Textarea
                        id="listing-metadata"
                        value={listingForm.metadata}
                        onChange={(event) =>
                          setListingForm((prev) => ({
                            ...prev,
                            metadata: event.target.value,
                          }))
                        }
                        rows={4}
                        placeholder='{"tags": ["summer", "drop"], "sku": "SKU-1001"}'
                      />
                    </FieldStack>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setListingForm(defaultListingForm)
                  setListingError(null)
                }}
              >
                Reset
              </Button>
              <Button type="submit" disabled={createListing.isPending}>
                {createListing.isPending ? "Publishing..." : "Create listing"}
              </Button>
            </div>
          </form>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Recent listings
              </h2>
              <p className="text-sm text-slate-300">
                Track what was sent to each integration and surface payload
                errors instantly.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ["source", "listings"],
                })
              }
              disabled={listingsQuery.isFetching}
            >
              <RefreshCcw className="size-4" />
              Refresh
            </Button>
          </div>

          {listingsQuery.error && (
            <div className="rounded-md border border-rose-500/40 bg-rose-950/40 p-3 text-sm text-rose-200">
              {listingsQuery.error.message}
            </div>
          )}

          <div className="space-y-4">
            {listingsQuery.isLoading &&
              Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={`listing-skeleton-${idx}`}
                  className="h-32 animate-pulse rounded-xl border border-slate-900/80 bg-slate-950/60"
                />
              ))}

            {!listingsQuery.isLoading && listings.length === 0 && (
              <div className="rounded-xl border border-slate-900/70 bg-slate-950/60 p-6 text-sm text-slate-300">
                No listings yet. When you publish a product or service it will
                appear here with delivery status per integration.
              </div>
            )}

            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </section>
      </main>
      <PostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} />
    </div>
  )
}

type FieldStackProps = {
  label: string
  htmlFor: string
  description?: string
  children: ReactNode
}

function FieldStack({ label, htmlFor, description, children }: FieldStackProps) {
  return (
    <div className="space-y-2 text-sm">
      <Label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </Label>
      {children}
      {description && (
        <p className="text-xs text-slate-500">{description}</p>
      )}
    </div>
  )
}

type FormSubheadingProps = {
  title: string
  description?: string
}

function FormSubheading({ title, description }: FormSubheadingProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">{title}</p>
      {description && <p className="text-xs text-slate-400">{description}</p>}
    </div>
  )
}

type IntegrationCardProps = {
  integration: SourceIntegration
  removing: boolean
  onRemove(): void
  onConnect?: () => void
  connecting?: boolean
}

function IntegrationCard({ integration, removing, onRemove, onConnect, connecting }: IntegrationCardProps) {
  const headers = integration.headers ?? {}
  const authSummary = (() => {
    switch (integration.auth_mode) {
      case "bearer":
        return "Bearer token header"
      case "basic":
        return "HTTP basic auth"
      case "api_key":
        return `API key header: ${integration.auth_header || "X-API-Key"}`
      case "oauth2":
        return integration.oauth?.connected
          ? "OAuth 2.0 access token"
          : "OAuth 2.0 (connection required)"
      default:
        return "No authentication"
    }
  })()

  const oauthConnected = integration.auth_mode === "oauth2" && integration.oauth?.connected
  const oauthExpiresAt = integration.oauth?.expires_at ?? null
  const oauthExpiryLabel = (() => {
    if (!oauthExpiresAt) return null
    const date = new Date(oauthExpiresAt)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleString()
  })()

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-900/70 bg-slate-950/60 p-5">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Globe className="size-4 text-slate-300" />
              <p className="text-sm font-semibold text-white">
                {integration.display_name || integration.provider}
              </p>
            </div>
            <p className="break-all text-xs text-slate-400">{integration.connection_url}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Badge
              variant={integration.status === "active" ? "default" : "secondary"}
              className={cn(
                integration.status === "active"
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-slate-800 text-slate-300",
              )}
            >
              {integration.status === "active" ? "Active" : "Disabled"}
            </Badge>
            {integration.auth_mode === "oauth2" && (
              <Badge
                variant="secondary"
                className={cn(
                  "gap-1",
                  oauthConnected
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-100",
                )}
              >
                <Lock className="size-3" />
                {oauthConnected ? "Connected" : "Auth needed"}
              </Badge>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-900/70 bg-slate-950/70 p-3 text-xs text-slate-300">
          <p className="font-semibold text-slate-200">Publish request</p>
          <p className="mt-1 flex items-center gap-2 break-all font-mono text-[11px] text-slate-400">
            <span className="rounded bg-slate-900 px-2 py-0.5 uppercase tracking-wide">
              {integration.publish_method}
            </span>
            {integration.publish_url}
          </p>
        </div>

        <div className="space-y-2 text-xs text-slate-300">
          <div>
            <p className="font-semibold text-slate-200">Authentication</p>
            <p className="text-slate-400">{authSummary}</p>
          </div>
          {integration.auth_mode === "oauth2" && (
            <div className="flex flex-col gap-1 text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <Lock className={cn("size-3", oauthConnected ? "text-emerald-300" : "text-amber-300")} />
                <span>{oauthConnected ? "Authorized" : "Not authorized"}</span>
              </div>
              {oauthConnected && oauthExpiryLabel && (
                <span className="pl-5">Token refresh by {oauthExpiryLabel}</span>
              )}
              {!oauthConnected && (
                <span className="pl-5 text-amber-200">
                  Connect this integration so Source can publish automatically.
                </span>
              )}
            </div>
          )}
        </div>

        {Object.keys(headers).length > 0 && (
          <div className="space-y-2 text-xs text-slate-300">
            <p className="font-semibold text-slate-200">Custom headers</p>
            <div className="space-y-1">
              {Object.entries(headers).map(([key, value]) => (
                <div key={key} className="flex items-center gap-3 break-all font-mono text-[11px]">
                  <span className="rounded bg-slate-900 px-2 py-0.5 text-slate-200">{key}</span>
                  <span className="text-slate-400">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <a
          href={integration.connection_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-slate-300 hover:text-white"
        >
          Visit site <ExternalLink className="size-3" />
        </a>
        <div className="flex flex-wrap items-center gap-2">
          {onConnect && (
            <button
              type="button"
              onClick={onConnect}
              disabled={connecting || removing}
              className="inline-flex items-center gap-2 rounded border border-sky-500/40 px-2 py-1 text-sky-200 transition hover:bg-sky-500/10 disabled:opacity-50"
            >
              {connecting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Plug className="size-3" />
              )}
              {connecting ? "Connecting" : "Connect account"}
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className="inline-flex items-center gap-1 rounded border border-rose-500/40 px-2 py-1 text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-50"
          >
            <X className="size-3" />
            {removing ? "Removing" : "Disconnect"}
          </button>
        </div>
      </div>
    </div>
  )
}

type ListingCardProps = {
  listing: SourceListing
}

function ListingCard({ listing }: ListingCardProps) {
  const status = listing.status
  const publishResults = listing.publish_results ?? []

  return (
    <div className="rounded-2xl border border-slate-900/70 bg-slate-950/60 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{listing.title}</h3>
            <Badge className="bg-slate-800 text-slate-200">
              {listing.type === "product" ? "Product" : "Service"}
            </Badge>
          </div>
          <p className="text-sm text-slate-300">
            {listing.description || "No description"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <Badge className={cn("border", statusAccent[status])}>
            {listingStatuses[status]}
          </Badge>
          {listing.price !== null && (
            <p className="font-mono text-sm text-slate-200">
              {formatCurrency(listing.price, listing.currency)}
            </p>
          )}
          <p className="text-xs text-slate-400">
            Updated {formatRelativeTime(listing.updated_at)}
          </p>
        </div>
      </div>

      {Object.keys(listing.metadata ?? {}).length > 0 && (
        <div className="mt-4 space-y-1 rounded-lg border border-slate-900/60 bg-slate-950/80 p-3 text-xs text-slate-300">
          <p className="font-semibold text-slate-200">Metadata</p>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-slate-400">
            {JSON.stringify(listing.metadata, null, 2)}
          </pre>
        </div>
      )}

      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Delivery log
        </p>
        {publishResults.length === 0 ? (
          <p className="text-xs text-slate-400">
            Not sent to any integrations yet.
          </p>
        ) : (
          <div className="space-y-2">
            {publishResults.map((result, index) => (
              <PublishRow key={`${result.integrationId}-${index}`} result={result} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

type PublishRowProps = {
  result: PublishResult
}

function PublishRow({ result }: PublishRowProps) {
  const ok = result.status === "synced"
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3 text-xs transition",
        ok
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          : "border-amber-500/40 bg-amber-500/10 text-amber-100"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Plug className="size-3" />
          <span className="font-semibold">
            {result.integrationName || result.integrationId}
          </span>
        </div>
        <span className="font-mono">
          {ok ? "Synced" : "Failed"}
          {result.responseCode ? ` · ${result.responseCode}` : ""}
        </span>
      </div>
      {result.error && <p className="text-[11px]">{result.error}</p>}
      {result.responseBody && (
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">
          {JSON.stringify(result.responseBody, null, 2)}
        </pre>
      )}
    </div>
  )
}

  function formatCurrency(value: number, currency: string) {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
      }).format(value)
    } catch {
      return `${currency} ${value.toFixed(2)}`
    }
  }

function formatRelativeTime(iso: string) {
  const now = Date.now()
  const updated = new Date(iso).getTime()
  const diff = now - updated

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return "just now"
  if (diff < hour) {
    const minutes = Math.floor(diff / minute)
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  }
  if (diff < day) {
    const hours = Math.floor(diff / hour)
    return `${hours} hour${hours === 1 ? "" : "s"} ago`
  }
  const days = Math.floor(diff / day)
  return `${days} day${days === 1 ? "" : "s"} ago`
}
