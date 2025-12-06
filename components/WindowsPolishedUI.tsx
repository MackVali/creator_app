"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  CalendarDays,
  ChevronDown,
  Flame as FlameIcon,
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

export type WindowKind = "DEFAULT" | "BREAK" | "PRACTICE"
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

export interface WindowItem {
  id: string
  name: string
  days: Day[]
  start: string
  end: string
  energy?: Energy
  location?: string
  active?: boolean
  kind?: WindowKind
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
    kind: "DEFAULT",
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
    kind: "PRACTICE",
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
    kind: "BREAK",
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
  const [expandedDays, setExpandedDays] = useState<Set<Day>>(new Set())

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
  const dayBuckets = useMemo(() => {
    const base = dayOrder.reduce((acc, day) => {
      acc[day] = []
      return acc
    }, {} as Record<Day, WindowItem[]>)
    filtered.forEach((window) => {
      window.days.forEach((day) => {
        if (base[day]) {
          base[day].push(window)
        }
      })
    })
    dayOrder.forEach((day) => {
      base[day] = base[day].sort((a, b) => a.start.localeCompare(b.start))
    })
    return dayOrder.map((day) => ({
      day,
      windows: base[day],
    }))
  }, [filtered])

  function resetFilters() {
    setStatusFilter("all")
    setSelectedDays(new Set())
    setEnergyFilter("all")
    setSearch("")
    setSort("start")
  }
  
