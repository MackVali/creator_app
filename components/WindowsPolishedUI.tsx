import React, { useState, useEffect, useMemo, useRef } from "react"

// Utility to join class names conditionally
function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

type Energy = "no" | "low" | "medium" | "high" | "ultra" | "extreme"
type Day = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat"

export interface WindowItem {
  id: string
  name: string
  days: Day[]
  start: string
  end: string
  energy?: Energy
  location?: string
  active?: boolean
}

interface Props {
  windows?: WindowItem[]
  onCreate?(data: WindowItem): void
  onEdit?(id: string, data: WindowItem): void
  onDelete?(id: string): void
}

const dayOrder: Day[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const energies: Energy[] = ["no", "low", "medium", "high", "ultra", "extreme"]
const energyAccent: Record<Energy, string> = {
  no: "#2A2D31",
  low: "#2F3338",
  medium: "#363B41",
  high: "#3D434A",
  ultra: "#444C55",
  extreme: "#4B5560",
}

// Mock data if none provided
const mockWindows: WindowItem[] = [
  {
    id: "1",
    name: "Morning Focus",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    start: "09:00",
    end: "11:00",
    energy: "high",
    location: "home",
    active: true,
  },
  {
    id: "2",
    name: "Gym",
    days: ["Mon", "Wed", "Fri"],
    start: "18:00",
    end: "19:30",
    energy: "ultra",
    location: "work",
    active: false,
  },
  {
    id: "3",
    name: "Study",
    days: ["Sat"],
    start: "12:00",
    end: "15:00",
    energy: "medium",
    location: "home",
    active: true,
  },
]

export default function WindowsPolishedUI({
  windows,
  onCreate,
  onEdit,
  onDelete,
}: Props) {
  const [list, setList] = useState<WindowItem[] | undefined>(windows)
  const [loading, setLoading] = useState(!windows)

  useEffect(() => {
    if (!windows) {
      const t = setTimeout(() => {
        setList(mockWindows)
        setLoading(false)
      }, 800)
      return () => clearTimeout(t)
    } else {
      setList(windows)
      setLoading(false)
    }
  }, [windows])

  // Filters
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all"
  )
  const [selectedDays, setSelectedDays] = useState<Set<Day>>(new Set())
  const [energyFilter, setEnergyFilter] = useState<"all" | Energy>("all")
  const [search, setSearch] = useState("")
  const [searchDebounced, setSearchDebounced] = useState("")
  const [sort, setSort] = useState("az")

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.toLowerCase()), 200)
    return () => clearTimeout(t)
  }, [search])

  const filtered = useMemo(() => {
    let w = list ?? []
    if (statusFilter !== "all") {
      const act = statusFilter === "active"
      w = w.filter((x) => Boolean(x.active) === act)
    }
    if (selectedDays.size) {
      w = w.filter((x) => x.days.some((d) => selectedDays.has(d)))
    }
    if (energyFilter !== "all") {
      w = w.filter((x) => x.energy === energyFilter)
    }
    if (searchDebounced) {
      w = w.filter((x) => x.name.toLowerCase().includes(searchDebounced))
    }
    switch (sort) {
      case "start":
        w = [...w].sort((a, b) => a.start.localeCompare(b.start))
        break
      case "end":
        w = [...w].sort((a, b) => a.end.localeCompare(b.end))
        break
      case "active":
        w = [...w].sort((a, b) => Number(b.active) - Number(a.active))
        break
      default:
        w = [...w].sort((a, b) => a.name.localeCompare(b.name))
    }
    return w
  }, [list, statusFilter, selectedDays, energyFilter, searchDebounced, sort])

  // Drawer state
  const [editing, setEditing] = useState<WindowItem | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<WindowItem | null>(null)

  function handleSave(data: WindowItem) {
    if (editing) {
      onEdit?.(editing.id, data)
      if (!onEdit) {
        setList((prev) =>
          prev?.map((w) => (w.id === editing.id ? { ...data, id: editing.id } : w))
        )
      }
    } else {
      const newItem = { ...data, id: Date.now().toString() }
      onCreate?.(newItem)
      if (!onCreate) setList((prev) => (prev ? [...prev, newItem] : [newItem]))
    }
    setDrawerOpen(false)
    setEditing(null)
  }

  function handleDelete(id: string) {
    onDelete?.(id)
    if (!onDelete) setList((prev) => prev?.filter((w) => w.id !== id))
    setConfirmDelete(null)
  }

  const allEmpty = !loading && (filtered.length === 0)

  return (
    <div className="min-h-screen bg-[#111315] text-[#E6E6E6]">
      <HeaderBar onNew={() => setDrawerOpen(true)} />
      <FiltersBar
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        selectedDays={selectedDays}
        setSelectedDays={setSelectedDays}
        energyFilter={energyFilter}
        setEnergyFilter={setEnergyFilter}
        search={search}
        setSearch={setSearch}
        sort={sort}
        setSort={setSort}
      />
      <div className="p-4 space-y-4">
        {loading && <LoadingSkeleton />}
        {allEmpty && <EmptyState onNew={() => setDrawerOpen(true)} />}
        {!loading && filtered.map((w) => (
          <WindowCard
            key={w.id}
            item={w}
            onEdit={() => {
              setEditing(w)
              setDrawerOpen(true)
            }}
            onDelete={() => setConfirmDelete(w)}
          />
        ))}
      </div>
      {drawerOpen && (
        <Drawer
          initial={editing}
          onClose={() => {
            setDrawerOpen(false)
            setEditing(null)
          }}
          onSave={handleSave}
        />
      )}
      {confirmDelete && (
        <ConfirmSheet
          item={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete.id)}
        />
      )}
    </div>
  )
}

