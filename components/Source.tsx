/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import React, { useEffect, useMemo, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Sparkles, Package, X } from "lucide-react"

import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Textarea } from "./ui/textarea"
import { Select, SelectContent, SelectItem } from "./ui/select"

// utility helpers
function classNames(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ")
}
const formatUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

// types
export type Service = {
  id: string
  title: string
  price: number
  durationMins?: number
  thumbnail?: string
  status: "draft" | "published"
  channels?: string[]
  updatedAt: string
}
export type Product = {
  id: string
  title: string
  price: number
  inventory?: number
  thumbnail?: string
  status: "draft" | "published"
  channels?: string[]
  updatedAt: string
}

export interface SourceProps {
  services?: Service[]
  products?: Product[]
  onCreateService?(draft: Service): void
  onCreateProduct?(draft: Product): void
  onUpdateService?(id: string, patch: Partial<Service>): void
  onUpdateProduct?(id: string, patch: Partial<Product>): void
  onDeleteService?(id: string): void
  onDeleteProduct?(id: string): void
}

const integrationDirectory = [
  { id: "shopify", name: "Shopify", accent: "from-emerald-400/30 to-emerald-500/30", icon: "🛍️" },
  { id: "wix", name: "Wix", accent: "from-blue-400/30 to-sky-500/30", icon: "🧩" },
  { id: "custom", name: "Custom Site", accent: "from-fuchsia-400/30 to-purple-500/30", icon: "🛠️" },
  { id: "depop", name: "Depop", accent: "from-orange-400/30 to-red-500/30", icon: "🧢" },
  { id: "facebook", name: "Facebook Marketplace", accent: "from-blue-500/30 to-indigo-500/30", icon: "📦" },
  { id: "ebay", name: "eBay", accent: "from-yellow-400/30 to-blue-500/30", icon: "🎯" },
  { id: "offerup", name: "OfferUp", accent: "from-emerald-400/30 to-teal-500/30", icon: "🚚" },
  { id: "vinted", name: "Vinted", accent: "from-cyan-400/30 to-emerald-400/30", icon: "🧥" },
]

const channelLookup = Object.fromEntries(
  integrationDirectory.map((integration) => [integration.id, integration])
)

