"use client"

import { type ReactNode, useState } from "react"
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  ExternalLink,
  Globe,
  Plug,
  RefreshCcw,
  UploadCloud,
  X,
} from "lucide-react"

import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem } from "./ui/select"
import { Textarea } from "./ui/textarea"

import type {
  IntegrationsResponse,
  ListingsResponse,
  PublishResult,
  SourceIntegration,
  SourceListing,
} from "@/types/source"
import { cn } from "@/lib/utils"

const httpMethods = ["POST", "PUT", "PATCH"] as const
const authModes = ["none", "bearer", "basic", "api_key"] as const
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
}

type ListingFormState = {
  type: "product" | "service"
  title: string
  description: string
  price: string
  currency: string
  inventory: string
  durationMinutes: string
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
}

const defaultListingForm: ListingFormState = {
  type: "product",
  title: "",
  description: "",
  price: "",
  currency: "USD",
  inventory: "",
  durationMinutes: "",
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
        headers: JSON.stringify({"Content-Type": "application/json"}, null, 2),
        payloadTemplate: JSON.stringify(payload, null, 2),
        status: "active",
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
    } else {
      setPresetInputs({})
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
      const body = {
        provider: payload.provider.trim(),
        displayName: payload.displayName.trim() || null,
        connectionUrl: payload.connectionUrl.trim(),
        publishUrl: payload.publishUrl.trim(),
        publishMethod: payload.publishMethod,
        authMode: payload.authMode,
        authToken: payload.authToken.trim() || null,
        authHeader:
          payload.authMode === "api_key"
            ? payload.authHeader.trim() || "X-API-Key"
            : null,
        headers: payload.headers.trim() ? JSON.parse(payload.headers) : null,
        payloadTemplate: payload.payloadTemplate.trim()
          ? JSON.parse(payload.payloadTemplate)
          : null,
        status: payload.status,
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
    onSuccess: () => {
      setIntegrationForm(defaultIntegrationForm)
      setIntegrationError(null)
      setSelectedPresetId(null)
      setPresetInputs({})
      setPresetNotice(null)
      setPresetError(null)
      queryClient.invalidateQueries({ queryKey: ["source", "integrations"] })
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

      if (payload.metadata.trim()) {
        const parsed = JSON.parse(payload.metadata)
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Additional metadata must be a JSON object")
        }
        Object.assign(metadata, parsed as Record<string, unknown>)
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
    (integration) => integration.status === "active"
  ).length

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
            <Badge className="h-fit gap-2 bg-amber-500/20 text-amber-200">
              <Plug className="size-3" /> Paid upgrade
            </Badge>
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
              />
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <form
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

            <div className="mt-5 grid gap-4">
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
                  placeholder="Optional label for dashboards"
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
                  placeholder="https://your-storefront.example"
                  required
                  type="url"
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
                  placeholder="https://api.example.com/listings"
                  required
                  type="url"
                />
              </FieldStack>

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
                        status: value as "active" | "disabled",
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

              <FieldStack label="Authentication" htmlFor="authMode">
                <Select
                  value={integrationForm.authMode}
                  onValueChange={(value) =>
                    setIntegrationForm((prev) => ({
                      ...prev,
                      authMode: value as IntegrationFormState["authMode"],
                    }))
                  }
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
                {integrationForm.authMode !== "none" && (
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
              </FieldStack>

              {integrationForm.authMode !== "none" && (
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
                  rows={4}
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
                  rows={6}
                />
              </FieldStack>
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

            <div className="mt-5 grid gap-4">
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

              <div className="rounded-lg border border-slate-800/70 bg-slate-900/60 p-3 text-xs text-slate-300">
                {activeIntegrationCount > 0 ? (
                  <>
                    This listing will publish instantly to your {activeIntegrationCount}
                    {" "}
                    active integration{activeIntegrationCount === 1 ? "" : "s"} once you
                    hit create.
                  </>
                ) : (
                  <>
                    Add an integration to automatically post new listings everywhere you
                    sell. Drafts are stored even before connections are configured.
                  </>
                )}
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

type IntegrationCardProps = {
  integration: SourceIntegration
  removing: boolean
  onRemove(): void
}

function IntegrationCard({ integration, removing, onRemove }: IntegrationCardProps) {
  const headers = integration.headers ?? {}
  const authSummary = (() => {
    switch (integration.auth_mode) {
      case "bearer":
        return "Bearer token header"
      case "basic":
        return "HTTP basic auth"
      case "api_key":
        return `API key header: ${integration.auth_header || "X-API-Key"}`
      default:
        return "No authentication"
    }
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
            <p className="text-xs text-slate-400">
              {integration.connection_url}
            </p>
          </div>
          <Badge
            variant={integration.status === "active" ? "default" : "secondary"}
            className={cn(
              integration.status === "active"
                ? "bg-emerald-500/20 text-emerald-200"
                : "bg-slate-800 text-slate-300"
            )}
          >
            {integration.status === "active" ? "Active" : "Disabled"}
          </Badge>
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

        <div className="space-y-1 text-xs text-slate-300">
          <p className="font-semibold text-slate-200">Authentication</p>
          <p className="text-slate-400">{authSummary}</p>
        </div>

        {Object.keys(headers).length > 0 && (
          <div className="space-y-2 text-xs text-slate-300">
            <p className="font-semibold text-slate-200">Custom headers</p>
            <div className="space-y-1">
              {Object.entries(headers).map(([key, value]) => (
                <div key={key} className="flex items-center gap-3 break-all font-mono text-[11px]">
                  <span className="rounded bg-slate-900 px-2 py-0.5 text-slate-200">
                    {key}
                  </span>
                  <span className="text-slate-400">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between text-xs text-slate-400">
        <a
          href={integration.connection_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-slate-300 hover:text-white"
        >
          Visit site <ExternalLink className="size-3" />
        </a>
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