// HeaderBar
function HeaderBar({ onNew }: { onNew: () => void }) {
  return (
    <header className="bg-[#1C1F22] px-4 py-3 flex items-center justify-between sticky top-0 z-20">
      <div>
        <h1 className="text-lg font-semibold">Windows</h1>
        <p className="text-sm text-[#A6A6A6]">Manage your scheduling windows</p>
      </div>
      <button
        className="bg-[#22262A] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
        onClick={onNew}
      >
        New Window
      </button>
    </header>
  )
}

// FiltersBar
interface FiltersProps {
  statusFilter: "all" | "active" | "inactive"
  setStatusFilter: (v: "all" | "active" | "inactive") => void
  selectedDays: Set<Day>
  setSelectedDays: (v: Set<Day>) => void
  energyFilter: "all" | Energy
  setEnergyFilter: (v: "all" | Energy) => void
  search: string
  setSearch: (v: string) => void
  sort: string
  setSort: (v: string) => void
}

function FiltersBar({
  statusFilter,
  setStatusFilter,
  selectedDays,
  setSelectedDays,
  energyFilter,
  setEnergyFilter,
  search,
  setSearch,
  sort,
  setSort,
}: FiltersProps) {
  function toggleDay(d: Day) {
    const next = new Set(selectedDays)
    if (next.has(d)) next.delete(d)
    else next.add(d)
    setSelectedDays(next)
  }
  const statusOptions: { key: "all" | "active" | "inactive"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "inactive", label: "Inactive" },
  ]
  return (
    <div className="sticky top-[72px] z-10 backdrop-blur bg-[#1C1F22]/95 px-4 py-2 space-y-2">
      <div className="flex gap-2">
        {statusOptions.map((o) => (
          <button
            key={o.key}
            onClick={() => setStatusFilter(o.key)}
            className={classNames(
              "flex-1 h-10 rounded-md text-sm",
              statusFilter === o.key
                ? "bg-[#22262A]"
                : "bg-transparent border border-[#2F343A]"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {dayOrder.map((d) => (
          <DayPill key={d} label={d} active={selectedDays.has(d)} onClick={() => toggleDay(d)} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <EnergyChip
          energy="all"
          label="All"
          active={energyFilter === "all"}
          onClick={() => setEnergyFilter("all")}
        />
        {energies.map((e) => (
          <EnergyChip
            key={e}
            energy={e}
            label={e}
            active={energyFilter === e}
            onClick={() => setEnergyFilter(e)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          className="flex-1 h-10 rounded-md bg-[#22262A] px-3 text-sm placeholder-[#7C838A] focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-10 rounded-md bg-[#22262A] px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="az">A→Z</option>
          <option value="start">Start time</option>
          <option value="end">End time</option>
          <option value="active">Active first</option>
        </select>
      </div>
    </div>
  )
}

// DayPill
function DayPill({
  label,
  active,
  onClick,
}: {
  label: Day
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={classNames(
        "w-10 h-10 rounded-full text-xs flex items-center justify-center",
        active ? "bg-[#22262A]" : "bg-transparent border border-[#2F343A]"
      )}
    >
      {label}
    </button>
  )
}

// EnergyChip
function EnergyChip({
  energy,
  label,
  active,
  onClick,
}: {
  energy: Energy | "all"
  label: string
  active: boolean
  onClick: () => void
}) {
  const accent = energy === "all" ? "#2F343A" : energyAccent[energy as Energy]
  return (
    <button
      onClick={onClick}
      className={classNames(
        "relative px-3 h-8 rounded-md text-xs flex items-center gap-2 border border-[#2F343A]",
        active && "bg-[#22262A]"
      )}
    >
      <span
        className="absolute left-0 top-0 h-full w-[3px] rounded-l-md"
        style={{ background: accent }}
      />
      <span className="capitalize ml-1">{label}</span>
    </button>
  )
}

// WindowCard
function WindowCard({
  item,
  onEdit,
  onDelete,
}: {
  item: WindowItem
  onEdit: () => void
  onDelete: () => void
}) {
  const [menu, setMenu] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!cardRef.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener("click", onDoc)
    return () => document.removeEventListener("click", onDoc)
  }, [])

  const startPct = (toMins(item.start) / 1440) * 100
  const endPct = (toMins(item.end) / 1440) * 100

  return (
    <div
      ref={cardRef}
      className="bg-[#1C1F22] border border-[#2F343A] rounded-xl p-4 flex justify-between hover:bg-[#22262A] transition-colors"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium capitalize">{item.name}</h3>
          <span
            className={classNames(
              "w-2 h-2 rounded-full",
              item.active ? "bg-[#6DD3A8]" : "bg-[#7C838A]"
            )}
          />
        </div>
        <div className="flex gap-1">
          {dayOrder.map((d) => (
            <span
              key={d}
              className={classNames(
                "w-6 h-6 text-[10px] flex items-center justify-center rounded-full",
                item.days.includes(d)
                  ? "bg-[#22262A]"
                  : "bg-transparent border border-[#2F343A]"
              )}
            >
              {d[0]}
            </span>
          ))}
        </div>
        <div>
          <p className="text-sm">
            {item.start} — {item.end}
          </p>
          <TimelineMini start={startPct} end={endPct} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {item.energy && <EnergyChip energy={item.energy} label={item.energy} active={false} onClick={() => {}} />}
          {item.location && (
            <span className="px-2 h-6 rounded-md bg-[#22262A] text-xs flex items-center">
              {item.location}
            </span>
          )}
        </div>
      </div>
      <div className="relative">
        <button
          className="px-3 py-1 rounded-md border border-[#2F343A] text-sm focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          className="ml-2 w-8 h-8 rounded-md border border-[#2F343A] focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
          onClick={() => setMenu((m) => !m)}
        >
          ⋯
        </button>
        {menu && (
          <div className="absolute right-0 mt-2 w-32 bg-[#1C1F22] border border-[#2F343A] rounded-md z-10">
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-[#22262A]"
              onClick={() => {
                setMenu(false)
                onEdit()
              }}
            >
              Edit
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-[#22262A]"
              onClick={() => {
                setMenu(false)
              }}
            >
              Duplicate
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm text-[#E8C268] hover:bg-[#22262A]"
              onClick={() => {
                setMenu(false)
                onDelete()
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function TimelineMini({ start, end }: { start: number; end: number }) {
  return (
    <div className="relative h-2 bg-[#22262A] rounded-full mt-1">
      <div
        className="absolute h-2 bg-[#9966CC] rounded-full"
        style={{ left: `${start}%`, width: `${Math.max(end - start, 2)}%` }}
      />
    </div>
  )
}

// Drawer for create/edit
function Drawer({
  initial,
  onClose,
  onSave,
}: {
  initial: WindowItem | null
  onClose: () => void
  onSave: (data: WindowItem) => void
}) {
  const [form, setForm] = useState<WindowItem>(
    initial ?? {
      id: "",
      name: "",
      days: [],
      start: "08:00",
      end: "09:00",
      energy: "no",
      location: "",
      active: true,
    }
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  function toggleDay(d: Day) {
    setForm((f) => ({
      ...f,
      days: f.days.includes(d)
        ? f.days.filter((x) => x !== d)
        : [...f.days, d],
    }))
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex justify-end" 
      role="dialog" aria-modal="true"
    >
      <div className="w-full max-w-md h-full bg-[#1C1F22] p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">
          {initial ? "Edit Window" : "New Window"}
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Name</label>
            <input
              className="w-full h-10 rounded-md bg-[#22262A] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Days</label>
            <div className="flex flex-wrap gap-2">
              {dayOrder.map((d) => (
                <DayPill
                  key={d}
                  label={d}
                  active={form.days.includes(d)}
                  onClick={() => toggleDay(d)}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm mb-1">Start</label>
              <input
                type="time"
                className="w-full h-10 rounded-md bg-[#22262A] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm mb-1">End</label>
              <input
                type="time"
                className="w-full h-10 rounded-md bg-[#22262A] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1">Energy</label>
            <div className="grid grid-cols-3 gap-2">
              {energies.map((e) => (
                <label
                  key={e}
                  className={classNames(
                    "flex items-center gap-2 h-8 px-2 rounded-md border border-[#2F343A]",
                    form.energy === e && "bg-[#22262A]"
                  )}
                >
                  <input
                    type="radio"
                    name="energy"
                    className="hidden"
                    value={e}
                    checked={form.energy === e}
                    onChange={() => setForm({ ...form, energy: e })}
                  />
                  <span
                    className="w-[3px] h-full rounded-sm"
                    style={{ background: energyAccent[e] }}
                  />
                  <span className="capitalize text-xs">{e}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1">Location</label>
            <input
              className="w-full h-10 rounded-md bg-[#22262A] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
              value={form.location ?? ""}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="active"
              type="checkbox"
              className="w-4 h-4 bg-[#22262A] border border-[#2F343A]"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <label htmlFor="active" className="text-sm">
              Active
            </label>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            className="h-10 px-4 rounded-md border border-[#2F343A] focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="h-10 px-4 rounded-md bg-[#22262A] focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
            onClick={() => onSave(form)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// Confirm delete sheet
function ConfirmSheet({
  item,
  onCancel,
  onConfirm,
}: {
  item: WindowItem
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onCancel])
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end" role="dialog" aria-modal="true">
      <div className="w-full bg-[#1C1F22] p-4 rounded-t-xl">
        <p className="mb-4">Delete window? {item.name} {item.start} — {item.end}</p>
        <div className="flex justify-end gap-2">
          <button
            className="h-10 px-4 rounded-md border border-[#2F343A] focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="h-10 px-4 rounded-md bg-[#22262A] text-[#E8C268] focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-4xl mb-4">🪟</div>
      <p className="mb-4">No windows yet</p>
      <button
        className="bg-[#22262A] rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
        onClick={onNew}
      >
        New Window
      </button>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-32 bg-gradient-to-r from-[#1C1F22] to-[#22262A] rounded-xl"
        />
      ))}
    </div>
  )
}

function toMins(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