export default function Source({
  services: servicesProp,
  products: productsProp,
  onCreateService,
  onCreateProduct,
  onUpdateService,
  onUpdateProduct,
  onDeleteService,
  onDeleteProduct,
}: SourceProps) {
  const [services, setServices] = useState<Service[]>(servicesProp ?? [])
  const [products, setProducts] = useState<Product[]>(productsProp ?? [])

  const [activeTab, setActiveTab] = useState<"services" | "products">("services")
  const [subTab, setSubTab] = useState<"draft" | "published">("draft")
  const [rawSearch, setRawSearch] = useState("")
  const [search, setSearch] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setSearch(rawSearch.toLowerCase()), 200)
    return () => clearTimeout(t)
  }, [rawSearch])

  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600)
    return () => clearTimeout(t)
  }, [])

  // drawer state
  const [drawer, setDrawer] = useState<{
    type: "service" | "product"
    open: boolean
    draft: any | null
  }>({ type: "service", open: false, draft: null })
  const [preview, setPreview] = useState<{ type: "service" | "product"; item: any } | null>(null)
  const [confirm, setConfirm] = useState<{ type: "service" | "product"; id: string } | null>(null)

  const searchParams = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    const create = searchParams.get("create")
    if (create === "service" || create === "product") {
      setDrawer({ type: create, open: true, draft: null })
      setActiveTab(create === "service" ? "services" : "products")
      router.replace("/source")
    }
  }, [searchParams, router])

  const currentList = activeTab === "services" ? services : products
  const setCurrentList = activeTab === "services" ? setServices : setProducts

  const filtered = currentList.filter(
    (i) => i.status === subTab && i.title.toLowerCase().includes(search)
  )

  // handlers
  function handleSave(item: any) {
    item.type = drawer.type;
    item.updatedAt = new Date().toISOString()
    if (drawer.draft?.id) {
      // edit
      setCurrentList((prev: any[]) =>
        prev.map((p) => (p.id === item.id ? item : p))
      )
      if (item.type === "service" && onUpdateService)
        onUpdateService(item.id, item)
      if (item.type === "product" && onUpdateProduct)
        onUpdateProduct(item.id, item)
    } else {
      // new
      item.id = Math.random().toString(36).slice(2)
      setCurrentList((prev: any[]) => [...prev, item])
      if (item.type === "service" && onCreateService) onCreateService(item)
      if (item.type === "product" && onCreateProduct) onCreateProduct(item)
    }
    setDrawer({ ...drawer, open: false, draft: null })
  }

  function handleDelete() {
    if (!confirm) return
    const { type, id } = confirm
    if (type === "service") {
      setServices((prev) => prev.filter((s) => s.id !== id))
      onDeleteService?.(id)
    } else {
      setProducts((prev) => prev.filter((p) => p.id !== id))
      onDeleteProduct?.(id)
    }
    setConfirm(null)
  }

  function duplicate(item: any) {
    const copy = { ...item, id: Math.random().toString(36).slice(2), title: item.title + " Copy", updatedAt: new Date().toISOString() }
    if (activeTab === "services") setServices((p) => [...p, copy])
    else setProducts((p) => [...p, copy])
  }

  return (
    <div
      className="min-h-screen bg-[#111315] text-[#E6E6E6]"
      style={{ fontFamily: "ui-sans-serif, system-ui" }}
    >
      <HeaderBar
        onNewService={() => {
          setDrawer({ type: "service", open: true, draft: null })
          setActiveTab("services")
        }}
        onNewProduct={() => {
          setDrawer({ type: "product", open: true, draft: null })
          setActiveTab("products")
        }}
      />
      <div className="border-b border-[#2F343A] flex">
        <TabButton active={activeTab === "services"} onClick={() => setActiveTab("services")}>Services</TabButton>
        <TabButton active={activeTab === "products"} onClick={() => setActiveTab("products")}>Products</TabButton>
      </div>

      <div className="p-4 space-y-4">
        <IntegrationBanner />
        <IntegrationsOverview />
        <InsightsRow />
        <div className="flex items-center gap-2">
          <SubTab active={subTab === "draft"} onClick={() => setSubTab("draft")}>Drafts</SubTab>
          <SubTab active={subTab === "published"} onClick={() => setSubTab("published")}>Published</SubTab>
          <SearchBox value={rawSearch} onChange={setRawSearch} />
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            onCreate={() =>
              setDrawer({
                type: activeTab === "services" ? "service" : "product",
                open: true,
                draft: null,
              })
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filtered.map((item) => (
              <CatalogCard
                key={item.id}
                item={item}
                type={activeTab === "services" ? "service" : "product"}
                onEdit={(it) =>
                  setDrawer({ type: activeTab === "services" ? "service" : "product", open: true, draft: it })
                }
                onDuplicate={duplicate}
                onToggleStatus={(it) => {
                  const upd = { ...it, status: it.status === "draft" ? "published" : "draft" }
                  setCurrentList((prev: any[]) => prev.map((p) => (p.id === upd.id ? upd : p)))
                }}
                onDelete={(it) => setConfirm({ type: activeTab === "services" ? "service" : "product", id: it.id })}
                onPreview={(it) => setPreview({ type: activeTab === "services" ? "service" : "product", item: it })}
              />
            ))}
          </div>
        )}
      </div>

      {drawer.open && (
        <Drawer
          type={drawer.type}
          draft={drawer.draft}
          onClose={() => setDrawer({ ...drawer, open: false, draft: null })}
          onSave={handleSave}
          onPreview={(it) => setPreview({ type: drawer.type, item: it })}
        />
      )}
      {preview && (
        <PreviewSheet
          type={preview.type}
          item={preview.item}
          onClose={() => setPreview(null)}
          onEdit={() => {
            setDrawer({ type: preview.type, open: true, draft: preview.item })
            setPreview(null)
          }}
        />
      )}
      {confirm && (
        <ConfirmDelete
          onCancel={() => setConfirm(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

// ----- sub components -----
function HeaderBar({
  onNewService,
  onNewProduct,
}: {
  onNewService: () => void
  onNewProduct: () => void
}) {
  return (
    <header className="p-4 border-b border-[#2F343A]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Source integrations</h1>
            <Badge className="bg-[#1C1F22] text-[11px] font-medium uppercase tracking-[0.25em] text-[#E8C268]">
              Paid feature
            </Badge>
          </div>
          <p className="text-sm text-[#A6A6A6] mt-1 max-w-2xl">
            Plug Source into Shopify, Wix, or any custom storefront and blast new listings
            to every connected marketplace in a single publish flow.
          </p>
        </div>
        <button
          type="button"
          className="mt-2 inline-flex items-center justify-center rounded-md border border-[#2F343A] px-3 py-1.5 text-xs uppercase tracking-[0.3em] text-[#A6A6A6] hover:border-[#9966CC] hover:text-white sm:mt-0"
        >
          Manage connections
        </button>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onNewService}
          className="px-3 py-2 bg-[#9966CC] text-white rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#9966CC]"
        >
          New Service
        </button>
        <button
          onClick={onNewProduct}
          className="px-3 py-2 bg-[#9966CC] text-white rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#9966CC]"
        >
          New Product
        </button>
      </div>
    </header>
  )
}

function TabButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active?: boolean
  onClick(): void
}) {
  return (
    <button
      onClick={onClick}
      className={classNames(
        "flex-1 py-2 text-sm border-b-2",
        active ? "border-[#9966CC]" : "border-transparent text-[#A6A6A6]"
      )}
    >
      {children}
    </button>
  )
}

function SubTab({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active?: boolean
  onClick(): void
}) {
  return (
    <button
      onClick={onClick}
      className={classNames(
        "px-3 py-1 rounded-md text-sm",
        active
          ? "bg-[#22262A] text-[#E6E6E6]"
          : "text-[#A6A6A6]"
      )}
    >
      {children}
    </button>
  )
}

function SearchBox({
  value,
  onChange,
}: {
  value: string
  onChange(v: string): void
}) {
  return (
    <input
      aria-label="Search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search"
      className="ml-auto px-3 py-1.5 rounded-md bg-[#1C1F22] text-sm border border-[#2F343A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9966CC]"
    />
  )
}

function StatusPill({ status }: { status: "draft" | "published" }) {
  return (
    <span
      className={classNames(
        "px-2 py-0.5 text-xs rounded-full",
        status === "published"
          ? "bg-[#6DD3A8]/20 text-[#6DD3A8]"
          : "bg-[#E8C268]/20 text-[#E8C268]"
      )}
    >
      {status === "published" ? "Published" : "Draft"}
    </span>
  )
}

function CatalogCard({
  item,
  type,
  onEdit,
  onDuplicate,
  onToggleStatus,
  onDelete,
  onPreview,
}: {
  item: any
  type: "service" | "product"
  onEdit(it: any): void
  onDuplicate(it: any): void
  onToggleStatus(it: any): void
  onDelete(it: any): void
  onPreview(it: any): void
}) {
  const [menu, setMenu] = useState(false)
  return (
    <div
      className="relative bg-[#1C1F22] border border-[#2F343A] rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-[#9966CC] transition-transform hover:scale-[1.02]"
    >
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt=""
          className="w-full h-32 object-cover"
        />
      ) : (
        <div className="h-32 bg-[#22262A] flex items-center justify-center text-[#7C838A] text-sm">
          No Image
        </div>
      )}
      <div className="p-2 text-sm space-y-1">
        <div className="flex justify-between items-start">
          <h3 className="font-medium leading-tight">{item.title}</h3>
          <StatusPill status={item.status} />
        </div>
        <div className="flex justify-between text-[#A6A6A6] text-xs">
          <span>{formatUSD(item.price)}</span>
          {type === "service" && item.durationMins && (
            <span>{item.durationMins}m</span>
          )}
          {type === "product" && item.inventory !== undefined && (
            <span>{item.inventory} in stock</span>
          )}
        </div>
        <div className="flex justify-between items-center mt-1">
          <button
            className="text-[#9966CC] text-xs"
            onClick={() => onPreview(item)}
          >
            Preview
          </button>
          <div className="relative">
            <button
              aria-label="More"
              onClick={() => setMenu((m) => !m)}
              className="px-2"
            >
              ⋯
            </button>
            {menu && (
              <div className="absolute right-0 mt-1 w-36 bg-[#22262A] border border-[#2F343A] rounded-md z-20 text-xs">
                <button
                  className="block w-full text-left px-3 py-2 hover:bg-[#1C1F22]"
                  onClick={() => {
                    setMenu(false)
                    onEdit(item)
                  }}
                >
                  Edit
                </button>
                <button
                  className="block w-full text-left px-3 py-2 hover:bg-[#1C1F22]"
                  onClick={() => {
                    setMenu(false)
                    onDuplicate(item)
                  }}
                >
                  Duplicate
                </button>
                <button
                  className="block w-full text-left px-3 py-2 hover:bg-[#1C1F22]"
                  onClick={() => {
                    setMenu(false)
                    onToggleStatus(item)
                  }}
                >
                  {item.status === "draft" ? "Publish" : "Move to Draft"}
                </button>
                <button
                  className="block w-full text-left px-3 py-2 hover:bg-[#1C1F22] text-[#E8C268]"
                  onClick={() => {
                    setMenu(false)
                    onDelete(item)
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
        {item.channels?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.channels.slice(0, 3).map((channelId: string) => (
              <ChannelBadge key={channelId} channelId={channelId} />
            ))}
            {item.channels.length > 3 && (
              <span className="text-[10px] text-[#7C838A]">
                +{item.channels.length - 3} more
              </span>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-[#7C838A]">Not connected to any channels yet</p>
        )}
        <div className="text-[10px] text-[#7C838A]">
          Last updated {timeAgo(item.updatedAt)}
        </div>
      </div>
    </div>
  )
}

function Drawer({
  type,
  draft,
  onClose,
  onSave,
  onPreview,
}: {
  type: "service" | "product"
  draft: any | null
  onClose(): void
  onSave(it: any): void
  onPreview(it: any): void
}) {
  const baseItem = useMemo(
    () => ({
      type,
      title: "",
      description: "",
      price: 0,
      status: "draft",
      channels: [] as string[],
    }),
    [type]
  )

  const [item, setItem] = useState<any>(draft ? { ...baseItem, ...draft } : baseItem)

  useEffect(() => {
    setItem(draft ? { ...baseItem, ...draft } : baseItem)
  }, [draft, baseItem])

  function update(field: string, value: any) {
    setItem((prev: any) => ({ ...prev, [field]: value }))
  }

  function toggleChannel(channelId: string) {
    setItem((prev: any) => {
      const current = new Set(prev.channels ?? [])
      if (current.has(channelId)) {
        current.delete(channelId)
      } else {
        current.add(channelId)
      }
      return { ...prev, channels: Array.from(current) }
    })
  }

  const meta =
    type === "service"
      ? {
          eyebrow: "Source",
          badge: "Service",
          title: draft ? "Update your service" : "Create a new service",
          description: "Craft a bookable experience that syndicates to every storefront you run.",
          highlight: "Services publish to Source and auto-post to your connected channels.",
          accent: "from-[#5E3EFF]/70 via-[#9966FF]/55 to-[#1A86FF]/60",
          icon: Sparkles,
        }
      : {
          eyebrow: "Source",
          badge: "Product",
          title: draft ? "Update your product" : "Create a new product",
          description: "Package what you sell and share it to every marketplace at once.",
          highlight: "Products go live in Source and broadcast to every integration you enable.",
          accent: "from-[#27D7A1]/70 via-[#3EC7FF]/55 to-[#1D7BFF]/60",
          icon: Package,
        }

  const Icon = meta.icon

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-4 py-6 backdrop-blur-sm sm:py-10"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div className="flex min-h-full items-start justify-center sm:items-center" onClick={(event) => event.stopPropagation()}>
        <div className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0B1016]/95 shadow-[0_45px_90px_-40px_rgba(15,23,42,0.8)] max-h-[calc(100dvh-2rem)] sm:max-h-[85vh]">
          <div className="relative flex-none overflow-hidden">
            <div
              className={classNames(
                "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90",
                meta.accent
              )}
            />
            <div className="relative flex flex-col gap-2.5 px-4 pb-3 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pb-4 sm:pt-3.5">
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-white shadow-inner">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge
                        variant="outline"
                        className="border-white/20 bg-white/10 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-200"
                      >
                        {meta.eyebrow}
                      </Badge>
                      <Badge className="bg-white/15 text-[11px] font-semibold text-white">
                        {meta.badge}
                      </Badge>
                    </div>
                    <h2 className="text-lg font-semibold leading-snug text-white sm:text-xl">
                      {meta.title}
                    </h2>
                    <p className="text-[11px] text-zinc-200 sm:text-sm">{meta.description}</p>
                  </div>
                </div>
              </div>
              <Button
                type="button"
                onClick={onClose}
                variant="ghost"
                className="self-start rounded-full bg-white/10 p-1.5 text-zinc-100 hover:bg-white/20"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="border-t border-white/10 px-4 py-1.5 text-[11px] text-zinc-300 sm:px-6 sm:py-2">
              {meta.highlight}
            </div>
          </div>

          <form
            className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 pb-6 pt-6 sm:px-8 sm:pb-8"
            onSubmit={(e) => {
              e.preventDefault()
              const nextItem = {
                ...item,
                price: item.price === "" || item.price === undefined ? 0 : item.price,
                durationMins:
                  item.durationMins === "" || item.durationMins === undefined
                    ? undefined
                    : Number(item.durationMins),
                inventory:
                  item.inventory === "" || item.inventory === undefined
                    ? undefined
                    : Number(item.inventory),
              }
              onSave(nextItem)
            }}
          >
            <FormSection
              title="Show the vibe"
              description="Give people a quick sense of what they'll get when they choose this offering."
            >
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-6 text-center text-sm text-zinc-300">
                <p className="text-sm font-medium text-white">Cover image</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Drop a file here or browse to upload a promo image.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 rounded-xl border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-white/20"
                >
                  Upload
                </Button>
              </div>
            </FormSection>

            <FormSection
              title="Overview"
              description={
                type === "service"
                  ? "Describe the experience in your words so clients know exactly what to expect."
                  : "Explain what supporters get the moment they check out."
              }
            >
              <div className="space-y-2">
                <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Title
                </Label>
                <Input
                  value={item.title}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder={
                    type === "service" ? "Name your service" : "Name your product"
                  }
                  className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Description
                </Label>
                <Textarea
                  value={item.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder={
                    type === "service"
                      ? "What’s the flow, outcome, or deliverable of this service?"
                      : "Tell supporters what’s included, specs, or delivery details."
                  }
                  className="min-h-[140px] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                />
              </div>
            </FormSection>

            <FormSection
              title="Pricing & logistics"
              description={
                type === "service"
                  ? "Set the price and time commitment so scheduling is effortless."
                  : "Track inventory and set pricing so supporters can check out smoothly."
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Price (USD)
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={item.price ?? ""}
                    onChange={(e) => {
                      const { value } = e.target
                      update("price", value === "" ? "" : parseFloat(value))
                    }}
                    min={0}
                    step="0.01"
                    className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                  />
                </div>
                {type === "service" ? (
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Duration (mins)
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={item.durationMins ?? ""}
                      onChange={(e) => {
                        const { value } = e.target
                        update("durationMins", value === "" ? "" : parseInt(value, 10))
                      }}
                      min={0}
                      className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                      Inventory
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={item.inventory ?? ""}
                      onChange={(e) => {
                        const { value } = e.target
                        update("inventory", value === "" ? "" : parseInt(value, 10))
                      }}
                      min={0}
                      className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                    />
                  </div>
                )}
              </div>
              {type === "product" && (
                <div className="space-y-2">
                  <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    SKU (optional)
                  </Label>
                  <Input
                    value={item.sku || ""}
                    onChange={(e) => update("sku", e.target.value)}
                    placeholder="Add a SKU so you can track this product later"
                    className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                  />
                </div>
              )}
            </FormSection>

            <FormSection
              title="Distribution"
              description="Choose the marketplaces and storefronts that should receive this listing when it goes live."
            >
              <p className="text-xs text-zinc-500">
                Integrations are part of the Source Pro add-on. We’ll sync pricing, availability, and imagery everywhere for you.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {integrationDirectory.map((integration) => {
                  const selected = (item.channels ?? []).includes(integration.id)
                  return (
                    <button
                      key={integration.id}
                      type="button"
                      onClick={() => toggleChannel(integration.id)}
                      className={classNames(
                        "flex items-center justify-between rounded-xl border px-3 py-3 text-left",
                        selected
                          ? "border-[#9966CC] bg-[#9966CC]/10 text-white"
                          : "border-white/10 bg-white/[0.03] text-zinc-200 hover:border-[#9966CC]/60"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{integration.icon}</span>
                        <span className="text-sm font-medium">{integration.name}</span>
                      </div>
                      <span className="text-[11px] uppercase tracking-[0.3em] text-[#7C838A]">
                        {selected ? "Added" : "Add"}
                      </span>
                    </button>
                  )
                })}
              </div>
            </FormSection>

            <FormSection
              title="Visibility"
              description="Choose whether to keep this hidden while you refine the details or ship it immediately."
            >
              <div className="space-y-3">
                <Label className="text-[13px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Status
                </Label>
                <Select value={item.status} onValueChange={(value) => update("status", value)}>
                  <SelectContent className="space-y-1 bg-[#0B1222]">
                    <SelectItem value="draft" label="Draft">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-white">Draft</p>
                        <p className="text-xs text-zinc-400">
                          Keep polishing without publishing to Source yet.
                        </p>
                      </div>
                    </SelectItem>
                    <SelectItem value="published" label="Published">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-white">Published</p>
                        <p className="text-xs text-zinc-400">
                          Make it live so members can discover and buy.
                        </p>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </FormSection>

            <div className="sticky bottom-0 -mx-5 flex flex-col gap-3 border-t border-white/5 bg-[#070B12]/80 px-5 py-4 backdrop-blur sm:-mx-8 sm:flex-row sm:items-center sm:justify-end sm:gap-2 sm:px-8">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="h-11 rounded-xl border border-white/10 bg-white/[0.02] px-5 text-sm font-medium text-zinc-200 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onPreview(item)}
                className="h-11 rounded-xl border border-white/10 bg-white/[0.04] px-5 text-sm font-medium text-zinc-100 hover:bg-white/15"
              >
                Preview
              </Button>
              <Button
                type="submit"
                className="h-11 rounded-xl bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 px-6 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_rgba(88,28,228,0.65)] transition hover:from-blue-400 hover:via-violet-400 hover:to-fuchsia-400"
              >
                {draft ? "Save changes" : type === "service" ? "Create service" : "Create product"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.75)] sm:p-5">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-400">
          {title}
        </p>
        {description ? (
          <p className="text-xs text-zinc-500 sm:text-sm">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  )
}

function PreviewSheet({
  type,
  item,
  onClose,
  onEdit,
}: {
  type: "service" | "product"
  item: any
  onClose(): void
  onEdit(): void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-end" role="dialog" aria-modal>
      <div className="w-full max-w-md bg-[#1C1F22] border-t border-[#2F343A] p-4 rounded-t-lg space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Preview</h2>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="space-y-2 text-sm">
          {item.thumbnail && (
            <img src={item.thumbnail} alt="" className="w-full h-40 object-cover rounded" />
          )}
          <h3 className="text-base font-medium">{item.title}</h3>
          <p className="text-[#A6A6A6]">{item.description}</p>
          <div>{formatUSD(item.price)}</div>
          {item.channels?.length ? (
            <div className="pt-2">
              <p className="text-[11px] uppercase tracking-[0.35em] text-[#7C838A]">
                Connected channels
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.channels.map((channelId: string) => (
                  <ChannelBadge key={channelId} channelId={channelId} />
                ))}
              </div>
            </div>
          ) : null}
          <button className="w-full mt-2 py-2 bg-[#9966CC] text-white rounded-md">
            {type === "service" ? "Book Now" : "Buy Now"}
          </button>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            onClick={onEdit}
            className="flex-1 px-3 py-2 bg-[#22262A] rounded-md"
          >
            Edit
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 bg-[#22262A] rounded-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDelete({
  onCancel,
  onConfirm,
}: {
  onCancel(): void
  onConfirm(): void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center" role="dialog" aria-modal>
      <div className="bg-[#1C1F22] border border-[#2F343A] rounded-md p-4 w-72 space-y-4 text-sm">
        <p>Delete this item? This action cannot be undone.</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-md bg-[#22262A]">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-md bg-[#E8C268] text-black"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate(): void }) {
  return (
    <div className="text-center py-20 text-sm text-[#A6A6A6]">
      <p>Your catalog is quiet. Connect a site and launch your first cross-platform drop.</p>
      <button
        onClick={onCreate}
        className="mt-4 px-3 py-2 bg-[#9966CC] text-white rounded-md"
      >
        Create your first listing
      </button>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="animate-pulse bg-[#1C1F22] border border-[#2F343A] rounded-md h-48" />
  )
}

function IntegrationBanner() {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-[#2F343A] bg-gradient-to-r from-[#141821] via-[#111315] to-[#0b1017] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.35em] text-[#7C838A]">
          Cross-platform publishing
        </p>
        <h2 className="text-lg font-semibold text-white">
          Launch once. Sell everywhere.
        </h2>
        <p className="text-sm text-[#A6A6A6]">
          Connect every storefront you own—from Shopify and Wix to personal sites—and
          automatically syndicate new drops to marketplaces like Depop, Vinted, Facebook
          Marketplace, eBay, OfferUp, and more the moment you hit publish.
        </p>
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-white/5 bg-white/[0.03] p-4 text-xs text-[#A6A6A6]">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7C838A]">
            Why upgrade
          </p>
          <ul className="space-y-1">
            <li className="flex items-center gap-2 text-sm text-white/90">
              <span>⚡</span>
              <span>Save hours with one-click multi-channel publishing</span>
            </li>
            <li className="flex items-center gap-2 text-sm text-white/90">
              <span>📦</span>
              <span>Keep inventory synced across every marketplace</span>
            </li>
            <li className="flex items-center gap-2 text-sm text-white/90">
              <span>📈</span>
              <span>Track performance from a single dashboard</span>
            </li>
          </ul>
        </div>
        <button
          type="button"
          className="rounded-md bg-[#9966CC] px-3 py-2 text-sm font-medium text-white shadow-[0_10px_25px_-12px_rgba(153,102,204,0.9)]"
        >
          Explore Source Pro plans
        </button>
      </div>
    </section>
  )
}

function IntegrationsOverview() {
  const integrations = [
    {
      id: "shopify",
      status: "Connected",
      meta: "Syncing 24 products nightly",
    },
    {
      id: "depop",
      status: "Connected",
      meta: "Listings mirrored instantly",
    },
    {
      id: "facebook",
      status: "Requires review",
      meta: "Reconnect to continue auto-posting",
    },
  ]

  return (
    <section className="grid gap-3 sm:grid-cols-3">
      {integrations.map((integration) => {
        const meta = channelLookup[integration.id]
        return (
          <div
            key={integration.id}
            className="rounded-xl border border-[#2F343A] bg-[#1C1F22] p-4 text-sm shadow-[0_12px_30px_-25px_rgba(15,23,42,0.8)]"
          >
            <div className="flex items-center gap-2">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r ${meta?.accent ?? "from-white/10 to-white/5"}`}
              >
                <span className="text-lg">{meta?.icon ?? "🌐"}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{meta?.name ?? integration.id}</p>
                <p className="text-xs text-[#A6A6A6]">{integration.meta}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.3em] text-[#7C838A]">
                {integration.status}
              </span>
              <button type="button" className="text-xs font-medium text-[#9966CC]">
                Manage
              </button>
            </div>
          </div>
        )
      })}
    </section>
  )
}

function InsightsRow() {
  return (
    <div className="flex gap-2 text-xs">
      <StatChip label="Listings live" value="32" />
      <StatChip label="Channels synced" value="6" />
      <StatChip label="Time saved" value="14h" />
    </div>
  )
}

function ChannelBadge({ channelId }: { channelId: string }) {
  const channel = channelLookup[channelId]
  if (!channel) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#22262A] px-2 py-1 text-[10px] text-[#A6A6A6]">
        <span>🌐</span>
        <span className="font-medium capitalize">{channelId}</span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#22262A] px-2 py-1 text-[10px] text-[#E6E6E6]">
      <span>{channel.icon}</span>
      <span className="font-medium">{channel.name}</span>
    </span>
  )
}

function StatChip({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-3 py-1 bg-[#1C1F22] border border-[#2F343A] rounded-md">
      <span className="text-[#A6A6A6] mr-1">{label}</span>
      <span>{value}</span>
    </div>
  )
}

