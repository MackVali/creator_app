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
      className="min-h-screen bg-[#05070B] text-gray-200"
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
        <div className="mt-10 rounded-2xl border border-white/5 bg-[#0C1119] p-1">
          <div className="flex rounded-xl bg-black/50 p-1">
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
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-[#0C1119] p-4">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10 text-xs font-semibold uppercase tracking-wide text-gray-100">
                {activeTab === "services" ? "Svc" : "Prd"}
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Active View</p>
                <p className="text-sm font-medium text-gray-100">
                  {activeTab === "services" ? "Service Catalog" : "Product Catalog"}
                </p>
              </div>
            </div>
            <div className="hidden h-8 w-px bg-white/10 md:block" aria-hidden />
            <div className="flex items-center gap-2 text-xs text-gray-400">
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
    <header className="relative mt-12 overflow-hidden rounded-3xl border border-white/5 bg-[#0C1018] px-8 py-10 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
      <div className="absolute inset-x-0 top-0 h-px bg-white/5" aria-hidden />
      <div className="relative flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-[11px] uppercase tracking-[0.28em] text-gray-400">
            <span className="h-2 w-2 rounded-full bg-gray-300" />
            Creator Source
          </div>
          <h1 className="mt-6 text-3xl font-semibold leading-tight text-gray-100 sm:text-4xl">
            Curate your catalog with a composed, dark workspace
          </h1>
          <p className="mt-4 max-w-xl text-sm text-gray-400">
            Build consistent listings, keep inventory aligned, and publish with confidence in a calm interface tuned for focus.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <BadgePill label="Studio-Grade" />
            <BadgePill label="Smart Availability" />
            <BadgePill label="Integrated Checkout" />
          </div>
        </div>
        <div className="relative flex flex-col gap-4 rounded-2xl border border-white/5 bg-[#111620] p-6 text-sm text-gray-400">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Quick actions</p>
          <ActionButton icon="✨" label="New service" onClick={onNewService} />
          <ActionButton icon="🛒" label="Add product" onClick={onNewProduct} />
          <div className="rounded-xl border border-white/5 bg-black/30 px-4 py-3 text-xs leading-relaxed text-gray-400">
            Tip: Build a consistent naming system to help clients compare offerings at a glance.
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
          ? "bg-white/10 text-gray-100 shadow-[0_14px_30px_rgba(0,0,0,0.35)]"
          : "text-gray-500 hover:text-gray-200"
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
          ? "bg-white/15 text-gray-100 shadow-[0_10px_24px_rgba(0,0,0,0.4)]"
          : "border border-white/10 text-gray-400 hover:text-gray-200"
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
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">🔍</span>
      <input
        aria-label="Search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search collection"
        className="ml-auto w-48 rounded-full border border-white/10 bg-[#0C1118] py-2 pl-9 pr-4 text-sm text-gray-200 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
      />
    </div>
  )
}