  function toggleDayExpansion(day: Day) {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  const [editing, setEditing] = useState<WindowItem | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<WindowItem | null>(null)

  async function handleSave(data: WindowItem) {
    try {
      const normalizedLocation = (data.location ?? "ANY").toUpperCase()
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
          onNew={() => {
            setEditing(null)
            setDrawerOpen(true)
          }}
          hasActiveFilters={hasActiveFilters}
          onOpenFilters={() => setFiltersOpen(true)}
          total={stats.total}
        />
        <section className="relative space-y-4">
          {loading && <LoadingSkeleton />}
          {!loading && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {dayBuckets.map(({ day, windows: dayWindows }) => (
                <DayCard
                  key={day}
                  day={day}
                  expanded={expandedDays.has(day)}
                  windows={dayWindows}
                  onToggle={() => toggleDayExpansion(day)}
                  onEdit={(window) => {
                    setEditing(window)
                    setDrawerOpen(true)
                  }}
                  onDelete={(window) => setConfirmDelete(window)}
                  onRequestAdd={() => {
                    setEditing(null)
                    setDrawerOpen(true)
                  }}
                  resolveLocationLabel={resolveLocationLabel}
                />
              ))}
            </div>
          )}
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
    : "Adaptive"
  const focusRatio = total > 0 ? Math.round((active / Math.max(total, 1)) * 100) : 0
  const statCards = [
    {
      icon: <SunMedium className="h-4 w-4" />,
      label: "Active windows",
      value: `${active}`,
    },
    {
      icon: <CalendarDays className="h-4 w-4" />,
      label: "Planned total",
      value: `${total}`,
    },
    {
      icon: <Sparkles className="h-4 w-4" />,
      label: "Focus ratio",
      value: `${focusRatio}%`,
    },
    {
      icon: <FlameIcon className="h-4 w-4" />,
      label: "Peak energy",
      value: energyLabel,
    },
  ]
  return (
    <header className="relative overflow-hidden rounded-[32px] border border-emerald-400/25 bg-gradient-to-br from-[#041d13] via-[#03110c] to-[#010404] px-8 py-10 text-white shadow-[0_40px_120px_rgba(1,15,9,0.7)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.35),_transparent_60%)]" />
      <div className="pointer-events-none absolute -left-12 bottom-0 h-56 w-56 rounded-full bg-emerald-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-14 top-4 h-64 w-64 rounded-full bg-teal-400/25 blur-[140px]" />
      <div className="relative flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.4em] text-emerald-100/80">
            <Sparkles className="h-3 w-3" /> Window studio
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full items-center gap-3">
              <button
                className="inline-flex h-10 flex-1 min-w-[140px] items-center justify-center gap-2 rounded-full px-4 text-xs font-semibold uppercase tracking-wide text-white shadow-[0_20px_45px_rgba(16,185,129,0.4)] transition hover:scale-[1.01] appearance-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                style={{
                  backgroundImage: "linear-gradient(120deg, #10b981, #22c55e, #65f389)",
                  border: "none",
                }}
                onClick={onNew}
                type="button"
              >
                <Plus className="h-4 w-4" />
                New window
              </button>
              <FiltersLauncher
                className="flex-1 min-w-[140px] shrink-0 !border-white/20 !bg-white/5 !text-white !whitespace-nowrap"
                hasFilters={hasActiveFilters}
                onOpen={onOpenFilters}
              />
            </div>
            <div className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs uppercase tracking-[0.35em] text-emerald-100/80">
              {active} active · {total} total
            </div>
          </div>
        </div>
        <div className="w-full max-w-md rounded-[28px] border border-white/15 bg-black/20 p-6 backdrop-blur">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.35em] text-emerald-100/70">
            <span>Weekly snapshot</span>
            <span className="text-white/80">Live</span>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {statCards.map((card) => (
              <StatCard key={card.label} icon={card.icon} label={card.label} value={card.value} />
            ))}
          </div>
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
    <div className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent px-2 py-2 text-left shadow-[0_15px_30px_rgba(1,11,7,0.35)]">
      <span className="flex h-5 w-5 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-100">
        {icon}
      </span>
      <div>
        <p className="text-[0.45rem] font-semibold uppercase tracking-[0.3em] text-emerald-50/70">
          {label}
        </p>
        <p className="text-sm font-semibold text-white/90 leading-tight">{value}</p>
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
        "inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70",
        hasFilters
          ? "bg-emerald-500/80 text-white shadow-[0_0_20px_rgba(16,185,129,0.45)] hover:bg-emerald-500"
          : "border border-white/15 bg-white/10 text-white/80 hover:border-white/30 hover:text-white",
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

interface DayCardProps {
  day: Day
  windows: WindowItem[]
  expanded: boolean
  onToggle: () => void
  onEdit: (window: WindowItem) => void
  onDelete: (window: WindowItem) => void
  onRequestAdd: () => void
  resolveLocationLabel: (value?: string | null) => string | null
}

function DayCard({
  day,
  windows,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onRequestAdd,
  resolveLocationLabel,
}: DayCardProps) {
  const windowCount = windows.length
  const activeCount = windows.filter((window) => window.active).length
  const timeRange = windowCount
    ? `${windows[0].start} – ${windows[windows.length - 1].end}`
    : null
  const summary = windowCount
    ? `${windowCount} window${windowCount > 1 ? "s" : ""}`
    : "No windows yet"
  const helper = windowCount
    ? `${activeCount} active${timeRange ? ` • ${timeRange}` : ""}`
    : "Click below to add a window for this day."

  return (
    <article className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.05] p-5 shadow-[0_25px_60px_rgba(15,23,42,0.35)] backdrop-blur">
      <button
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left transition hover:border-indigo-400/40 hover:bg-white/[0.06]"
        onClick={onToggle}
        type="button"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-indigo-200/80">
            {day}
          </p>
          <p className="mt-2 text-lg font-semibold text-white">{summary}</p>
          <p className="text-xs text-slate-400">{helper}</p>
        </div>
        <div className="flex items-center gap-3">
          {windowCount > 0 && (
            <span className="rounded-full bg-white/[0.08] px-3 py-1 text-xs font-semibold text-slate-100">
              {activeCount} active
            </span>
          )}
          <ChevronDown
            className={classNames(
              "h-5 w-5 text-slate-300 transition",
              expanded && "rotate-180",
            )}
          />
        </div>
      </button>
      {expanded && (
        <div className="mt-4 border-t border-white/5 pt-4">
          {windowCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-4 text-sm text-slate-300">
              <p>No windows scheduled for {day}.</p>
              <button
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-100 transition hover:border-indigo-400/40 hover:bg-indigo-500/10"
                onClick={onRequestAdd}
                type="button"
              >
                <Plus className="h-3.5 w-3.5" /> Create window
              </button>
            </div>
          ) : (
            <div className="-mx-1 overflow-x-auto pb-2">
              <div className="flex gap-3 px-1 py-1 text-left [scrollbar-width:thin] md:[scrollbar-width:auto]">
                {windows.map((window) => (
                  <DayWindowEntry
                    key={`${window.id}-${day}`}
                    window={window}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    resolveLocationLabel={resolveLocationLabel}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function DayWindowEntry({
  window,
  onEdit,
  onDelete,
  resolveLocationLabel,
}: {
  window: WindowItem
  onEdit: (window: WindowItem) => void
  onDelete: (window: WindowItem) => void
  resolveLocationLabel: (value?: string | null) => string | null
}) {
  const displayLocation = resolveLocationLabel(window.location)
  const startPct = (toMins(window.start) / 1440) * 100
  const endPct = (toMins(window.end) / 1440) * 100
  const kind = window.kind ?? "DEFAULT"

  return (
    <div className="flex min-w-[210px] max-w-[240px] shrink-0 flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-3 shadow-[0_12px_30px_rgba(15,23,42,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white leading-tight">{window.name}</p>
          <p className="text-[0.7rem] text-slate-400">
            {window.start} – {window.end}
          </p>
        </div>
        <StatusBadge active={Boolean(window.active)} />
      </div>
      <div className="mt-2">
        <TimelineMini end={endPct} start={startPct} />
      </div>
      <div className="mt-2 space-y-1 text-[0.7rem] text-slate-300">
        <div className="flex items-center gap-1 text-[0.65rem] uppercase tracking-wide text-slate-400">
          <span className="rounded-full bg-white/[0.05] px-2 py-0.5">{window.days.length === 7 ? "All week" : window.days.join(" · ")}</span>
        </div>
        {kind !== "DEFAULT" && (
          <div
            className={classNames(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide",
              kind === "BREAK"
                ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                : "border-sky-400/40 bg-sky-500/10 text-sky-100",
            )}
          >
            {kind === "BREAK" ? (
              <SunMedium className="h-3 w-3" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            <span>{kind === "BREAK" ? "Break" : "Practice"}</span>
          </div>
        )}
        {window.energy && (
          <div className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-indigo-100">
            <FlameEmber level={window.energy.toUpperCase() as FlameLevel} size="xs" />
            <span className="capitalize">{window.energy}</span>
          </div>
        )}
        {displayLocation && (
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-slate-200">
            <Sparkles className="h-3 w-3" />
            <span className="truncate text-[0.7rem]">{displayLocation}</span>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-slate-200 transition hover:border-indigo-400/40 hover:text-white"
          onClick={() => onEdit(window)}
          type="button"
          aria-label={`Edit ${window.name}`}
        >
          <PencilLine className="h-4 w-4" />
        </button>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-slate-200 transition hover:border-rose-400/40 hover:text-white"
          onClick={() => onDelete(window)}
          type="button"
          aria-label={`Delete ${window.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide",
        active
          ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
          : "border-slate-500/40 bg-slate-500/10 text-slate-300",
      )}
    >
      <span
        className={classNames(
          "h-2 w-2 rounded-full",
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
    kind: "DEFAULT",
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
  const windowKindOptions: Array<{ value: WindowKind; label: string; description: string }> = [
    { value: "DEFAULT", label: "Default", description: "Use this window for normal scheduling." },
    { value: "BREAK", label: "Break", description: "Reserve time so projects and habits skip this period." },
    { value: "PRACTICE", label: "Practice", description: "Highlight a focused practice block without pausing scheduling." },
  ]

  useEffect(() => {
    if (initial) setForm({ ...initial })
    else setForm(createDefaultWindow())
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
              value={(form.location ?? "ANY").toUpperCase()}
              onChange={(e) =>
                setForm({ ...form, location: e.target.value.toUpperCase() })
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
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Window type
            </label>
            <select
              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring-0"
              value={form.kind ?? "DEFAULT"}
              onChange={(e) =>
                setForm({ ...form, kind: e.target.value.toUpperCase() as WindowKind })
              }
            >
              {windowKindOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-400">
              {
                windowKindOptions.find((option) => option.value === (form.kind ?? "DEFAULT"))
                  ?.description
              }
            </p>
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

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {dayOrder.map((day) => (
        <div
          key={day}
          className="animate-pulse overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-6"
        >
          <div className="h-4 w-16 rounded-full bg-white/10" />
          <div className="mt-4 h-3 w-32 rounded-full bg-white/10" />
          <div className="mt-2 h-3 w-24 rounded-full bg-white/10" />
          <div className="mt-6 h-20 rounded-2xl border border-dashed border-white/10 bg-white/5" />
        </div>
      ))}
    </div>
  )
}

function toMins(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}
