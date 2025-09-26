/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import React, { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"

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
  updatedAt: string
}
export type Product = {
  id: string
  title: string
  price: number
  inventory?: number
  thumbnail?: string
  status: "draft" | "published"
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
    item.type = drawer.type
    item.updatedAt = new Date().toISOString()
    if (drawer.draft?.id) {
      // edit
      setCurrentList((prev: any[]) => prev.map((p) => (p.id === item.id ? item : p)))
      if (item.type === "service" && onUpdateService) onUpdateService(item.id, item)
      if (item.type === "product" && onUpdateProduct) onUpdateProduct(item.id, item)
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
    const copy = {
      ...item,
      id: Math.random().toString(36).slice(2),
      title: item.title + " Copy",
      updatedAt: new Date().toISOString(),
    }
    if (activeTab === "services") setServices((p) => [...p, copy])
    else setProducts((p) => [...p, copy])
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-[#080C12] via-[#0E1118] to-[#1A1F27] text-[#F4F6FA]"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui" }}
    >
      <div className="mx-auto w-full max-w-6xl px-4 pb-16">
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
        <div className="mt-10 rounded-2xl border border-white/5 bg-white/5 p-1 backdrop-blur-xl">
          <div className="flex rounded-xl bg-black/30 p-1">
            <TabButton active={activeTab === "services"} onClick={() => setActiveTab("services")}>
              Services
            </TabButton>
            <TabButton active={activeTab === "products"} onClick={() => setActiveTab("products")}>
              Products
            </TabButton>
          </div>
        </div>

        <div className="mt-10 space-y-8">
          <InsightsRow />
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-4 backdrop-blur-lg">
            <div className="flex items-center gap-2 text-sm text-white/70">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#7C3AED] to-[#22D3EE] text-xs font-semibold uppercase tracking-wide text-white/80">
                {activeTab === "services" ? "Svc" : "Prd"}
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/40">Active View</p>
                <p className="text-sm font-medium text-white">
                  {activeTab === "services" ? "Service Catalog" : "Product Catalog"}
                </p>
              </div>
            </div>
            <div className="hidden h-8 w-px bg-white/10 md:block" aria-hidden />
            <div className="flex items-center gap-2 text-xs text-white/60">
              <QuickBadge label="Top Rated" />
              <QuickBadge label="Low Inventory" />
              <QuickBadge label="Recently Updated" />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <SubTab active={subTab === "draft"} onClick={() => setSubTab("draft")}>
                Drafts
              </SubTab>
              <SubTab active={subTab === "published"} onClick={() => setSubTab("published")}>
                Published
              </SubTab>
              <SearchBox value={rawSearch} onChange={setRawSearch} />
            </div>
          </div>

          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
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
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
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
    <header className="relative mt-12 overflow-hidden rounded-3xl border border-white/5 bg-white/5 px-8 py-10 shadow-[0_20px_60px_rgba(10,16,24,0.35)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-10 h-56 w-56 rounded-full bg-[#7C3AED]/30 blur-[90px]" />
        <div className="absolute -bottom-24 right-0 h-48 w-48 rounded-full bg-[#22D3EE]/30 blur-[90px]" />
      </div>
      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 py-1 text-xs uppercase tracking-[0.28em] text-white/60">
            <span className="h-2 w-2 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#22D3EE]" />
            Creator Source
          </div>
          <h1 className="mt-6 text-3xl font-semibold leading-tight text-white sm:text-4xl">
            Curate your premium services & product ecosystem
          </h1>
          <p className="mt-4 max-w-xl text-sm text-white/70">
            Offer concierge-level experiences, manage inventory in real time and publish beautifully branded offerings in minutes.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-white/60">
            <BadgePill label="Studio-Grade" />
            <BadgePill label="Smart Availability" />
            <BadgePill label="Integrated Checkout" />
          </div>
        </div>
        <div className="relative flex flex-col gap-3 rounded-2xl border border-white/5 bg-black/30 p-6 text-sm text-white/70">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Quick actions</p>
          <ActionButton icon="✨" label="New Luxury Service" onClick={onNewService} accent="from-[#7C3AED] to-[#22D3EE]" />
          <ActionButton icon="🛍️" label="Add Signature Product" onClick={onNewProduct} accent="from-[#F97316] to-[#F43F5E]" />
          <div className="rounded-xl border border-white/5 bg-black/30 px-4 py-3 text-xs leading-relaxed text-white/60">
            Tip: Leverage bundles to elevate perceived value and upsell premium experiences.
          </div>
        </div>
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
        "flex-1 rounded-xl px-6 py-3 text-sm font-medium transition-all duration-200",
        active
          ? "bg-gradient-to-br from-[#7C3AED] to-[#22D3EE] text-white shadow-[0_10px_30px_rgba(32,31,58,0.35)]"
          : "text-white/50 hover:text-white/80"
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
        "rounded-full px-4 py-1.5 text-sm transition-all",
        active
          ? "bg-white/15 text-white shadow-[0_8px_20px_rgba(18,22,29,0.45)]"
          : "border border-white/10 text-white/60 hover:text-white"
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
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/40">🔍</span>
      <input
        aria-label="Search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search collection"
        className="ml-auto w-48 rounded-full border border-white/10 bg-black/30 py-2 pl-9 pr-4 text-sm text-white/80 placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
      />
    </div>
  )
}

function StatusPill({ status }: { status: "draft" | "published" }) {
  return (
    <span
      className={classNames(
        "px-3 py-1 text-xs font-medium uppercase tracking-[0.25em] text-white/70",
        "rounded-full border border-white/10 bg-black/30"
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
    <div className="group relative">
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#7C3AED]/30 via-transparent to-[#22D3EE]/30 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/5 bg-black/40 text-sm shadow-[0_25px_50px_rgba(7,10,18,0.5)] backdrop-blur-xl transition-transform duration-300 group-hover:-translate-y-1">
        <div className="relative">
          {item.thumbnail ? (
            <img src={item.thumbnail} alt="" className="h-36 w-full object-cover" />
          ) : (
            <div className="flex h-36 items-center justify-center bg-gradient-to-br from-white/5 to-white/0 text-xs text-white/40">
              Upload a cover to elevate this card
            </div>
          )}
          <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-white/60">
            {type === "service" ? "Service" : "Product"}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-medium leading-tight text-white">{item.title}</h3>
              <p className="mt-1 text-xs text-white/60">
                {type === "service"
                  ? item.durationMins
                    ? `${item.durationMins} minute experience`
                    : "Tailor the perfect experience"
                  : item.inventory !== undefined
                  ? `${item.inventory} pieces available`
                  : "Curate your inventory"}
              </p>
            </div>
            <StatusPill status={item.status} />
          </div>
          <div className="flex items-center justify-between text-xs text-white/60">
            <span className="text-lg font-semibold text-white">{formatUSD(item.price)}</span>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-white/50">
                Luxury
              </span>
              <span className="text-[10px] text-white/40">Updated {timeAgo(item.updatedAt)}</span>
            </div>
          </div>
          <div className="mt-auto flex items-center justify-between">
            <button
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#22D3EE] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
              onClick={() => onPreview(item)}
            >
              Preview
            </button>
            <div className="relative">
              <button
                aria-label="More"
                onClick={() => setMenu((m) => !m)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/30 text-lg"
              >
                ⋯
              </button>
              {menu && (
                <div className="absolute right-0 top-10 w-44 overflow-hidden rounded-xl border border-white/10 bg-black/90 text-xs shadow-[0_20px_45px_rgba(7,10,18,0.55)]">
                  <div className="bg-white/5 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white/30">Manage</div>
                  <button
                    className="block w-full text-left px-4 py-2 hover:bg-white/5"
                    onClick={() => {
                      setMenu(false)
                      onEdit(item)
                    }}
                  >
                    Edit details
                  </button>
                  <button
                    className="block w-full text-left px-4 py-2 hover:bg-white/5"
                    onClick={() => {
                      setMenu(false)
                      onDuplicate(item)
                    }}
                  >
                    Duplicate card
                  </button>
                  <button
                    className="block w-full text-left px-4 py-2 hover:bg-white/5"
                    onClick={() => {
                      setMenu(false)
                      onToggleStatus(item)
                    }}
                  >
                    {item.status === "draft" ? "Publish now" : "Return to draft"}
                  </button>
                  <button
                    className="block w-full text-left px-4 py-2 text-[#FACC15] hover:bg-white/5"
                    onClick={() => {
                      setMenu(false)
                      onDelete(item)
                    }}
                  >
                    Delete showcase
                  </button>
                </div>
              )}
            </div>
          </div>
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
  const [item, setItem] = useState<any>(
    draft ?? {
      type,
      title: "",
      description: "",
      price: 0,
      status: "draft",
    }
  )

  useEffect(() => {
    setItem(draft ?? { type, title: "", description: "", price: 0, status: "draft" })
  }, [draft, type])

  function update(field: string, value: any) {
    setItem((prev: any) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/60 backdrop-blur-md" role="dialog" aria-modal>
      <div className="relative flex h-full w-full max-w-md flex-col gap-6 overflow-y-auto border-l border-white/10 bg-[#0F141D]/95 p-6 text-sm text-white/70 shadow-[0_-20px_50px_rgba(6,10,18,0.45)]">
        <div className="sticky top-0 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">{draft ? "Edit" : "Create"}</p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              {type === "service" ? "Signature Service" : "Limited Product"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/30 text-lg text-white/60 transition hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <FieldRow label="Cover Image">
            <div className="flex h-36 items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5 text-xs text-white/50">
              Upload or drop a captivating visual
            </div>
          </FieldRow>
          <FieldRow label="Title">
            <input
              value={item.title}
              onChange={(e) => update("title", e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
            />
          </FieldRow>
          <FieldRow label="Description">
            <textarea
              value={item.description}
              onChange={(e) => update("description", e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
              rows={4}
            />
          </FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Price">
              <input
                type="number"
                value={item.price}
                onChange={(e) => update("price", Number(e.target.value))}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
              />
            </FieldRow>
            <FieldRow label={type === "service" ? "Duration (mins)" : "Inventory"}>
              <input
                type="number"
                value={type === "service" ? item.durationMins ?? "" : item.inventory ?? ""}
                onChange={(e) =>
                  update(
                    type === "service" ? "durationMins" : "inventory",
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
              />
            </FieldRow>
          </div>
          <FieldRow label="Status">
            <select
              value={item.status}
              onChange={(e) => update("status", e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </FieldRow>
          <div className="flex gap-2">
            <button
              onClick={() => onPreview(item)}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white hover:border-white/20"
            >
              Preview
            </button>
            <button
              onClick={() => onSave(item)}
              className="flex-1 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#22D3EE] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(43,30,78,0.55)] hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-2 block text-xs uppercase tracking-[0.3em] text-white/40">{label}</span>
      {children}
    </label>
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
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 backdrop-blur" role="dialog" aria-modal>
      <div className="w-full max-w-lg overflow-hidden rounded-t-3xl border border-white/10 bg-[#0F141D]/95 p-6 text-sm text-white/70 shadow-[0_-20px_60px_rgba(8,12,19,0.65)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Premium preview</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/30"
          >
            ✕
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {item.thumbnail && <img src={item.thumbnail} alt="" className="h-48 w-full rounded-2xl object-cover" />}
          <div className="flex flex-col gap-2">
            <span className="inline-flex w-max items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-white/50">
              {type === "service" ? "Service" : "Product"}
            </span>
            <h3 className="text-2xl font-semibold text-white">{item.title}</h3>
            <p className="text-sm leading-relaxed text-white/60">{item.description || "Craft a story-driven description to captivate your clients."}</p>
            <div className="text-2xl font-semibold text-white">{formatUSD(item.price)}</div>
          </div>
          <button className="w-full rounded-full bg-gradient-to-r from-[#7C3AED] via-[#6366F1] to-[#22D3EE] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(45,35,100,0.55)]">
            {type === "service" ? "Book this experience" : "Add to curated cart"}
          </button>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onEdit}
            className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white hover:border-white/20"
          >
            Refine details
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70 hover:text-white"
          >
            Close preview
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur" role="dialog" aria-modal>
      <div className="w-full max-w-sm space-y-6 rounded-3xl border border-white/10 bg-[#0F141D]/95 p-8 text-sm text-white/70 shadow-[0_30px_80px_rgba(8,12,19,0.6)]">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#F97316]/30 to-[#F43F5E]/40 text-2xl">
            ⚠️
          </div>
          <h3 className="text-lg font-semibold text-white">Confirm removal</h3>
          <p className="text-xs leading-relaxed text-white/60">
            Delete this item? This action cannot be undone and removes it from your premium catalog.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-full border border-white/10 bg-black/40 px-5 py-2 text-sm text-white/70 hover:text-white"
          >
            Keep item
          </button>
          <button
            onClick={onConfirm}
            className="rounded-full bg-gradient-to-br from-[#F97316] to-[#F43F5E] px-5 py-2 text-sm font-semibold text-white shadow-[0_14px_35px_rgba(94,32,55,0.45)] hover:opacity-95"
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
    <div className="rounded-3xl border border-dashed border-white/20 bg-white/5 py-24 text-center text-sm text-white/60">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#7C3AED]/20 to-[#22D3EE]/30 text-2xl">
        ✨
      </div>
      <p className="mt-6 text-base font-medium text-white">No items found</p>
      <p className="mt-2 mx-auto max-w-sm text-xs text-white/50">
        Curate your first premium offer to unlock analytics, conversion flows and bespoke checkout experiences.
      </p>
      <button
        onClick={onCreate}
        className="mt-6 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#22D3EE] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(45,35,100,0.45)] hover:opacity-90"
      >
        Create your first showcase
      </button>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="h-52 animate-pulse rounded-2xl border border-white/5 bg-gradient-to-br from-white/10 via-white/5 to-transparent" />
  )
}

function InsightsRow() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard
        label="Views"
        value="12.4k"
        trend="↑ 18%"
        accent="from-[#7C3AED] to-[#6366F1]"
        description="Audience touchpoints in the last 7 days"
      />
      <StatCard
        label="Clicks"
        value="3.1k"
        trend="↑ 9%"
        accent="from-[#22D3EE] to-[#0EA5E9]"
        description="High-intent visitors exploring your offers"
      />
      <StatCard
        label="Sales"
        value="286"
        trend="↑ 24%"
        accent="from-[#F97316] to-[#F43F5E]"
        description="Completed checkouts across all listings"
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  trend,
  description,
  accent,
}: {
  label: string
  value: string
  trend: string
  description: string
  accent: string
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/5 p-6 text-sm text-white/60 shadow-[0_18px_50px_rgba(8,12,19,0.35)] backdrop-blur">
      <div className={`absolute -top-20 right-0 h-40 w-40 rounded-full bg-gradient-to-br ${accent} opacity-40 blur-[110px]`} aria-hidden />
      <div className="relative space-y-3">
        <p className="text-xs uppercase tracking-[0.3em] text-white/40">{label}</p>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold text-white">{value}</span>
          <span className="rounded-full bg-black/30 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.3em] text-white/60">
            {trend}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-white/50">{description}</p>
      </div>
    </div>
  )
}

function BadgePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 py-1 text-[11px] font-medium text-white/70">
      <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#22D3EE]" />
      {label}
    </span>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
  accent,
}: {
  icon: string
  label: string
  onClick(): void
  accent: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl bg-gradient-to-br ${accent} px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_45px_rgba(30,28,68,0.45)] transition hover:scale-[1.01] hover:shadow-[0_20px_60px_rgba(30,28,68,0.55)]`}
    >
      <span className="text-lg">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function QuickBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-white/60">
      <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
      {label}
    </span>
  )
}