function StatusPill({ status }: { status: "draft" | "published" }) {
  return (
    <span
      className={classNames(
        "px-3 py-1 text-xs font-medium uppercase tracking-[0.25em]",
        "rounded-full",
        status === "published"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          : "border-white/10 bg-white/5 text-gray-300"
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
      <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/5 bg-[#0F1420] text-sm shadow-[0_20px_50px_rgba(0,0,0,0.55)] transition-transform duration-300 group-hover:-translate-y-1">
        <div className="relative">
          {item.thumbnail ? (
            <img src={item.thumbnail} alt="" className="h-36 w-full object-cover" />
          ) : (
            <div className="flex h-36 items-center justify-center bg-[#151B27] text-xs text-gray-500">
              Add a cover image to personalise this card
            </div>
          )}
          <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-gray-300">
            {type === "service" ? "Service" : "Product"}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-medium leading-tight text-gray-100">{item.title}</h3>
              <p className="mt-1 text-xs text-gray-400">
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
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span className="text-lg font-semibold text-gray-100">{formatUSD(item.price)}</span>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-gray-400">
                Catalog
              </span>
              <span className="text-[10px] text-gray-500">Updated {timeAgo(item.updatedAt)}</span>
            </div>
          </div>
          <div className="mt-auto flex items-center justify-between">
            <button
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-gray-100 transition-colors hover:bg-white/15"
              onClick={() => onPreview(item)}
            >
              Preview
            </button>
            <div className="relative">
              <button
                aria-label="More"
                onClick={() => setMenu((m) => !m)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-lg text-gray-300 hover:text-gray-100"
              >
                ⋯
              </button>
              {menu && (
                <div className="absolute right-0 top-10 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#0A0E15] text-xs shadow-[0_22px_45px_rgba(0,0,0,0.55)]">
                  <div className="bg-white/5 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-gray-500">Manage</div>
                  <button
                    className="block w-full px-4 py-2 text-left text-gray-300 hover:bg-white/5"
                    onClick={() => {
                      setMenu(false)
                      onEdit(item)
                    }}
                  >
                    Edit details
                  </button>
                  <button
                    className="block w-full px-4 py-2 text-left text-gray-300 hover:bg-white/5"
                    onClick={() => {
                      setMenu(false)
                      onDuplicate(item)
                    }}
                  >
                    Duplicate card
                  </button>
                  <button
                    className="block w-full px-4 py-2 text-left text-gray-300 hover:bg-white/5"
                    onClick={() => {
                      setMenu(false)
                      onToggleStatus(item)
                    }}
                  >
                    {item.status === "draft" ? "Publish now" : "Return to draft"}
                  </button>
                  <button
                    className="block w-full px-4 py-2 text-left text-red-400 hover:bg-white/5"
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
    <div className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/70 backdrop-blur-md" role="dialog" aria-modal>
      <div className="relative flex h-full w-full max-w-md flex-col gap-6 overflow-y-auto border-l border-white/10 bg-[#0B1019] p-6 text-sm text-gray-400 shadow-[0_-20px_50px_rgba(0,0,0,0.45)]">
        <div className="sticky top-0 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500">{draft ? "Edit" : "Create"}</p>
            <h2 className="mt-2 text-xl font-semibold text-gray-100">
              {type === "service" ? "Service details" : "Product details"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-lg text-gray-400 transition hover:text-gray-200"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <FieldRow label="Cover Image">
            <div className="flex h-36 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#111722] text-xs text-gray-500">
              Upload or drop an image preview
            </div>
          </FieldRow>
          <FieldRow label="Title">
            <input
              value={item.title}
              onChange={(e) => update("title", e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#0F1420] px-3 py-2 text-gray-100 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
            />
          </FieldRow>
          <FieldRow label="Description">
            <textarea
              value={item.description}
              onChange={(e) => update("description", e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#0F1420] px-3 py-2 text-gray-100 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
              rows={4}
            />
          </FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Price">
              <input
                type="number"
                value={item.price}
                onChange={(e) => update("price", Number(e.target.value))}
                className="w-full rounded-xl border border-white/10 bg-[#0F1420] px-3 py-2 text-gray-100 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
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
                className="w-full rounded-xl border border-white/10 bg-[#0F1420] px-3 py-2 text-gray-100 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
              />
            </FieldRow>
          </div>
          <FieldRow label="Status">
            <select
              value={item.status}
              onChange={(e) => update("status", e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#0F1420] px-3 py-2 text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </FieldRow>
          <div className="flex gap-2">
            <button
              onClick={() => onPreview(item)}
              className="flex-1 rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-medium text-gray-100 hover:bg-white/15"
            >
              Preview
            </button>
            <button
              onClick={() => onSave(item)}
              className="flex-1 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-200"
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
      <span className="mb-2 block text-xs uppercase tracking-[0.3em] text-gray-500">{label}</span>
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
      <div className="w-full max-w-lg overflow-hidden rounded-t-3xl border border-white/10 bg-[#0B1019] p-6 text-sm text-gray-400 shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">Preview</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-gray-300 hover:text-gray-100"
          >
            ✕
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {item.thumbnail && <img src={item.thumbnail} alt="" className="h-48 w-full rounded-2xl object-cover" />}
          <div className="flex flex-col gap-2">
            <span className="inline-flex w-max items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-gray-300">
              {type === "service" ? "Service" : "Product"}
            </span>
            <h3 className="text-2xl font-semibold text-gray-100">{item.title}</h3>
            <p className="text-sm leading-relaxed text-gray-400">{item.description || "Craft a concise description to guide clients."}</p>
            <div className="text-2xl font-semibold text-gray-100">{formatUSD(item.price)}</div>
          </div>
          <button className="w-full rounded-full border border-white/10 bg-white/10 px-6 py-3 text-sm font-semibold text-gray-100 hover:bg-white/15">
            {type === "service" ? "Book service" : "Add to cart"}
          </button>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onEdit}
            className="flex-1 rounded-full border border-white/10 bg-white/10 px-4 py-3 text-sm font-medium text-gray-100 hover:bg-white/15"
          >
            Refine details
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-white/10 bg-black/40 px-4 py-3 text-sm text-gray-400 hover:text-gray-200"
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
      <div className="w-full max-w-sm space-y-6 rounded-3xl border border-white/10 bg-[#0B1019] p-8 text-sm text-gray-400 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 text-2xl text-red-300">
            ⚠️
          </div>
          <h3 className="text-lg font-semibold text-gray-100">Confirm removal</h3>
          <p className="text-xs leading-relaxed text-gray-400">
            Delete this item? This action cannot be undone and removes it from your catalog.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-full border border-white/10 bg-black/40 px-5 py-2 text-sm text-gray-400 hover:text-gray-200"
          >
            Keep item
          </button>
          <button
            onClick={onConfirm}
            className="rounded-full bg-red-500 px-5 py-2 text-sm font-semibold text-white shadow-[0_14px_35px_rgba(220,38,38,0.35)] hover:bg-red-400"
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
    <div className="rounded-3xl border border-dashed border-white/15 bg-[#0C1119] py-24 text-center text-sm text-gray-400">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/10 text-2xl text-gray-200">
        ✨
      </div>
      <p className="mt-6 text-base font-medium text-gray-100">No items found</p>
      <p className="mt-2 mx-auto max-w-sm text-xs text-gray-400">
        Create your first offer to unlock analytics, conversion flows, and checkout tools.
      </p>
      <button
        onClick={onCreate}
        className="mt-6 rounded-full border border-white/10 bg-white/10 px-6 py-3 text-sm font-semibold text-gray-100 hover:bg-white/15"
      >
        Create your first showcase
      </button>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="h-52 animate-pulse rounded-2xl border border-white/5 bg-[#111722]" />
  )
}

function InsightsRow() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard
        label="Views"
        value="12.4k"
        trend="↑ 18%"
        description="Audience touchpoints in the last 7 days"
      />
      <StatCard
        label="Clicks"
        value="3.1k"
        trend="↑ 9%"
        description="High-intent visitors exploring your offers"
      />
      <StatCard
        label="Sales"
        value="286"
        trend="↑ 24%"
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
}: {
  label: string
  value: string
  trend: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0D121C] p-6 text-sm text-gray-400 shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.3em] text-gray-500">{label}</p>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold text-gray-100">{value}</span>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.3em] text-emerald-300">
            {trend}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-gray-400">{description}</p>
      </div>
    </div>
  )
}

function BadgePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 py-1 text-[11px] font-medium text-gray-300">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
      {label}
    </span>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: string
  label: string
  onClick(): void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold text-gray-100 transition hover:bg-white/15"
    >
      <span className="text-lg">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function QuickBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] text-gray-400">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
      {label}
    </span>
  )
}

