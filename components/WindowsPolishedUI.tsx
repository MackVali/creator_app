"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  CalendarDays,
  Clock,
  Copy,
  Flame as FlameIcon,
  MoreVertical,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  SunMedium,
  Trash2,
  X,
} from "lucide-react"

import FlameEmber, { type FlameLevel } from "@/components/FlameEmber"
import { useToastHelpers } from "@/components/ui/toast"
import {
  useLocationContexts,
  type CreateLocationResult,
  type LocationContextOption,
} from "@/lib/hooks/useLocationContexts"

// Utility to join class names conditionally
function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

type Energy = "no" | "low" | "medium" | "high" | "ultra" | "extreme"
type Day = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat"
type SortOption = "az" | "start" | "end" | "active"

function formatLocationLabel(value: string) {
  return value
    .replace(/[_\s]+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function normalizeLocationValue(value?: string | null) {
  return value ? String(value).toUpperCase().trim() : "";
}

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
  onCreate?(data: WindowItem): Promise<unknown>
  onEdit?(id: string, data: WindowItem): Promise<unknown>
  onDelete?(id: string): void
}

const dayOrder: Day[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const energies: Energy[] = ["no", "low", "medium", "high", "ultra", "extreme"]
const energyAccent: Record<Energy, string> = {
  no: "#818cf8",
  low: "#38bdf8",
  medium: "#22d3ee",
  high: "#34d399",
  ultra: "#fbbf24",
  extreme: "#f97316",
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
    location: "Home Studio",
    active: true,
  },
  {
    id: "2",
    name: "Gym",
    days: ["Mon", "Wed", "Fri"],
    start: "18:00",
    end: "19:30",
    energy: "ultra",
    location: "Fitness Club",
    active: false,
  },
  {
    id: "3",
    name: "Study",
    days: ["Sat"],
    start: "12:00",
    end: "15:00",
    energy: "medium",
    location: "Library",
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
  const toast = useToastHelpers()
  const {
    options: locationOptions,
    loading: locationOptionsLoading,
    error: locationOptionsError,
    createContext: createLocationContext,
  } = useLocationContexts()

  const locationLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    locationOptions.forEach((option) => {
      map.set(option.value, option.label)
    })
    return map
  }, [locationOptions])

  const resolveLocationLabel = useCallback(
    (value?: string | null) => {
      if (!value) return null
      const normalized = value.toUpperCase()
      return locationLabelMap.get(normalized) ?? formatLocationLabel(normalized)
    },
    [locationLabelMap],
  )

  useEffect(() => {
    if (!windows) {
      const t = setTimeout(() => {
        setList(mockWindows)
        setLoading(false)
      }, 800)
      return () => clearTimeout(t)
    }
    setList(windows)
    setLoading(false)
  }, [windows])

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [selectedDays, setSelectedDays] = useState<Set<Day>>(new Set())
  const [energyFilter, setEnergyFilter] = useState<"all" | Energy>("all")
  const [search, setSearch] = useState("")
  const [searchDebounced, setSearchDebounced] = useState("")
  const [sort, setSort] = useState<SortOption>("start")
  const [filtersOpen, setFiltersOpen] = useState(false)

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

  const stats = useMemo(() => {
    const items = list ?? []
    const active = items.filter((w) => w.active).length
    const total = items.length
    const energyIndices = items
      .map((w) => (w.energy ? energies.indexOf(w.energy) : -1))
      .filter((idx) => idx >= 0)
    const topEnergy =
      energyIndices.length > 0
        ? energies[Math.max(...energyIndices) as number]
        : null
    return { total, active, topEnergy }
  }, [list])

  const hasActiveFilters =
    statusFilter !== "all" ||
    selectedDays.size > 0 ||
    energyFilter !== "all" ||
    Boolean(searchDebounced)

  const filteredCount = filtered.length
  const allEmpty = !loading && filteredCount === 0

  function resetFilters() {
    setStatusFilter("all")
    setSelectedDays(new Set())
    setEnergyFilter("all")
    setSearch("")
    setSort("start")
  }

  const [editing, setEditing] = useState<WindowItem | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<WindowItem | null>(null)

  async function handleSave(data: WindowItem) {
    try {
      const normalizedLocation = normalizeLocationValue(data.location) || "ANY"
      const nextData = { ...data, location: normalizedLocation as WindowItem["location"] }
      if (editing) {
        if (onEdit) {
          const ok = await onEdit(editing.id, nextData)
          if (ok === false) throw new Error("save failed")
        } else {
          setList((prev) =>
            prev?.map((w) => (w.id === editing.id ? { ...nextData, id: editing.id } : w)),
          )
        }
      } else {
        const newItem = { ...nextData, id: Date.now().toString() }
        if (onCreate) {
          const ok = await onCreate(newItem)
          if (ok === false) throw new Error("save failed")
        } else {
          setList((prev) => (prev ? [...prev, newItem] : [newItem]))
        }
      }
      setDrawerOpen(false)
      setEditing(null)
    } catch (error) {
      console.error(error)
      toast.error("Failed to save window")
    }
  }

  function handleDelete(id: string) {
    onDelete?.(id)
    if (!onDelete) setList((prev) => prev?.filter((w) => w.id !== id))
    setConfirmDelete(null)
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#04060d] text-slate-100">
      <div className="pointer-events-none absolute inset-x-0 top-[-20%] h-[520px] bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.25),_transparent_65%)]" />
      <div className="pointer-events-none absolute inset-x-16 top-1/3 h-[360px] rounded-full bg-[radial-gradient(circle,_rgba(34,211,238,0.18),_transparent_70%)] blur-3xl" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-16 pt-12">
        <HeaderBar
          active={stats.active}
          highlightEnergy={stats.topEnergy}
          onNew={() => setDrawerOpen(true)}
          hasActiveFilters={hasActiveFilters}
          onOpenFilters={() => setFiltersOpen(true)}
          total={stats.total}
        />
        <section className="relative space-y-4">
          {loading && <LoadingSkeleton />}
          {!loading && filteredCount > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {filtered.map((w) => (
                <WindowCard
                  key={w.id}
                  item={w}
                  onDelete={() => setConfirmDelete(w)}
                  onEdit={() => {
                    setEditing(w)
                    setDrawerOpen(true)
                  }}
                  resolveLocationLabel={resolveLocationLabel}
                />
              ))}
            </div>
          )}
          {allEmpty && <EmptyState onNew={() => setDrawerOpen(true)} />}
        </section>
      </div>
      {filtersOpen && (
        <FiltersSheet
          energyFilter={energyFilter}
          filtered={filteredCount}
          hasFilters={hasActiveFilters}
          onClose={() => setFiltersOpen(false)}
          onReset={resetFilters}
          search={search}
          selectedDays={selectedDays}
          setEnergyFilter={setEnergyFilter}
          setSearch={setSearch}
          setSelectedDays={setSelectedDays}
          setSort={setSort}
          setStatusFilter={setStatusFilter}
          sort={sort}
          statusFilter={statusFilter}
          total={stats.total}
        />
      )}
      {drawerOpen && (
        <Drawer
          initial={editing}
          onClose={() => {
            setDrawerOpen(false)
            setEditing(null)
          }}
          onSave={handleSave}
          locationOptions={locationOptions}
          locationLoading={locationOptionsLoading}
          locationError={locationOptionsError}
          onCreateLocation={createLocationContext}
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

function HeaderBar({
  onNew,
  total,
  active,
  highlightEnergy,
  onOpenFilters,
  hasActiveFilters,
}: {
  onNew: () => void
  total: number
  active: number
  highlightEnergy: Energy | null
  onOpenFilters: () => void
  hasActiveFilters: boolean
}) {
  const energyLabel = highlightEnergy
    ? `${highlightEnergy.charAt(0).toUpperCase()}${highlightEnergy.slice(1)}`
    : "–"
  return (
    <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-10 shadow-[0_30px_80px_rgba(15,23,42,0.45)] backdrop-blur">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[45%] bg-[radial-gradient(circle_at_left,_rgba(129,140,248,0.16),_transparent_70%)]" />
      <div className="pointer-events-none absolute -right-10 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(52,211,153,0.25),_transparent_70%)] blur-xl" />
      <div className="relative flex flex-col gap-8">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-200/80">
            <Sparkles className="h-4 w-4" />
            Windows
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-white md:text-4xl">
            Shape your ideal week
          </h1>
          <p className="mt-3 max-w-xl text-sm text-slate-300">
            Build time blocks that match your energy. Prioritize the windows that move you
            forward and keep everything else in sight.
          </p>
          <button
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:shadow-indigo-500/50"
            onClick={onNew}
            type="button"
          >
            <Plus className="h-4 w-4" />
            New window
          </button>
        </div>
        <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <StatCard icon={<SunMedium className="h-3.5 w-3.5" />} label="Active" value={`${active}`} />
            <StatCard icon={<CalendarDays className="h-3.5 w-3.5" />} label="Total" value={`${total}`} />
            <StatCard icon={<FlameIcon className="h-3.5 w-3.5" />} label="Peak energy" value={energyLabel} />
          </div>
          <FiltersLauncher
            className="w-full justify-center sm:w-auto"
            hasFilters={hasActiveFilters}
            onOpen={onOpenFilters}
          />
        </div>
      </div>
    </header>
  )
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.07] px-3 py-1.5 shadow-[0_15px_35px_rgba(15,23,42,0.35)]">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.12] text-indigo-200">
        {icon}
      </span>
      <div className="flex items-baseline gap-1">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-300">
          {label}
        </span>
        <span className="text-sm font-semibold text-white">{value}</span>
      </div>
    </div>
  )
}

interface FiltersProps {
  statusFilter: "all" | "active" | "inactive"
  setStatusFilter: (v: "all" | "active" | "inactive") => void
  selectedDays: Set<Day>
  setSelectedDays: (v: Set<Day>) => void
  energyFilter: "all" | Energy
  setEnergyFilter: (v: "all" | Energy) => void
  search: string
  setSearch: (v: string) => void
  sort: SortOption
  setSort: (v: SortOption) => void
}

interface FiltersLauncherProps {
  hasFilters: boolean
  onOpen: () => void
  className?: string
}

interface FiltersSheetProps extends FiltersProps {
  total: number
  filtered: number
  hasFilters: boolean
  onReset: () => void
  onClose: () => void
}

function FiltersLauncher({ hasFilters, onOpen, className }: FiltersLauncherProps) {
  return (
    <button
      className={classNames(
        "inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60",
        hasFilters
          ? "bg-indigo-500/80 text-white shadow-[0_0_15px_rgba(99,102,241,0.45)] hover:bg-indigo-500"
          : "border border-white/10 bg-white/[0.04] text-slate-200 hover:border-white/20 hover:text-white",
        className,
      )}
      onClick={onOpen}
      type="button"
    >
      <SlidersHorizontal className="h-4 w-4" />
      Filter options
    </button>
  )
}

function FiltersSheet({
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
  total,
  filtered,
  hasFilters,
  onReset,
  onClose,
}: FiltersSheetProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

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
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#080b14]/95 shadow-[0_30px_80px_rgba(15,23,42,0.6)]">
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Filter windows</h2>
            <p className="mt-1 text-sm text-slate-300">
              Narrow the schedule by combining different filter options.
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Showing {filtered} of {total} windows
            </p>
          </div>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition hover:border-white/30 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-6 px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Search
              </label>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-11 w-full rounded-full border border-white/10 bg-white/[0.05] pl-9 pr-4 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-0"
                  placeholder="Search by name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Sort by
              </label>
              <select
                className="mt-2 h-11 w-full rounded-full border border-white/10 bg-white/[0.05] px-4 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring-0"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
              >
                <option className="bg-slate-900 text-white" value="az">
                  A → Z
                </option>
                <option className="bg-slate-900 text-white" value="start">
                  Start time
                </option>
                <option className="bg-slate-900 text-white" value="end">
                  End time
                </option>
                <option className="bg-slate-900 text-white" value="active">
                  Active first
                </option>
              </select>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Status
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <button
                  key={option.key}
                  className={classNames(
                    "flex min-w-[108px] items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide transition",
                    statusFilter === option.key
                      ? "border-transparent bg-indigo-500/80 text-white shadow-[0_0_15px_rgba(99,102,241,0.45)]"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20",
                  )}
                  onClick={() => setStatusFilter(option.key)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Days of the week
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {dayOrder.map((d) => (
                <DayPill
                  key={d}
                  active={selectedDays.has(d)}
                  label={d}
                  onClick={() => toggleDay(d)}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Energy focus
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <EnergyChip
                active={energyFilter === "all"}
                energy="all"
                label="All"
                onClick={() => setEnergyFilter("all")}
              />
              {energies.map((e) => (
                <EnergyChip
                  key={e}
                  active={energyFilter === e}
                  energy={e}
                  label={e}
                  onClick={() => setEnergyFilter(e)}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-white/10 bg-white/[0.02] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasFilters}
            onClick={() => {
              if (hasFilters) onReset()
            }}
            type="button"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Clear filters
          </button>
          <div className="flex items-center gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/30 hover:text-white"
              onClick={onClose}
              type="button"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

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
      type="button"
      onClick={onClick}
      className={classNames(
        "rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide transition",
        active
          ? "border-transparent bg-indigo-500/80 text-white shadow-[0_0_15px_rgba(99,102,241,0.45)]"
          : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20",
      )}
    >
      {label}
    </button>
  )
}

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
  const accent = energy === "all" ? "#64748b" : energyAccent[energy as Energy]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={classNames(
        "relative flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold capitalize tracking-wide transition",
        active
          ? "border-transparent bg-indigo-500/20 text-indigo-100 shadow-[0_0_15px_rgba(129,140,248,0.45)]"
          : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20",
      )}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: accent }}
      />
      <span>{label}</span>
    </button>
  )
}

function WindowCard({
  item,
  onEdit,
  onDelete,
  resolveLocationLabel,
}: {
  item: WindowItem
  onEdit: () => void
  onDelete: () => void
  resolveLocationLabel: (value?: string | null) => string | null
}) {
  const [menu, setMenu] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!cardRef.current?.contains(e.target as Node)) setMenu(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(false)
    }
    document.addEventListener("click", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("click", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [])

  const startPct = (toMins(item.start) / 1440) * 100
  const endPct = (toMins(item.end) / 1440) * 100
  const daySummary =
    item.days.length === 7 ? "Every day" : item.days.join(" · ")
  const displayLocation = resolveLocationLabel(item.location)

  return (
    <article
      ref={cardRef}
      className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-[0_25px_60px_rgba(15,23,42,0.4)] backdrop-blur transition hover:border-indigo-400/50 hover:bg-white/[0.08]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition group-hover:opacity-100" />
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-xl font-semibold text-white">{item.name}</h3>
              <StatusBadge active={Boolean(item.active)} />
            </div>
            <p className="text-sm text-slate-300">{daySummary}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-indigo-400/40 hover:text-white"
              onClick={onEdit}
              type="button"
            >
              <PencilLine className="h-4 w-4" />
              Edit
            </button>
            <button
              aria-expanded={menu}
              aria-haspopup="menu"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-slate-300 transition hover:border-indigo-400/40 hover:text-white"
              onClick={() => setMenu((m) => !m)}
              type="button"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <span className="inline-flex items-center gap-2 font-medium text-indigo-100">
              <Clock className="h-4 w-4" />
              {item.start} – {item.end}
            </span>
            <span className="hidden h-4 w-px bg-white/10 sm:block" />
            <span className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
              <CalendarDays className="h-4 w-4" />
              {daySummary}
            </span>
          </div>
          <TimelineMini end={endPct} start={startPct} />
          <div className="flex flex-wrap gap-2">
            {dayOrder.map((d) => (
              <span
                key={d}
                className={classNames(
                  "flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-semibold uppercase tracking-wide",
                  item.days.includes(d)
                    ? "border-transparent bg-indigo-500/30 text-indigo-100 shadow-[0_0_10px_rgba(99,102,241,0.35)]"
                    : "border-white/10 bg-white/[0.03] text-slate-500",
                )}
              >
                {d[0]}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            {item.energy && (
              <span className="inline-flex items-center gap-2 rounded-full bg-indigo-500/15 px-3 py-1 text-indigo-100">
                <FlameEmber
                  level={item.energy.toUpperCase() as FlameLevel}
                  size="sm"
                />
                <span className="capitalize">{item.energy}</span>
              </span>
            )}
            {displayLocation && (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-slate-200">
                <Sparkles className="h-3 w-3" />
                {displayLocation}
              </span>
            )}
          </div>
        </div>
      </div>
      {menu && (
        <div
          className="absolute right-6 top-16 z-20 w-44 overflow-hidden rounded-2xl border border-white/10 bg-[#050a16]/95 shadow-xl"
          role="menu"
        >
          <button
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.06]"
            onClick={() => {
              setMenu(false)
              onEdit()
            }}
            type="button"
          >
            <PencilLine className="h-4 w-4" /> Edit
          </button>
          <button
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/[0.06]"
            onClick={() => setMenu(false)}
            type="button"
          >
            <Copy className="h-4 w-4" /> Duplicate
          </button>
          <button
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-rose-300 transition hover:bg-rose-500/10"
            onClick={() => {
              setMenu(false)
              onDelete()
            }}
            type="button"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}
    </article>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={classNames(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide",
        active
          ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
          : "border-slate-500/40 bg-slate-500/10 text-slate-300",
      )}
    >
      <span
        className={classNames(
          "h-2.5 w-2.5 rounded-full",
          active
            ? "bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.6)]"
            : "bg-slate-400",
        )}
      />
      {active ? "Active" : "Paused"}
    </span>
  )
}

function TimelineMini({ start, end }: { start: number; end: number }) {
  const crossesMidnight = end < start
  const firstWidth = crossesMidnight ? 100 - start : end - start
  const secondWidth = crossesMidnight ? end : 0

  return (
    <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="absolute inset-y-0 rounded-full bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-300 shadow-[0_0_14px_rgba(59,130,246,0.45)]"
        style={{
          left: `${start}%`,
          width: `${Math.max(firstWidth, 4)}%`,
        }}
      />
      {crossesMidnight && (
        <div
          className="absolute inset-y-0 rounded-full bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-300 shadow-[0_0_14px_rgba(59,130,246,0.45)]"
          style={{
            left: "0%",
            width: `${Math.max(secondWidth, 4)}%`,
          }}
        />
      )}
    </div>
  )
}

function createDefaultWindow(): WindowItem {
  return {
    id: "",
    name: "",
    days: [],
    start: "08:00",
    end: "09:00",
    energy: "no",
    location: "ANY",
    active: true,
  }
}

function Drawer({
  initial,
  onClose,
  onSave,
  locationOptions,
  onCreateLocation,
  locationLoading,
  locationError,
}: {
  initial: WindowItem | null
  onClose: () => void
  onSave: (data: WindowItem) => void
  locationOptions: LocationContextOption[]
  onCreateLocation: (name: string) => Promise<CreateLocationResult>
  locationLoading: boolean
  locationError: string | null
}) {
  const [form, setForm] = useState<WindowItem>(
    initial ? { ...initial } : createDefaultWindow(),
  )
  const [customLocationName, setCustomLocationName] = useState("")
  const [customLocationError, setCustomLocationError] = useState<string | null>(
    null,
  )
  const [savingCustomLocation, setSavingCustomLocation] = useState(false)

  useEffect(() => {
    if (initial) {
      const normalizedLocation = normalizeLocationValue(initial.location) || "ANY"
      setForm({ ...initial, location: normalizedLocation as WindowItem["location"] })
    } else setForm(createDefaultWindow())
  }, [initial])

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

  async function handleAddCustomLocation() {
    if (!customLocationName.trim()) {
      setCustomLocationError("Enter a location name first.")
      return
    }

    setSavingCustomLocation(true)
    setCustomLocationError(null)

    try {
      const result = await onCreateLocation(customLocationName)
      if (!result.success) {
        setCustomLocationError(result.error)
        return
      }

      setCustomLocationName("")
      setForm((prev) => ({
        ...prev,
        location: result.option.value as WindowItem["location"],
      }))
    } finally {
      setSavingCustomLocation(false)
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm sm:items-center"
      role="dialog"
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#080b14]/95 shadow-[0_30px_80px_rgba(15,23,42,0.65)] max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]"
        style={{ maxHeight: "min(calc(100dvh - 2rem), calc(100vh - 2rem))" }}
      >
        <div className="flex shrink-0 items-start justify-between border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {initial ? "Edit window" : "Create window"}
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Define when you are available and how the time should feel.
            </p>
          </div>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition hover:border-white/30 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Name
            </label>
            <input
              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-0"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Days
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {dayOrder.map((d) => (
                <DayPill
                  key={d}
                  active={form.days.includes(d)}
                  label={d}
                  onClick={() => toggleDay(d)}
                />
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Start time
              </label>
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring-0"
                type="time"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                End time
              </label>
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring-0"
                type="time"
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Energy focus
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {energies.map((e) => (
                <EnergyChip
                  key={e}
                  active={form.energy === e}
                  energy={e}
                  label={e}
                  onClick={() => setForm({ ...form, energy: e })}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Location
            </label>
            <select
              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring-0"
              value={normalizeLocationValue(form.location) || "ANY"}
              onChange={(e) =>
                setForm({
                  ...form,
                  location:
                    (normalizeLocationValue(e.target.value) || "ANY") as WindowItem["location"],
                })
              }
              disabled={locationLoading}
            >
              {locationOptions.map((option) => (
                <option key={option.id} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {locationError ? (
              <p className="mt-2 text-xs text-amber-300/90">{locationError}</p>
            ) : null}
            <div className="mt-3 space-y-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-300">
                Add a new location
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="h-10 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-0"
                  placeholder="e.g. Gym or Studio"
                  value={customLocationName}
                  onChange={(e) => {
                    setCustomLocationName(e.target.value)
                    setCustomLocationError(null)
                  }}
                  type="text"
                />
                <button
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/80 px-4 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-indigo-500 disabled:opacity-60"
                  onClick={handleAddCustomLocation}
                  type="button"
                  disabled={savingCustomLocation}
                >
                  {savingCustomLocation ? "Saving..." : "Save"}
                </button>
              </div>
              {customLocationError ? (
                <p className="text-xs text-red-300">{customLocationError}</p>
              ) : null}
              <p className="text-[0.65rem] text-slate-400">
                Custom locations sync across all of your windows and habits.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Active window</p>
              <p className="text-xs text-slate-400">
                Toggle off when you want this slot hidden from scheduling.
              </p>
            </div>
            <button
              className={classNames(
                "relative h-6 w-12 rounded-full border border-white/10 transition",
                form.active ? "bg-emerald-500/70" : "bg-white/[0.08]",
              )}
              onClick={() => setForm({ ...form, active: !form.active })}
              type="button"
            >
              <span
                className={classNames(
                  "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white transition",
                  form.active ? "left-6" : "left-1",
                )}
              />
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/10 bg-white/[0.02] px-6 py-4">
          <button
            className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/30"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-sky-500 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-lg shadow-indigo-500/30 transition hover:shadow-indigo-500/50"
            onClick={() => onSave(form)}
            type="button"
          >
            <Sparkles className="h-4 w-4" /> Save window
          </button>
        </div>
      </div>
    </div>
  )
}

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
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-[#080b14]/95 p-6 text-left shadow-[0_30px_80px_rgba(15,23,42,0.6)]">
        <h3 className="text-lg font-semibold text-white">Delete window?</h3>
        <p className="mt-2 text-sm text-slate-300">
          You’re about to remove <span className="font-semibold text-white">{item.name}</span>
          {" "}({item.start} – {item.end}). This action cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-white/30"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 via-pink-500 to-orange-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-lg shadow-rose-500/30 transition hover:shadow-rose-500/50"
            onClick={onConfirm}
            type="button"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-8 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/15 text-4xl">
        🪟
      </div>
      <h3 className="mt-6 text-xl font-semibold text-white">No windows yet</h3>
      <p className="mt-2 max-w-md text-sm text-slate-300">
        Start by defining the time blocks that match your energy and availability.
      </p>
      <button
        className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-white"
        onClick={onNew}
        type="button"
      >
        <Plus className="h-4 w-4" /> Create your first window
      </button>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-6"
        >
          <div className="h-5 w-40 rounded-full bg-white/10" />
          <div className="mt-4 h-3 rounded-full bg-white/10" />
          <div className="mt-3 h-3 rounded-full bg-white/10" />
          <div className="mt-6 h-2 rounded-full bg-white/10" />
        </div>
      ))}
    </div>
  )
}

function toMins(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}
