/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import React, { useEffect, useState } from "react"

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

export interface ComingSoonProDashboardProps {
  services?: Service[]
  products?: Product[]
  onCreateService?(draft: Service): void
  onCreateProduct?(draft: Product): void
  onUpdateService?(id: string, patch: Partial<Service>): void
  onUpdateProduct?(id: string, patch: Partial<Product>): void
  onDeleteService?(id: string): void
  onDeleteProduct?(id: string): void
}

export default function ComingSoonProDashboard({
  services: servicesProp,
  products: productsProp,
  onCreateService,
  onCreateProduct,
  onUpdateService,
  onUpdateProduct,
  onDeleteService,
  onDeleteProduct,
}: ComingSoonProDashboardProps) {
  const [services, setServices] = useState<Service[]>(
    servicesProp ?? [
      {
        id: "s1",
        title: "Portrait Session",
        price: 150,
        durationMins: 60,
        status: "draft",
        updatedAt: new Date().toISOString(),
      },
      {
        id: "s2",
        title: "Studio Rental",
        price: 300,
        durationMins: 120,
        status: "published",
        updatedAt: new Date().toISOString(),
      },
    ]
  )
  const [products, setProducts] = useState<Product[]>(
    productsProp ?? [
      {
        id: "p1",
        title: "Merch Tee",
        price: 25,
        inventory: 10,
        status: "draft",
        updatedAt: new Date().toISOString(),
      },
      {
        id: "p2",
        title: "Digital Preset Pack",
        price: 15,
        inventory: 100,
        status: "published",
        updatedAt: new Date().toISOString(),
      },
    ]
  )

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
      <h1 className="text-lg font-semibold">Pro Dashboard</h1>
      <p className="text-sm text-[#A6A6A6] mt-1">
        Create products & services for your profile
      </p>
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
    <div
      className="fixed inset-0 bg-black/50 flex justify-end" role="dialog" aria-modal>
      <div className="w-full max-w-sm h-full overflow-y-auto bg-[#1C1F22] border-l border-[#2F343A] p-4 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            {draft ? "Edit" : "New"} {type === "service" ? "Service" : "Product"}
          </h2>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="space-y-3 text-sm">
          <FieldRow label="Cover Image">
            <div className="h-32 bg-[#22262A] flex items-center justify-center rounded-md text-[#7C838A]">
              Upload
            </div>
          </FieldRow>
          <FieldRow label="Title">
            <input
              value={item.title}
              onChange={(e) => update("title", e.target.value)}
              className="w-full px-2 py-1 rounded-md bg-[#1C1F22] border border-[#2F343A]"
            />
          </FieldRow>
          <FieldRow label="Description">
            <textarea
              value={item.description}
              onChange={(e) => update("description", e.target.value)}
              className="w-full h-24 px-2 py-1 rounded-md bg-[#1C1F22] border border-[#2F343A]"
            />
          </FieldRow>
          <FieldRow label="Price (USD)">
            <input
              type="number"
              value={item.price}
              onChange={(e) => update("price", parseFloat(e.target.value))}
              className="w-full px-2 py-1 rounded-md bg-[#1C1F22] border border-[#2F343A]"
            />
          </FieldRow>
          {type === "service" && (
            <FieldRow label="Duration (mins)">
              <input
                type="number"
                value={item.durationMins || ""}
                onChange={(e) => update("durationMins", parseInt(e.target.value))}
                className="w-full px-2 py-1 rounded-md bg-[#1C1F22] border border-[#2F343A]"
              />
            </FieldRow>
          )}
          {type === "product" && (
            <>
              <FieldRow label="Inventory">
                <input
                  type="number"
                  value={item.inventory || 0}
                  onChange={(e) => update("inventory", parseInt(e.target.value))}
                  className="w-full px-2 py-1 rounded-md bg-[#1C1F22] border border-[#2F343A]"
                />
              </FieldRow>
              <FieldRow label="SKU">
                <input
                  value={item.sku || ""}
                  onChange={(e) => update("sku", e.target.value)}
                  className="w-full px-2 py-1 rounded-md bg-[#1C1F22] border border-[#2F343A]"
                />
              </FieldRow>
            </>
          )}
          <FieldRow label="Visibility">
            <select
              value={item.status}
              onChange={(e) => update("status", e.target.value)}
              className="w-full px-2 py-1 rounded-md bg-[#1C1F22] border border-[#2F343A]"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </FieldRow>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => onSave(item)}
            className="flex-1 px-3 py-2 bg-[#9966CC] text-white rounded-md"
          >
            Save
          </button>
          <button
            onClick={() => onPreview(item)}
            className="flex-1 px-3 py-2 bg-[#22262A] rounded-md"
          >
            Preview
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-[#A6A6A6] mb-1 block">{label}</span>
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
      <p>No items found.</p>
      <button
        onClick={onCreate}
        className="mt-4 px-3 py-2 bg-[#9966CC] text-white rounded-md"
      >
        Create your first
      </button>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="animate-pulse bg-[#1C1F22] border border-[#2F343A] rounded-md h-48" />
  )
}

function InsightsRow() {
  return (
    <div className="flex gap-2 text-xs">
      <StatChip label="Views" value={123} />
      <StatChip label="Clicks" value={45} />
      <StatChip label="Sales" value={8} />
    </div>
  )
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-1 bg-[#1C1F22] border border-[#2F343A] rounded-md">
      <span className="text-[#A6A6A6] mr-1">{label}</span>
      <span>{value}</span>
    </div>
  )
}

