"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Info } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import { AnalyticsDashboardSkeleton } from "@/components/AnalyticsDashboardSkeleton";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { MouseHandlerDataParam } from "recharts/types/synchronisation/types";
import type {
  AnalyticsOverviewComparison,
  AnalyticsOverviewComparisonMetric,
  AnalyticsOverviewDailyPoint,
  AnalyticsRange,
  AnalyticsResponse,
  AnalyticsHabitSummary,
  AnalyticsHabitPerformance,
  AnalyticsHabitStreakPoint,
  AnalyticsHabitWeeklyReflection,
  AnalyticsAppActivityDay,
  AnalyticsSkillCategoryContribution,
  AnalyticsSkillCategoryContributionMeta,
  AnalyticsView,
} from "@/types/analytics";

function classNames(
  ...classes: (string | boolean | null | undefined)[]
): string {
  return classes.filter(Boolean).join(" ");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeHabitSummary(summary: unknown): AnalyticsHabitSummary {
  const base: AnalyticsHabitSummary = {
    currentStreak: 0,
    longestStreak: 0,
    calendarDays: 28,
    calendarCompleted: [],
    routines: [],
    streakHistory: [],
    bestTimes: [],
    bestDays: [],
    weeklyReflections: [],
  };

  if (!summary || typeof summary !== "object") {
    return base;
  }

  const record = summary as Record<string, unknown>;

  const toNonNegativeInt = (value: unknown, fallback: number): number => {
    if (!isFiniteNumber(value)) {
      return fallback;
    }
    const rounded = Math.round(value);
    return rounded >= 0 ? rounded : fallback;
  };

  const toPositiveInt = (value: unknown, fallback: number): number => {
    if (!isFiniteNumber(value)) {
      return fallback;
    }
    const rounded = Math.round(value);
    return rounded > 0 ? rounded : fallback;
  };

  const toPerformanceList = (value: unknown): AnalyticsHabitPerformance[] => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const entry = item as Record<string, unknown>;
        const label = typeof entry.label === "string" ? entry.label : null;
        const successRate = isFiniteNumber(entry.successRate)
          ? Math.max(0, Math.min(entry.successRate, 100))
          : null;

        if (label == null || successRate == null) {
          return null;
        }

        return { label, successRate } satisfies AnalyticsHabitPerformance;
      })
      .filter((item): item is AnalyticsHabitPerformance => item !== null);
  };

  const calendarDays = toPositiveInt(record.calendarDays, base.calendarDays);

  const calendarCompleted = Array.isArray(record.calendarCompleted)
    ? record.calendarCompleted
        .map((value) => (isFiniteNumber(value) ? Math.round(value) : null))
        .filter(
          (value): value is number =>
            value != null && value >= 1 && value <= calendarDays
        )
    : base.calendarCompleted;

  const streakHistory = Array.isArray(record.streakHistory)
    ? record.streakHistory
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const point = item as Record<string, unknown>;
          const label = typeof point.label === "string" ? point.label : null;
          const value = isFiniteNumber(point.value) ? point.value : null;

          if (label == null || value == null) {
            return null;
          }

          return { label, value } satisfies AnalyticsHabitStreakPoint;
        })
        .filter((point): point is AnalyticsHabitStreakPoint => point !== null)
    : base.streakHistory;

  const weeklyReflections = Array.isArray(record.weeklyReflections)
    ? record.weeklyReflections
        .reduce<AnalyticsHabitWeeklyReflection[]>((acc, item, index) => {
          if (!item || typeof item !== "object") {
            return acc;
          }

          const reflection = item as Record<string, unknown>;
          const id =
            typeof reflection.id === "string"
              ? reflection.id
              : `reflection-${index}`;
          const weekLabel =
            typeof reflection.weekLabel === "string"
              ? reflection.weekLabel
              : `Week ${index + 1}`;
          const streak = isFiniteNumber(reflection.streak)
            ? Math.max(0, Math.round(reflection.streak))
            : 0;
          const bestDay =
            typeof reflection.bestDay === "string"
              ? reflection.bestDay
              : "N/A";
          const lesson =
            typeof reflection.lesson === "string"
              ? reflection.lesson
              : "Keep logging habits to uncover insights.";
          const pinned =
            typeof reflection.pinned === "boolean" ? reflection.pinned : false;
          const recommendation =
            typeof reflection.recommendation === "string"
              ? reflection.recommendation
              : undefined;

          acc.push({
            id,
            weekLabel,
            streak,
            bestDay,
            lesson,
            pinned,
            recommendation,
          } satisfies AnalyticsHabitWeeklyReflection);
          return acc;
        }, [])
    : base.weeklyReflections;

  return {
    currentStreak: toNonNegativeInt(record.currentStreak, base.currentStreak),
    longestStreak: toNonNegativeInt(record.longestStreak, base.longestStreak),
    calendarDays,
    calendarCompleted,
    routines: base.routines,
    streakHistory,
    bestTimes: toPerformanceList(record.bestTimes),
    bestDays: toPerformanceList(record.bestDays),
    weeklyReflections,
  };
}

const ANALYTICS_RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "1d", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
];

async function fetchAnalyticsRange(
  range: AnalyticsRange,
  signal: AbortSignal
): Promise<AnalyticsResponse> {
  const headers = new Headers();
  const supabase = getSupabaseBrowser();
  const sessionResult = supabase
    ? await supabase.auth.getSession().catch(() => null)
    : null;
  const accessToken = sessionResult?.data.session?.access_token;

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`/api/analytics?range=${range}`, {
    cache: "no-store",
    credentials: "include",
    headers,
    signal,
  });
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    console.error("Analytics API request failed", {
      status: response.status,
      statusText: response.statusText,
      error:
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error)
          : null,
    });

    if (response.status === 401) {
      throw new Error("unauthorized");
    }

    if (response.status === 403) {
      throw new Error("upgrade_required");
    }

    throw new Error("fetch_failed");
  }

  if (!isAnalyticsResponse(payload)) {
    console.error("Analytics API returned an unexpected response shape", {
      status: response.status,
      range,
      hasPayload: payload != null,
      keys:
        payload && typeof payload === "object"
          ? Object.keys(payload as Record<string, unknown>).slice(0, 12)
          : [],
    });
    throw new Error("invalid_response");
  }

  return payload;
}

function isAnalyticsResponse(payload: unknown): payload is AnalyticsResponse {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return (
    typeof record.range === "string" &&
    Array.isArray(record.kpis) &&
    Array.isArray(record.overviewDaily) &&
    record.scheduleSummary != null &&
    typeof record.scheduleSummary === "object" &&
    record.todaySummary != null &&
    typeof record.todaySummary === "object"
  );
}

export default function AnalyticsDashboard({}: {
  activeView: AnalyticsView;
  onViewChange: (view: AnalyticsView) => void;
}) {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsRefreshing, setAnalyticsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<AnalyticsRange>("30d");
  const [analyticsCache, setAnalyticsCache] = useState<
    Partial<Record<AnalyticsRange, AnalyticsResponse>>
  >({});
  const analyticsRequestIdRef = useRef(0);
  const analyticsAbortRef = useRef<AbortController | null>(null);
  const analyticsRef = useRef<AnalyticsResponse | null>(null);
  const analyticsCacheRef = useRef<
    Partial<Record<AnalyticsRange, AnalyticsResponse>>
  >({});

  useEffect(() => {
    analyticsRef.current = analytics;
  }, [analytics]);

  useEffect(() => {
    analyticsCacheRef.current = analyticsCache;
  }, [analyticsCache]);

  useEffect(() => {
    const cachedAnalytics = analyticsCacheRef.current[selectedRange] ?? null;
    const hasVisibleAnalytics = analyticsRef.current !== null;

    if (cachedAnalytics) {
      setAnalytics(cachedAnalytics);
      setError(null);
      setLoading(false);
      setAnalyticsRefreshing(false);
      return;
    }

    analyticsAbortRef.current?.abort();
    const controller = new AbortController();
    analyticsAbortRef.current = controller;
    const requestId = analyticsRequestIdRef.current + 1;
    analyticsRequestIdRef.current = requestId;

    setError(null);
    setLoading(!hasVisibleAnalytics);
    setAnalyticsRefreshing(hasVisibleAnalytics);

    const load = async () => {
      try {
        const payload = await fetchAnalyticsRange(selectedRange, controller.signal);
        if (
          controller.signal.aborted ||
          analyticsRequestIdRef.current !== requestId
        ) {
          return;
        }

        setAnalyticsCache((current) => ({ ...current, [selectedRange]: payload }));
        setAnalytics(payload);
        setError(null);
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }
        const errorMessage = err instanceof Error ? err.message : "fetch_failed";

        if (errorMessage === "upgrade_required") {
          setError("upgrade_required");
          return;
        }

        const message =
          errorMessage === "unauthorized"
            ? "Sign in to view analytics."
            : hasVisibleAnalytics
              ? "Unable to update analytics."
              : "Unable to load analytics data.";
        console.error("Failed to load analytics data", err);
        setError(message);
      } finally {
        if (analyticsRequestIdRef.current === requestId) {
          setLoading(false);
          setAnalyticsRefreshing(false);
        }
      }
    };

    void load();

    return () => {
      controller.abort();
      if (analyticsAbortRef.current === controller) {
        analyticsAbortRef.current = null;
      }
    };
  }, [selectedRange]);

  const skillCategoryContribution = analytics?.skillCategoryContribution ?? [];
  const skillCategoryContributionMeta =
    analytics?.skillCategoryContributionMeta ?? null;
  const habitSummary = normalizeHabitSummary(analytics?.habit);
  const overviewTrend = analytics?.overviewDaily ?? [];
  const hasAnalyticsData = analytics !== null;

  const longestStreak = habitSummary.longestStreak;
  const handleUpgrade = () => {
    router.push("/settings/billing");
  };
  const renderErrorState = () =>
    error === "upgrade_required" ? (
      <AnalyticsPaywallState onUpgrade={handleUpgrade} />
    ) : error ? (
      <ErrorState message={error} />
    ) : null;

  const overviewContent = (
    <div className="space-y-3 xl:space-y-4">
      <SectionCard className="rounded-[22px] border-zinc-800/90 bg-[radial-gradient(circle_at_top_left,rgba(63,63,70,0.18),transparent_34%),linear-gradient(145deg,rgba(9,9,11,0.96),rgba(24,24,27,0.88))] p-3 shadow-[0_22px_54px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-[26px] sm:p-4 lg:p-5">
        {!hasAnalyticsData && loading ? (
          <Skeleton className="h-64" />
        ) : !hasAnalyticsData && error ? (
          renderErrorState()
        ) : overviewTrend.length === 0 ? (
          <div
            className={classNames(
              "transition-opacity duration-200",
              analyticsRefreshing && "opacity-80"
            )}
          >
            <OverviewPanelStatus
              isRefreshing={analyticsRefreshing}
              message={error}
            />
            <EmptyCopy copy="No execution trend data in this range yet." />
          </div>
        ) : (
          <OverviewDiagnosticsSection
            points={overviewTrend}
            comparison={analytics?.overviewComparison}
            range={analytics?.range ?? selectedRange}
            isRefreshing={analyticsRefreshing}
            statusMessage={error}
          />
        )}
      </SectionCard>
    </div>
  );

  const executionContent = (
    <div className="space-y-4 xl:space-y-6">
      <SectionCard title="Skill Contribution">
        {loading ? (
          <Skeleton className="h-72" />
        ) : error ? (
          renderErrorState()
        ) : (
          <SkillContributionDashboard
            range={selectedRange}
            categories={skillCategoryContribution}
            meta={skillCategoryContributionMeta}
          />
        )}
      </SectionCard>
    </div>
  );

  const habitsContent = (
    <div className="space-y-4 xl:space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] xl:gap-6">
        {loading ? (
          <Skeleton className="h-44" />
        ) : error ? (
          renderErrorState()
        ) : (
          <DailyConsistencyCard points={overviewTrend} range={selectedRange} />
        )}
        <StreakTrendCard
          longestStreak={longestStreak}
          appActivityDays={analytics?.appActivity?.days ?? null}
        />
      </div>
    </div>
  );

  const analyticsContent =
    !loading && error === "upgrade_required" ? (
      <AnalyticsPaywallState onUpgrade={handleUpgrade} />
    ) : !hasAnalyticsData && loading ? (
      <AnalyticsDashboardSkeleton />
    ) : (
      <div className="space-y-7 p-3 sm:space-y-8 sm:p-4 lg:p-5">
        {overviewContent}
        {executionContent}
        {habitsContent}
      </div>
    );

  return (
    <div className="relative overflow-hidden text-[#E6E6EB]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[-35%] h-[420px] bg-[radial-gradient(circle_at_top,rgba(120,120,120,0.18),transparent_68%)] blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl space-y-4 pb-6 sm:space-y-8 sm:pb-8">
        <Header
          selectedRange={selectedRange}
          onRangeChange={setSelectedRange}
          isRefreshing={analyticsRefreshing}
        />
        <section
          aria-label="Analytics"
          className="relative overflow-hidden rounded-[20px] border border-zinc-900/80 bg-zinc-950/35 p-0.5 min-[480px]:p-1.5 sm:rounded-[26px]"
        >
          {analyticsContent}
        </section>
      </div>
    </div>
  );
}

function Header({
  selectedRange,
  onRangeChange,
  isRefreshing,
}: {
  selectedRange: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  isRefreshing: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 mb-2 -mx-4 bg-black px-4 py-1.5 sm:static sm:mx-0 sm:mb-4 sm:bg-transparent sm:px-0 sm:py-0">
      <div className="flex min-w-0 justify-end">
        <AnalyticsRangeSelector
          selectedRange={selectedRange}
          onRangeChange={onRangeChange}
          isRefreshing={isRefreshing}
        />
      </div>
    </header>
  );
}

function formatAnalyticsRangeLabel(range: AnalyticsRange) {
  return (
    ANALYTICS_RANGE_OPTIONS.find((option) => option.value === range)?.label ??
    range.toUpperCase()
  );
}

const CATEGORY_DONUT_COLORS = [
  "#c5c8ce",
  "#adb2ba",
  "#969ca6",
  "#7f8691",
  "#6b727d",
  "#575f6b",
  "#464e59",
  "#3a424d",
];

type VisibleSkillCategoryContribution =
  AnalyticsSkillCategoryContribution & {
    groupedCategories?: AnalyticsSkillCategoryContribution[];
  };

type SkillContributionSkill = AnalyticsSkillCategoryContribution["skills"][number];

type CategoryDonutSegment = {
  category: VisibleSkillCategoryContribution;
  color: string;
  endAngle: number;
  path: string;
  startAngle: number;
};

type CategoryDonutLabel = {
  anchorX: number;
  anchorY: number;
  connectorX: number;
  connectorY: number;
  elbowX: number;
  labelX: number;
  labelY: number;
  lineEndX: number;
  midAngle: number;
  preferredY: number;
  segment: CategoryDonutSegment;
  side: "left" | "right";
};

type CategoryDonutLabelSideConfig = {
  elbowX: number;
  labelX: number;
  lineEndX: number;
  maxY: number;
  minGap: number;
  minY: number;
};

const CATEGORY_DONUT_LABEL_TOP_PADDING = 38;
const CATEGORY_DONUT_LABEL_BOTTOM_PADDING = 342;
const CATEGORY_DONUT_LABEL_DESKTOP_ROW_GAP = 34;
const CATEGORY_DONUT_LABEL_MOBILE_ROW_GAP = 24;

const CATEGORY_DONUT_LABEL_CONFIG: Record<
  CategoryDonutLabel["side"],
  CategoryDonutLabelSideConfig
> = {
  left: {
    elbowX: 112,
    labelX: 106,
    lineEndX: 118,
    maxY: CATEGORY_DONUT_LABEL_BOTTOM_PADDING,
    minGap: CATEGORY_DONUT_LABEL_DESKTOP_ROW_GAP,
    minY: CATEGORY_DONUT_LABEL_TOP_PADDING,
  },
  right: {
    elbowX: 308,
    labelX: 314,
    lineEndX: 302,
    maxY: CATEGORY_DONUT_LABEL_BOTTOM_PADDING,
    minGap: CATEGORY_DONUT_LABEL_DESKTOP_ROW_GAP,
    minY: CATEGORY_DONUT_LABEL_TOP_PADDING,
  },
};

function SkillContributionDashboard({
  range,
  categories,
  meta,
}: {
  range: AnalyticsRange;
  categories: AnalyticsSkillCategoryContribution[];
  meta: AnalyticsSkillCategoryContributionMeta | null;
}) {
  const visibleCategories = useMemo(
    () => buildVisibleSkillCategories(categories),
    [categories]
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedCategoryId((current) =>
      current && visibleCategories.some((category) => category.categoryId === current)
        ? current
        : null
    );
  }, [visibleCategories]);

  const fallbackTotalXp = categories.reduce(
    (sum, category) => sum + category.xpGained,
    0
  );
  const rangeLabel = formatAnalyticsRangeLabel(range);
  const totalXp = meta?.totalXpGained ?? fallbackTotalXp;
  const xpComparison = getSkillXpComparison(meta, rangeLabel);
  const selectedCategory =
    visibleCategories.find((category) => category.categoryId === selectedCategoryId) ??
    null;
  const topCategory = getTopSkillCategory(categories);
  const topSkill = getTopSkillContribution(categories);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        <TotalXpContributionChip
          label="TOTAL XP"
          value={`${formatCompactNumber(totalXp)} XP`}
          comparison={formatCompactSkillXpComparisonLabel(xpComparison.label)}
          comparisonTone={xpComparison.tone}
        />
        <ContributionChip
          label="TOP CATEGORY"
          value={
            topCategory
              ? formatContributionIconLabel(
                  topCategory.categoryIcon ?? null,
                  topCategory.categoryName
                )
              : "None yet"
          }
        />
        <ContributionChip
          label="TOP SKILL"
          value={
            topSkill
              ? formatContributionIconLabel(
                  normalizeSkillIcon(topSkill.skillIcon ?? null),
                  topSkill.skillName
                )
              : "None yet"
          }
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[390px_minmax(0,1fr)]">
        <CategoryDonut
          categories={visibleCategories}
          selectedCategoryId={selectedCategory?.categoryId ?? null}
          totalXp={totalXp}
          rangeLabel={rangeLabel}
          onSelectCategory={setSelectedCategoryId}
        />
        <SkillCategoryDetail
          category={selectedCategory}
          categories={visibleCategories}
          totalXp={totalXp}
          rangeLabel={rangeLabel}
        />
      </div>
    </div>
  );
}

function getTopSkillCategory(
  categories: AnalyticsSkillCategoryContribution[]
): AnalyticsSkillCategoryContribution | null {
  return categories.reduce<AnalyticsSkillCategoryContribution | null>(
    (topCategory, category) =>
      topCategory === null || category.xpGained > topCategory.xpGained
        ? category
        : topCategory,
    null
  );
}

function getTopSkillContribution(
  categories: AnalyticsSkillCategoryContribution[]
): SkillContributionSkill | null {
  return categories.reduce<SkillContributionSkill | null>((topSkill, category) => {
    return category.skills.reduce<SkillContributionSkill | null>((categoryTop, skill) => {
      if (skill.xpGained <= 0) {
        return categoryTop;
      }

      return categoryTop === null || skill.xpGained > categoryTop.xpGained
        ? skill
        : categoryTop;
    }, topSkill);
  }, null);
}

function getSkillXpComparison(
  meta: AnalyticsSkillCategoryContributionMeta | null,
  rangeLabel: string
): { label: string; tone: "up" | "down" | "neutral" } {
  if (!meta) {
    return { label: "No change vs previous", tone: "neutral" };
  }

  const currentTotal = meta.totalXpGained;
  const previousTotal = meta.previousTotalXpGained;

  if (previousTotal <= 0) {
    return currentTotal > 0
      ? { label: "New activity vs previous", tone: "up" }
      : { label: "No change vs previous", tone: "neutral" };
  }

  if (currentTotal <= 0) {
    return { label: "Down 100% vs previous", tone: "down" };
  }

  const percentChange =
    meta.totalXpPercentChange ??
    ((currentTotal - previousTotal) / previousTotal) * 100;

  if (percentChange === 0) {
    return { label: "No change vs previous", tone: "neutral" };
  }

  const roundedPercent = Math.max(1, Math.round(Math.abs(percentChange)));

  return percentChange > 0
    ? {
        label: `Up ${roundedPercent}% vs previous ${rangeLabel}`,
        tone: "up",
      }
    : {
        label: `Down ${roundedPercent}% vs previous ${rangeLabel}`,
        tone: "down",
      };
}

function formatCompactSkillXpComparisonLabel(label: string) {
  if (label.startsWith("New activity")) {
    return "New";
  }

  if (label.startsWith("No change")) {
    return "Flat";
  }

  const percentMatch = /^(Up|Down)\s+(\d+%)/.exec(label);

  if (percentMatch) {
    return `${percentMatch[1] === "Up" ? "+" : "-"}${percentMatch[2]}`;
  }

  return label.replace(/\s+vs previous.*$/i, "");
}

function TotalXpContributionChip({
  label,
  value,
  comparison,
  comparisonTone,
}: {
  label: string;
  value: string;
  comparison: string;
  comparisonTone: "up" | "down" | "neutral";
}) {
  const comparisonClass =
    comparisonTone === "up"
      ? "bg-emerald-500/10 text-emerald-300/80"
      : comparisonTone === "down"
        ? "bg-amber-500/10 text-amber-300/80"
        : "bg-zinc-800/70 text-zinc-400";

  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-[#080b11] px-1.5 py-2 sm:px-3">
      <div className="truncate text-[8px] uppercase tracking-[0.08em] text-zinc-500 sm:text-[9px] sm:tracking-[0.14em]">
        {label}
      </div>
      <div className="mt-0.5 flex min-w-0 items-baseline gap-1 sm:gap-1.5">
        <div className="shrink-0 truncate text-[11px] font-semibold text-zinc-100 sm:text-sm">
          {value}
        </div>
        <div
          className={classNames(
            "min-w-0 truncate rounded-full px-1 py-0.5 text-[8px] font-medium leading-none sm:text-[10px]",
            comparisonClass
          )}
        >
          {comparison}
        </div>
      </div>
    </div>
  );
}

function ContributionChip({
  label,
  value,
  detail,
  detailTone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  detailTone?: "up" | "down" | "neutral";
}) {
  const detailClass =
    detailTone === "up"
      ? "text-emerald-300/85"
      : detailTone === "down"
        ? "text-amber-300/85"
        : "text-zinc-500";

  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-[#080b11] px-1.5 py-2 sm:px-3">
      <div className="truncate text-[8px] uppercase tracking-[0.08em] text-zinc-500 sm:text-[9px] sm:tracking-[0.14em]">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[11px] font-semibold text-zinc-100 sm:text-sm">
        {value}
      </div>
      {detail ? (
        <div
          className={classNames(
            "mt-1 text-[8px] font-medium leading-tight [overflow-wrap:anywhere] sm:text-[10px]",
            detailClass
          )}
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
}

function CategoryDonut({
  categories,
  selectedCategoryId,
  totalXp,
  rangeLabel,
  onSelectCategory,
}: {
  categories: VisibleSkillCategoryContribution[];
  selectedCategoryId: string | null;
  totalXp: number;
  rangeLabel: string;
  onSelectCategory: (categoryId: string) => void;
}) {
  const size = 420;
  const centerX = size / 2;
  const centerY = 190;
  const radius = 74;
  const strokeWidth = 20;
  const separatorWidth = strokeWidth + 2;
  const selectedCategory =
    categories.find((category) => category.categoryId === selectedCategoryId) ?? null;
  const segments = useMemo<CategoryDonutSegment[]>(() => {
    let cursor = -90;

    return categories.map((category, index) => {
      const percent = totalXp > 0 ? (category.xpGained / totalXp) * 100 : 0;
      const startAngle = cursor;
      const arcDegrees = Math.min(359.99, (percent / 100) * 360);
      const endAngle = cursor + arcDegrees;
      cursor = endAngle;

      return {
        category,
        color: CATEGORY_DONUT_COLORS[index % CATEGORY_DONUT_COLORS.length],
        endAngle,
        path: describeDonutArc(centerX, centerY, radius, startAngle, endAngle),
        startAngle,
      };
    });
  }, [categories, centerX, centerY, radius, totalXp]);
  const labels = useMemo(
    () => buildCategoryDonutLabels(segments, centerX, centerY, radius),
    [segments, centerX, centerY, radius]
  );

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#070a0f] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-3">
      <div className="relative mx-auto aspect-[420/380] max-w-[420px]">
        <svg
          viewBox={`0 0 ${size} 380`}
          className="h-full w-full overflow-visible"
          aria-label="Skill category contribution donut"
        >
          <defs>
            <filter id="category-donut-center-shadow" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow
                dx="0"
                dy="2"
                stdDeviation="3"
                floodColor="#000000"
                floodOpacity="0.34"
              />
            </filter>
            <filter id="category-donut-selected-glow" x="-35%" y="-35%" width="170%" height="170%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="2.2"
                floodColor="#d7d9dd"
                floodOpacity="0.28"
              />
            </filter>
          </defs>
          <circle
            cx={centerX}
            cy={centerY}
            r={radius}
            fill="none"
            stroke="#151922"
            strokeWidth={separatorWidth}
          />
          {segments.map((segment) => {
            const { category, color, endAngle, path, startAngle } = segment;
            const selected = category.categoryId === selectedCategoryId;
            const selectedOuterPath = selected
              ? describeDonutArc(
                  centerX,
                  centerY,
                  radius + strokeWidth / 2 + 4,
                  startAngle,
                  endAngle
                )
              : null;

            return (
              <g key={category.categoryId}>
                <path
                  d={path}
                  fill="none"
                  stroke="#070a0f"
                  strokeWidth={separatorWidth}
                  strokeLinecap="butt"
                />
                {selectedOuterPath ? (
                  <path
                    d={selectedOuterPath}
                    fill="none"
                    stroke="#f4f4f5"
                    strokeWidth={6}
                    strokeLinecap="butt"
                    opacity={0.18}
                    filter="url(#category-donut-selected-glow)"
                    pointerEvents="none"
                  />
                ) : null}
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={selected ? strokeWidth + 1 : strokeWidth}
                  strokeLinecap="butt"
                  opacity={selected || selectedCategoryId == null ? 1 : 0.48}
                  className="cursor-pointer transition-[opacity,stroke-width] duration-150 focus:outline-none"
                  onMouseEnter={() => onSelectCategory(category.categoryId)}
                  onClick={() => onSelectCategory(category.categoryId)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${category.categoryName}, ${formatPercentLabel(
                    category.percentOfTotal
                  )} of XP`}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectCategory(category.categoryId);
                    }
                  }}
                />
                {selectedOuterPath ? (
                  <path
                    d={selectedOuterPath}
                    fill="none"
                    stroke="#eef0f3"
                    strokeWidth={2.5}
                    strokeLinecap="butt"
                    opacity={0.9}
                    pointerEvents="none"
                  />
                ) : null}
              </g>
            );
          })}
          {labels.map((label) => {
            const { category } = label.segment;
            const selected = category.categoryId === selectedCategoryId;
            const name = formatCategoryDonutName(category.categoryName);
            const details = `${formatPercentLabel(
              category.percentOfTotal
            )}  +${formatCategoryDonutXpLabel(category.xpGained)}`;

            return (
              <g
                key={`label-${category.categoryId}`}
                aria-hidden="true"
                className="pointer-events-none"
              >
                <path
                  d={[
                    "M",
                    label.anchorX.toFixed(2),
                    label.anchorY.toFixed(2),
                    "L",
                    label.connectorX.toFixed(2),
                    label.connectorY.toFixed(2),
                    "L",
                    label.elbowX.toFixed(2),
                    label.labelY.toFixed(2),
                    "L",
                    label.lineEndX.toFixed(2),
                    label.labelY.toFixed(2),
                  ].join(" ")}
                  fill="none"
                  stroke={selected ? "rgba(235,236,240,0.68)" : "rgba(161,166,175,0.34)"}
                  strokeWidth={selected ? 1.15 : 0.85}
                  strokeLinecap="round"
                />
                <circle
                  cx={label.anchorX}
                  cy={label.anchorY}
                  r={1.45}
                  fill={selected ? "#e7e9ed" : "#7c838e"}
                  opacity={selected ? 0.78 : 0.46}
                />
                <text
                  x={label.labelX}
                  y={label.labelY - 4}
                  textAnchor={label.side === "right" ? "start" : "end"}
                  className={classNames(
                    "fill-current text-[9.5px] font-semibold uppercase tracking-[0.09em] min-[380px]:text-[10.5px]",
                    selected ? "text-zinc-100" : "text-zinc-400"
                  )}
                >
                  {name}
                </text>
                <text
                  x={label.labelX}
                  y={label.labelY + 10}
                  textAnchor={label.side === "right" ? "start" : "end"}
                  className={classNames(
                    "fill-current text-[9px] font-medium tabular-nums min-[380px]:text-[10px]",
                    selected ? "text-zinc-300" : "text-zinc-600"
                  )}
                >
                  {details}
                </text>
              </g>
            );
          })}
          <circle
            cx={centerX}
            cy={centerY}
            r={radius - strokeWidth / 2 - 4}
            fill="#070a0f"
            filter="url(#category-donut-center-shadow)"
          />
          <circle
            cx={centerX}
            cy={centerY}
            r={radius - strokeWidth / 2 - 2}
            fill="none"
            stroke="rgba(208,210,214,0.10)"
            strokeWidth={1}
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
          <div className="max-w-[128px]">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500 min-[380px]:text-[10px]">
              {selectedCategory ? selectedCategory.categoryName : "TOTAL XP"}
            </div>
            <div className="mt-1 truncate text-base font-semibold leading-tight text-zinc-50 min-[380px]:text-lg sm:text-xl">
              {selectedCategory
                ? `${formatCompactNumber(selectedCategory.xpGained)} XP`
                : formatCompactNumber(totalXp)}
            </div>
            <div className="mt-1 text-[10px] font-medium text-zinc-400 min-[380px]:text-xs">
              {selectedCategory
                ? `${formatPercentLabel(selectedCategory.percentOfTotal)} of total`
                : `${rangeLabel} gain`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildCategoryDonutLabels(
  segments: CategoryDonutSegment[],
  centerX: number,
  centerY: number,
  radius: number
): CategoryDonutLabel[] {
  const preferredLabelRadius = radius + 78;
  const anchorRadius = radius + 10;
  const radialBreakRadius = radius + 24;
  const leftLabels: CategoryDonutLabel[] = [];
  const rightLabels: CategoryDonutLabel[] = [];

  segments.forEach((segment) => {
    const midAngle = (segment.startAngle + segment.endAngle) / 2;
    const side: CategoryDonutLabel["side"] =
      Math.sin((midAngle * Math.PI) / 180) >= 0 ? "right" : "left";
    const config = CATEGORY_DONUT_LABEL_CONFIG[side];
    const anchor = polarToCartesian(centerX, centerY, anchorRadius, midAngle);
    const radialBreak = polarToCartesian(
      centerX,
      centerY,
      radialBreakRadius,
      midAngle
    );
    const preferred = polarToCartesian(
      centerX,
      centerY,
      preferredLabelRadius,
      midAngle
    );
    const label: CategoryDonutLabel = {
      anchorX: anchor.x,
      anchorY: anchor.y,
      connectorX: radialBreak.x,
      connectorY: radialBreak.y,
      elbowX: config.elbowX,
      labelX: config.labelX,
      labelY: preferred.y,
      lineEndX: config.lineEndX,
      midAngle,
      preferredY: preferred.y,
      segment,
      side,
    };

    if (side === "right") {
      rightLabels.push(label);
    } else {
      leftLabels.push(label);
    }
  });

  return [
    ...layoutCategoryDonutLabelSide(leftLabels, CATEGORY_DONUT_LABEL_CONFIG.left),
    ...layoutCategoryDonutLabelSide(rightLabels, CATEGORY_DONUT_LABEL_CONFIG.right),
  ];
}

function layoutCategoryDonutLabelSide(
  labels: CategoryDonutLabel[],
  config: CategoryDonutLabelSideConfig
): CategoryDonutLabel[] {
  const { maxY, minGap, minY } = config;

  if (labels.length <= 1) {
    return labels.map((label) => ({
      ...label,
      labelY: clamp(label.preferredY, minY, maxY),
    }));
  }

  const sorted = [...labels].sort((a, b) => a.preferredY - b.preferredY);
  const available = maxY - minY;
  const required = minGap * (sorted.length - 1);
  const effectiveGap =
    required > available
      ? Math.max(
          CATEGORY_DONUT_LABEL_MOBILE_ROW_GAP,
          available / (sorted.length - 1)
        )
      : minGap;
  let previousY = minY - effectiveGap;

  const placed = sorted.map((label) => {
    const labelY = clamp(
      Math.max(label.preferredY, previousY + effectiveGap),
      minY,
      maxY
    );
    previousY = labelY;
    return { ...label, labelY };
  });

  for (let index = placed.length - 2; index >= 0; index -= 1) {
    const next = placed[index + 1];
    const current = placed[index];
    if (current.labelY + effectiveGap > next.labelY) {
      placed[index] = {
        ...current,
        labelY: Math.max(minY, next.labelY - effectiveGap),
      };
    }
  }

  const preferredSpan =
    sorted[sorted.length - 1].preferredY - sorted[0].preferredY;
  const placedSpan = placed[placed.length - 1].labelY - placed[0].labelY;
  const visuallyCramped =
    sorted.length >= 3 &&
    available > required * 1.12 &&
    (preferredSpan < available * 0.48 || placedSpan < available * 0.58);

  if (!visuallyCramped) {
    return placed;
  }

  const evenGap = Math.min(48, Math.max(effectiveGap, available / (sorted.length - 1)));
  const evenSpan = evenGap * (sorted.length - 1);
  const preferredCenter =
    sorted.reduce((sum, label) => sum + label.preferredY, 0) / sorted.length;
  const startY = clamp(preferredCenter - evenSpan / 2, minY, maxY - evenSpan);

  return placed.map((label, index) => ({
    ...label,
    labelY: startY + evenGap * index,
  }));
}

function formatCategoryDonutName(name: string) {
  const compact = name.trim().replace(/\s+/g, " ");

  if (compact.length <= 15) {
    return compact;
  }

  const withoutVowels = compact
    .split(" ")
    .map((word, index) =>
      index === 0 ? word : word.replace(/[aeiou]/gi, "")
    )
    .join(" ");

  const candidate = withoutVowels.length < compact.length ? withoutVowels : compact;
  return candidate.length > 15 ? `${candidate.slice(0, 14)}.` : candidate;
}

function formatCategoryDonutXpLabel(value: number) {
  return `${formatCompactNumber(value)} XP`;
}

function SkillCategoryDetail({
  category,
  categories,
  totalXp,
  rangeLabel,
}: {
  category: VisibleSkillCategoryContribution | null;
  categories: VisibleSkillCategoryContribution[];
  totalXp: number;
  rangeLabel: string;
}) {
  if (!category) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-[#080b11] p-3">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              {rangeLabel} contribution
            </div>
            <div className="mt-1 text-base font-semibold text-zinc-50">
              Top categories
            </div>
          </div>
          <div className="text-right text-lg font-semibold text-zinc-50">
            +{formatCompactNumber(totalXp)} XP
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {categories.slice(0, 6).map((item, index) => (
            <RankedContributionRow
              key={item.categoryId}
              rank={index + 1}
              icon={item.categoryIcon ?? null}
              fallback={getSkillInitial(item.categoryName)}
              name={item.categoryName}
              xpGained={item.xpGained}
              primaryPercent={item.percentOfTotal}
              secondaryLabel="of total"
            />
          ))}
        </div>
      </div>
    );
  }

  const isOther = Boolean(category.groupedCategories?.length);
  const activeSkills = category.skills.filter((skill) => skill.isActiveInRange);
  const inactiveSkills = category.skills.filter((skill) => !skill.isActiveInRange);

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#080b11] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            Selected category
          </div>
          <div className="mt-1 truncate text-base font-semibold text-zinc-50">
            {isOther ? category.categoryName : `Skills in ${category.categoryName}`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-zinc-50">
            +{formatCompactNumber(category.xpGained)} XP
          </div>
          <div className="text-xs text-zinc-500">
            {formatPercentLabel(category.percentOfTotal)} of total
          </div>
        </div>
      </div>

      {isOther ? (
        <div className="mt-3 space-y-2">
          {category.groupedCategories?.map((grouped, index) => (
            <RankedContributionRow
              key={grouped.categoryId}
              rank={index + 1}
              icon={grouped.categoryIcon ?? null}
              fallback={getSkillInitial(grouped.categoryName)}
              name={grouped.categoryName}
              xpGained={grouped.xpGained}
              primaryPercent={grouped.percentOfTotal}
              secondaryLabel="of total"
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {activeSkills.map((skill) => (
            <SkillContributionSkillRow
              key={skill.skillId}
              icon={normalizeSkillIcon(skill.skillIcon ?? null)}
              fallback={getSkillInitial(skill.skillName)}
              name={skill.skillName}
              xpGained={skill.xpGained}
              percentOfCategory={skill.percentOfCategory}
              percentOfTotal={totalXp > 0 ? skill.percentOfTotal : 0}
              isActiveInRange={skill.isActiveInRange}
              xpPercentChange={skill.xpPercentChange}
              xpTrend={skill.xpTrend ?? []}
            />
          ))}
          {inactiveSkills.length > 0 ? (
            <div className="pt-1">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-600">
                <span className="h-px flex-1 bg-zinc-800" />
                <span>No XP this range</span>
                <span className="h-px flex-1 bg-zinc-800" />
              </div>
              <div className="space-y-2">
                {inactiveSkills.map((skill) => (
                  <SkillContributionSkillRow
                    key={skill.skillId}
                    icon={normalizeSkillIcon(skill.skillIcon ?? null)}
                    fallback={getSkillInitial(skill.skillName)}
                    name={skill.skillName}
                    xpGained={skill.xpGained}
                    percentOfCategory={skill.percentOfCategory}
                    percentOfTotal={totalXp > 0 ? skill.percentOfTotal : 0}
                    isActiveInRange={skill.isActiveInRange}
                    xpPercentChange={skill.xpPercentChange}
                    xpTrend={skill.xpTrend ?? []}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SkillContributionSkillRow({
  icon,
  fallback,
  name,
  xpGained,
  percentOfCategory,
  percentOfTotal,
  isActiveInRange,
  xpPercentChange,
  xpTrend,
}: {
  icon: string | null;
  fallback: string;
  name: string;
  xpGained: number;
  percentOfCategory: number;
  percentOfTotal: number;
  isActiveInRange: boolean;
  xpPercentChange: number | null;
  xpTrend: Array<{ label: string; xp: number }>;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/55 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <SkillIconBadge icon={icon} fallback={fallback} name={name} />
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-zinc-100">{name}</div>
          {isActiveInRange ? (
            <div className="text-[10px] text-zinc-500">
              {formatPercentLabel(percentOfCategory)} of category ·{" "}
              {formatPercentLabel(percentOfTotal)} total
            </div>
          ) : (
            <div className="text-[10px] text-zinc-600">0 XP this range</div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 text-right">
        <SkillXpSparkline
          trend={xpTrend}
          isActiveInRange={isActiveInRange}
          isFlatTrend={xpPercentChange === 0}
          isNegativeTrend={xpPercentChange != null && xpPercentChange < 0}
        />
        <div
          className={classNames(
            "text-xs font-semibold",
            isActiveInRange ? "text-emerald-300" : "text-zinc-500"
          )}
        >
          +{formatCompactNumber(xpGained)} XP
        </div>
      </div>
    </div>
  );
}

function SkillXpSparkline({
  trend,
  isActiveInRange,
  isFlatTrend,
  isNegativeTrend,
}: {
  trend: Array<{ label: string; xp: number }>;
  isActiveInRange: boolean;
  isFlatTrend: boolean;
  isNegativeTrend: boolean;
}) {
  const width = 24;
  const height = 12;
  const paddingX = 1.5;
  const paddingY = 2;
  let runningTotal = 0;
  const cumulativeXpValues = trend.map((point) => {
    const bucketXp = Number.isFinite(point.xp) && point.xp > 0 ? point.xp : 0;
    runningTotal += bucketXp;
    return runningTotal;
  });
  const maxValue = Math.max(0, ...cumulativeXpValues);
  const points = cumulativeXpValues.length > 0 ? cumulativeXpValues : [0, 0];
  const drawableWidth = width - paddingX * 2;
  const drawableHeight = height - paddingY * 2;
  const path = points
    .map((value, index) => {
      const x =
        paddingX +
        (points.length === 1 ? drawableWidth / 2 : (index / (points.length - 1)) * drawableWidth);
      const y =
        maxValue > 0
          ? paddingY + drawableHeight - (value / maxValue) * drawableHeight
          : height / 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-3 w-6 shrink-0 grow-0 basis-auto"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={path}
        fill="none"
        stroke={
          isNegativeTrend
            ? "rgba(248,113,113,0.62)"
            : isFlatTrend
              ? "rgba(113,113,122,0.45)"
            : isActiveInRange
              ? "rgba(110,231,183,0.55)"
              : "rgba(113,113,122,0.45)"
        }
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1"
      />
    </svg>
  );
}

function RankedContributionRow({
  rank,
  icon,
  fallback,
  name,
  xpGained,
  primaryPercent,
  secondaryLabel,
}: {
  rank: number;
  icon: string | null;
  fallback: string;
  name: string;
  xpGained: number;
  primaryPercent: number;
  secondaryLabel: string;
}) {
  return (
    <div className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/55 px-2 py-1.5">
      <div className="text-center text-[10px] font-semibold text-zinc-500">
        {rank}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <SkillIconBadge icon={icon} fallback={fallback} name={name} />
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-zinc-100">{name}</div>
          <div className="text-[10px] text-zinc-500">
            {formatPercentLabel(primaryPercent)} {secondaryLabel}
          </div>
        </div>
      </div>
      <div className="text-right text-xs font-semibold text-zinc-100">
        +{formatCompactNumber(xpGained)}
      </div>
    </div>
  );
}

function buildVisibleSkillCategories(
  categories: AnalyticsSkillCategoryContribution[]
): VisibleSkillCategoryContribution[] {
  if (categories.length <= 8) {
    return categories;
  }

  const visible = categories.slice(0, 8);
  const groupedCategories = categories.slice(8);
  const otherXp = groupedCategories.reduce(
    (sum, category) => sum + category.xpGained,
    0
  );
  const totalXp = categories.reduce((sum, category) => sum + category.xpGained, 0);

  if (otherXp <= 0 || totalXp <= 0) {
    return visible;
  }

  return [
    ...visible,
    {
      categoryId: "__other_skill_categories",
      categoryName: "Other",
      categoryIcon: null,
      xpGained: otherXp,
      percentOfTotal: clampPercent((otherXp / totalXp) * 100),
      skills: [],
      groupedCategories,
    },
  ];
}

function describeDonutArc(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M",
    start.x.toFixed(3),
    start.y.toFixed(3),
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x.toFixed(3),
    end.y.toFixed(3),
  ].join(" ");
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function formatPercentLabel(value: number) {
  const clamped = clampPercent(value);
  return `${clamped}%`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function SkillIconBadge({
  icon,
  fallback,
  name,
}: {
  icon: string | null;
  fallback: string;
  name: string;
}) {
  const isImageIcon = icon != null && /^https?:\/\//i.test(icon);

  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-900 text-lg font-semibold leading-none text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:h-8 sm:w-8"
      aria-label={`${name} icon`}
    >
      {isImageIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={icon}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center leading-none" aria-hidden>
          {icon ?? fallback}
        </span>
      )}
    </div>
  );
}

function normalizeSkillIcon(icon: string | null) {
  const trimmed = icon?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function formatContributionIconLabel(icon: string | null, label: string) {
  const normalizedIcon = normalizeSkillIcon(icon);

  if (!normalizedIcon || /^https?:\/\//i.test(normalizedIcon)) {
    return label;
  }

  return `${normalizedIcon} ${label}`;
}

function getSkillInitial(name: string) {
  const trimmed = name.trim();
  return (trimmed[0] ?? "?").toUpperCase();
}

function OverviewDiagnosticsSection({
  points,
  comparison,
  range,
  isRefreshing,
  statusMessage,
}: {
  points: AnalyticsOverviewDailyPoint[];
  comparison?: AnalyticsOverviewComparison;
  range: AnalyticsRange;
  isRefreshing: boolean;
  statusMessage: string | null;
}) {
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const totalXp = points.reduce((sum, point) => sum + point.xpGained, 0);
  const completedEvents = points.reduce(
    (sum, point) => sum + point.completedEvents,
    0
  );
  const totalCompletedMinutes = points.reduce(
    (sum, point) => sum + point.completedMinutes,
    0
  );
  const totalUsableWindowMinutes = points.reduce(
    (sum, point) => sum + point.usableWindowMinutes,
    0
  );
  const rangeEfficiencyRate =
    totalUsableWindowMinutes > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round((totalCompletedMinutes / totalUsableWindowMinutes) * 100)
          )
        )
      : 0;
  const peakXp = points.reduce(
    (max, point) => Math.max(max, point.xpGained),
    0
  );
  const completedProjects = points.reduce(
    (sum, point) => sum + point.completedProjects,
    0
  );
  const completedGoals = points.reduce(
    (sum, point) => sum + (point.completedGoals ?? 0),
    0
  );
  const completedHabits = points.reduce(
    (sum, point) => sum + point.completedHabits,
    0
  );
  const completedTasks = points.reduce(
    (sum, point) => sum + point.completedTasks,
    0
  );
  const averageLabel = range === "1d" ? "Avg/hour" : "Avg/day";
  const averageValue =
    points.length > 0 ? totalXp / points.length : 0;
  const selectedPoint =
    selectedPointIndex == null ? null : points[selectedPointIndex] ?? null;
  const selectedPointWorkMinutes = selectedPoint
    ? getSelectedPointAverageMinutes(selectedPoint)
    : 0;
  const selectedPointAveragePerHour =
    selectedPoint && selectedPointWorkMinutes > 0
      ? selectedPoint.xpGained / (selectedPointWorkMinutes / 60)
      : 0;

  useEffect(() => {
    setSelectedPointIndex(null);
  }, [points, range]);

  return (
    <div
      className={classNames(
        "space-y-3 transition-opacity duration-200 sm:space-y-4",
        isRefreshing && "opacity-80"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400/85">
            PROGRESS TREND
          </div>
          {selectedPoint || isRefreshing || statusMessage ? (
            <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-1.5">
              {selectedPoint ? (
                <div className="inline-flex items-center rounded-full border border-emerald-400/15 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/80">
                  Selected {formatTrendActiveLabel(selectedPoint.date, range)}
                </div>
              ) : null}
              <OverviewPanelStatus
                isRefreshing={isRefreshing}
                message={statusMessage}
                compact
              />
            </div>
          ) : null}
        </div>
        <div className="shrink-0 pt-0.5 text-right text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          vs previous cycle
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
        <OverviewKpiRailItem
          label="XP"
          value={formatCompactNumber(selectedPoint?.xpGained ?? totalXp)}
          comparison={selectedPoint ? undefined : comparison?.xp}
          sublabel={
            selectedPoint
              ? formatTrendActiveLabel(selectedPoint.date, range)
              : formatRangeSummary(range, points.length)
          }
          tone="green"
        />
        <OverviewKpiRailItem
          label={selectedPoint ? "AVG/HR" : averageLabel.toUpperCase()}
          value={formatAverageXp(
            selectedPoint ? selectedPointAveragePerHour : averageValue
          )}
          comparison={selectedPoint ? undefined : comparison?.avgPerDay}
          sublabel={
            selectedPoint
              ? `${selectedPointWorkMinutes}m tracked`
              : `Peak ${formatCompactNumber(peakXp)} XP`
          }
        />
        <OverviewKpiRailItem
          label="COMPLETED"
          value={formatCompactNumber(
            selectedPoint?.completedEvents ?? completedEvents
          )}
          comparison={selectedPoint ? undefined : comparison?.completed}
          sublabel={
            selectedPoint
              ? `${formatCompactNumber(selectedPoint.completedGoals ?? 0)}G · ${formatCompactNumber(selectedPoint.completedProjects)}P · ${formatCompactNumber(selectedPoint.completedTasks)}T · ${formatCompactNumber(selectedPoint.completedHabits)}H`
              : `${formatCompactNumber(completedGoals)}G · ${formatCompactNumber(completedProjects)}P · ${formatCompactNumber(completedTasks)}T · ${formatCompactNumber(completedHabits)}H`
          }
          tone="green"
        />
        <OverviewKpiRailItem
          label="EFFICIENCY"
          value={`${selectedPoint?.efficiencyRate ?? rangeEfficiencyRate}%`}
          comparison={selectedPoint ? undefined : comparison?.efficiency}
          sublabel={
            selectedPoint
              ? `${selectedPoint.completedMinutes}m / ${selectedPoint.usableWindowMinutes}m`
              : `${totalCompletedMinutes}m / ${totalUsableWindowMinutes}m`
          }
          tone="green"
        />
      </div>

      <div className="overflow-hidden rounded-[18px] border border-zinc-700/50 bg-[linear-gradient(145deg,rgba(9,9,11,0.9),rgba(24,24,27,0.72))] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:rounded-[20px]">
        <OverviewLineChart
          points={points}
          range={range}
          onSelectedPointIndexChange={setSelectedPointIndex}
        />
      </div>
    </div>
  );
}

function OverviewPanelStatus({
  isRefreshing,
  message,
  compact = false,
}: {
  isRefreshing: boolean;
  message: string | null;
  compact?: boolean;
}) {
  const toneClass = message
    ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";

  if (!isRefreshing && !message) {
    return null;
  }

  return (
    <div className={compact ? "h-5" : "mt-1.5 h-5"}>
      {isRefreshing ? (
        <div
          className={classNames(
            "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]",
            toneClass
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {message ?? "Updating"}
        </div>
      ) : message ? (
        <div
          className={classNames(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]",
            toneClass
          )}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}

function AnalyticsRangeSelector({
  selectedRange,
  onRangeChange,
  isRefreshing,
}: {
  selectedRange: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  isRefreshing: boolean;
}) {
  return (
    <div className="min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <div className="inline-flex min-w-max items-center gap-px rounded-full border border-zinc-800 bg-zinc-950/80 p-px">
        {ANALYTICS_RANGE_OPTIONS.map((option) => {
          const isActive = option.value === selectedRange;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onRangeChange(option.value)}
              aria-pressed={isActive}
              aria-busy={isRefreshing && isActive}
              className={classNames(
                "h-[17px] rounded-full px-1.5 text-[9px] font-semibold uppercase leading-none tracking-[0.08em] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500/70 sm:h-5 sm:px-2 sm:text-[9px] sm:tracking-[0.1em]",
                isActive
                  ? "border border-zinc-700 bg-zinc-800/80 text-zinc-100"
                  : "border border-transparent text-zinc-500 hover:text-zinc-300",
                isRefreshing && isActive && "opacity-70"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OverviewKpiRailItem({
  label,
  value,
  comparison,
  sublabel,
  tone = "default",
}: {
  label: string;
  value: string;
  comparison?: AnalyticsOverviewComparisonMetric;
  sublabel: string;
  tone?: "default" | "green" | "amber";
}) {
  const accentClass =
    tone === "green"
      ? "before:bg-emerald-400/80"
      : tone === "amber"
        ? "before:bg-amber-400/75"
        : "before:bg-emerald-400/70";
  const valueClass =
    tone === "green"
      ? "text-zinc-50"
      : tone === "amber"
        ? "text-amber-100"
        : "text-zinc-50";

  return (
    <div
      className={classNames(
        "relative min-h-[92px] min-w-0 overflow-hidden rounded-2xl border border-zinc-700/45 bg-[linear-gradient(135deg,rgba(39,39,42,0.68),rgba(9,9,11,0.78))] p-2.5 pl-3 shadow-[0_14px_28px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.035)] before:absolute before:inset-y-3.5 before:left-0 before:w-0.5 before:rounded-full sm:min-h-[100px] sm:p-3.5 sm:pl-4",
        accentClass
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:text-[11px]">
          {label}
        </div>
        <div className="mt-1.5 flex min-w-0 items-baseline gap-1.5">
          <div
            className={classNames(
              "min-w-0 truncate text-[2rem] font-semibold leading-none tabular-nums sm:text-[2.35rem]",
              valueClass
            )}
          >
            {value}
          </div>
          {comparison ? (
            <div
              className={classNames(
                "shrink-0 text-[11px] font-semibold leading-none tabular-nums sm:text-xs",
                getOverviewComparisonClass(comparison.trend)
              )}
            >
              {formatOverviewComparisonDelta(comparison)}
            </div>
          ) : null}
        </div>
        <div className="mt-1.5 truncate text-[11px] leading-tight text-zinc-500 sm:text-xs">
          {sublabel}
        </div>
      </div>
    </div>
  );
}

function formatOverviewComparisonDelta(
  comparison: AnalyticsOverviewComparisonMetric
) {
  if (comparison.trend === "new") {
    return "new";
  }

  if (comparison.trend === "flat" || comparison.percentChange === 0) {
    return "flat";
  }

  if (comparison.percentChange == null) {
    return "flat";
  }

  return comparison.percentChange > 0
    ? `+${comparison.percentChange}%`
    : `${comparison.percentChange}%`;
}

function getOverviewComparisonClass(
  trend: AnalyticsOverviewComparisonMetric["trend"]
) {
  if (trend === "up" || trend === "new") {
    return "text-emerald-300/80";
  }

  if (trend === "down") {
    return "text-rose-300/80";
  }

  return "text-zinc-500";
}

const overviewXpChartConfig = {
  totalXp: {
    label: "Total XP",
    color: "#86efac",
  },
} satisfies ChartConfig;

type OverviewXpChartDataPoint = {
  date: string;
  totalXp: number;
  point: AnalyticsOverviewDailyPoint;
};

type OverviewXpTooltipContentProps = {
  active?: boolean;
  payload?: ReadonlyArray<{
    payload?: OverviewXpChartDataPoint;
  }>;
  label?: string | number;
  range: AnalyticsRange;
};

function stopOverviewChartGesturePropagation(
  event: ReactPointerEvent<HTMLElement> | ReactTouchEvent<HTMLElement>
) {
  event.stopPropagation();
}

function OverviewLineChart({
  points,
  range,
  onSelectedPointIndexChange,
}: {
  points: AnalyticsOverviewDailyPoint[];
  range: AnalyticsRange;
  onSelectedPointIndexChange: (index: number | null) => void;
}) {
  const totalXp =
    points.length > 0
      ? Math.max(0, Number(points[points.length - 1]?.totalXp ?? 0))
      : 0;
  const totalXpValues = useMemo(
    () => points.map((point) => Math.max(0, Number(point.totalXp ?? 0))),
    [points]
  );
  const rawMaxValue = Math.max(0, ...totalXpValues);
  const isEmpty = rawMaxValue <= 0;
  const chartData = useMemo<OverviewXpChartDataPoint[]>(
    () =>
      points.map((point, index) => ({
        date: point.date,
        totalXp: totalXpValues[index] ?? 0,
        point,
      })),
    [points, totalXpValues]
  );
  const yAxisScale = useMemo(() => {
    return getTotalXpYAxisScale(totalXpValues);
  }, [totalXpValues]);
  const xAxisTicks = useMemo(
    () =>
      getTrendAxisLabelIndices(range, points)
        .map((index) => points[index]?.date)
        .filter((date): date is string => Boolean(date)),
    [points, range]
  );
  const handleChartPointer = (state: MouseHandlerDataParam) => {
    if (typeof state.activeTooltipIndex !== "number") {
      return;
    }

    onSelectedPointIndexChange(
      Math.max(0, Math.min(state.activeTooltipIndex, points.length - 1))
    );
  };

  return (
    <div className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-white/[0.06] px-3 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <div className="text-sm font-medium text-zinc-100 sm:text-base">
              Total XP over time
            </div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              {formatAnalyticsRangeLabel(range)} · {formatCompactNumber(totalXp)} XP
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] font-medium text-zinc-500 sm:text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-1.5 w-4 rounded-full shadow-[0_0_12px_rgba(255,255,255,0.12)]"
                style={{ backgroundColor: overviewXpChartConfig.totalXp.color }}
              />
              {overviewXpChartConfig.totalXp.label}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2.5 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
        <div
          className="relative touch-none"
          data-no-tab-swipe
          data-overview-area-chart
          onPointerDown={stopOverviewChartGesturePropagation}
          onPointerMove={stopOverviewChartGesturePropagation}
          onPointerUp={stopOverviewChartGesturePropagation}
          onPointerCancel={stopOverviewChartGesturePropagation}
          onTouchStart={stopOverviewChartGesturePropagation}
          onTouchMove={stopOverviewChartGesturePropagation}
          onTouchEnd={stopOverviewChartGesturePropagation}
          onTouchCancel={stopOverviewChartGesturePropagation}
        >
          <ChartContainer
            config={overviewXpChartConfig}
            className="h-[214px] w-full aspect-auto sm:h-[230px] md:h-[238px]"
          >
            <AreaChart
              accessibilityLayer
              data={chartData}
              margin={{ top: 20, right: 12, left: 8, bottom: 10 }}
              onMouseMove={handleChartPointer}
              onClick={handleChartPointer}
              onMouseLeave={() => onSelectedPointIndexChange(null)}
            >
              <defs>
                <linearGradient id="fillTotalXp" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-totalXp)"
                    stopOpacity={0.34}
                  />
                  <stop
                    offset="56%"
                    stopColor="var(--color-totalXp)"
                    stopOpacity={0.11}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-totalXp)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="rgba(212,212,216,0.105)"
                strokeDasharray="1 10"
              />
              <XAxis
                dataKey="date"
                ticks={xAxisTicks}
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                minTickGap={18}
                tickFormatter={(value: string) =>
                  formatTrendXAxisLabel(value, range)
                }
              />
              <YAxis
                width={46}
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                tick={{ fontSize: 10 }}
                ticks={yAxisScale.ticks}
                tickFormatter={(value: number) => formatXpAxisTick(value)}
                domain={yAxisScale.domain}
              />
              <ChartTooltip
                cursor={{
                  stroke: "rgba(244,244,245,0.16)",
                  strokeDasharray: "1 8",
                }}
                content={(props) => (
                  <OverviewXpTooltipContent
                    {...props}
                    range={range}
                  />
                )}
              />
              <Area
                dataKey="totalXp"
                name="Total XP"
                type="natural"
                fill="url(#fillTotalXp)"
                stroke="var(--color-totalXp)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: "#bbf7d0",
                  stroke: "#09090b",
                  strokeWidth: 1.5,
                }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>

          <div className="pointer-events-none absolute inset-0 select-none">
            {isEmpty ? (
              <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[13px] font-medium text-zinc-400/90">
                No XP recorded in this range
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1.5 border-t border-white/[0.06] pt-2 text-[11px] text-zinc-500 sm:text-xs">
          <Info className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
          <span>All times shown in your local time zone</span>
        </div>
      </div>
    </div>
  );
}

function OverviewXpTooltipContent({
  active,
  payload,
  label,
  range,
}: OverviewXpTooltipContentProps) {
  const point = payload?.[0]?.payload as OverviewXpChartDataPoint | undefined;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="min-w-[220px] rounded-xl border border-zinc-700/70 bg-zinc-950/95 p-3 text-xs text-zinc-100 shadow-[0_18px_42px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md">
      <ChartTooltipContent
        active={active}
        payload={payload as ComponentProps<typeof ChartTooltipContent>["payload"]}
        label={label}
        labelFormatter={() => formatTrendActiveLabel(point.date, range)}
        formatter={(value) => (
          <div className="flex flex-1 items-center justify-between gap-3 leading-none">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-zinc-400">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[--color-totalXp]" />
              <span className="truncate">Total XP</span>
            </span>
            <span className="font-medium tabular-nums text-zinc-100">
              {formatCompactNumber(Number(value))} XP
            </span>
          </div>
        )}
        className="border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
      />
      <div className="mt-3 border-t border-white/[0.06] pt-2 text-[11px] leading-relaxed text-zinc-500">
        {formatCompactNumber(point.point.completedEvents)} completed ·{" "}
        {formatCompactNumber(point.point.completedProjects)} projects ·{" "}
        {formatCompactNumber(point.point.completedTasks)} tasks ·{" "}
        {formatCompactNumber(point.point.completedHabits)} habits
      </div>
    </div>
  );
}

function getTotalXpYAxisScale(values: number[]): {
  domain: [number, number];
  ticks: number[];
} {
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) {
    return { domain: [0, 1], ticks: [0, 1] };
  }

  const minValue = Math.min(...finiteValues);
  const maxValue = Math.max(...finiteValues);
  const visibleRange = maxValue - minValue;
  const padding =
    visibleRange > 0
      ? Math.max(1, visibleRange * 0.06)
      : Math.max(10, Math.min(100, Math.max(1, Math.abs(maxValue) * 0.01)));
  const rawMin = Math.max(0, minValue - padding);
  const rawMax = Math.max(1, maxValue + padding);
  const step = getTotalXpYAxisStep(rawMax - rawMin);
  const lowerTick = Math.max(0, Math.floor(rawMin / step) * step);
  const upperTick = Math.max(step, Math.ceil(rawMax / step) * step);
  const ticks: number[] = [];

  for (let tick = lowerTick; tick <= upperTick; tick += step) {
    ticks.push(Math.round(tick));
  }

  if (ticks.length < 2) {
    ticks.push(ticks[0] + step);
  }

  return {
    domain: [ticks[0], ticks[ticks.length - 1]],
    ticks,
  };
}

function getTotalXpYAxisStep(visibleRange: number) {
  if (!Number.isFinite(visibleRange) || visibleRange <= 0) {
    return 10;
  }

  const preferredSteps = [
    10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
  ];
  const targetTickCount = 8;

  for (const step of preferredSteps) {
    const tickCount = Math.ceil(visibleRange / step) + 1;

    if (tickCount <= targetTickCount) {
      return step;
    }
  }

  const rawStep = visibleRange / (targetTickCount - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }

  if (normalized <= 2.5) {
    return 2.5 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
}

function formatXpAxisTick(value: number) {
  const rounded = Math.round(value);

  if (Math.abs(rounded) >= 1000) {
    const compact = rounded / 1000;
    const maximumFractionDigits =
      rounded % 1000 === 0 ? 0 : rounded % 100 === 0 ? 1 : rounded % 10 === 0 ? 2 : 3;

    return `${new Intl.NumberFormat(undefined, {
      maximumFractionDigits,
    }).format(compact)}K`;
  }

  return formatCompactNumber(rounded);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatAverageXp(value: number) {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(rounded);
}

function formatRangeSummary(range: AnalyticsRange, pointsCount: number) {
  if (range === "1d") {
    return `${pointsCount} hourly points`;
  }

  return `${pointsCount} daily points`;
}

function getSelectedPointAverageMinutes(point: AnalyticsOverviewDailyPoint) {
  if (point.completedMinutes > 0) {
    return point.completedMinutes;
  }

  // The daily payload has completed minutes but no separate active timer total;
  // use the existing usable window as the safest local fallback without changing queries.
  return point.usableWindowMinutes;
}

function getTrendAxisLabelIndices(
  range: AnalyticsRange,
  points: AnalyticsOverviewDailyPoint[]
) {
  const length = points.length;
  if (length <= 1) {
    return [0];
  }

  if (range === "1d") {
    return [0, 6, 12, 18, length - 1].filter(
      (value, index, values) => value < length && values.indexOf(value) === index
    );
  }

  if (range === "7d") {
    return points.map((_, index) => index);
  }

  if (range === "30d") {
    return [0, 7, 14, 21, length - 1].filter(
      (value, index, values) => value < length && values.indexOf(value) === index
    );
  }

  const monthMarkers = points.reduce<number[]>((acc, point, index) => {
    const current = parseTrendDate(point.date, range);
    const previous = index > 0 ? parseTrendDate(points[index - 1].date, range) : null;
    if (
      index === 0 ||
      !previous ||
      current.getUTCMonth() !== previous.getUTCMonth()
    ) {
      acc.push(index);
    }
    return acc;
  }, []);

  const candidates = [...monthMarkers, length - 1];
  return candidates.filter(
    (value, index, values) => value < length && values.indexOf(value) === index
  );
}

function formatTrendXAxisLabel(value: string | null, range: AnalyticsRange) {
  if (!value) {
    return "";
  }

  const date = parseTrendDate(value, range);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  if (range === "1d") {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTrendActiveLabel(value: string | null, range: AnalyticsRange) {
  if (!value) {
    return "No data";
  }

  const date = parseTrendDate(value, range);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  if (range === "1d") {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function parseTrendDate(value: string, range: AnalyticsRange) {
  return range === "1d" ? new Date(value) : new Date(`${value}T12:00:00Z`);
}

function StreakTrendCard({
  longestStreak,
  appActivityDays = null,
}: {
  longestStreak: number;
  appActivityDays?: AnalyticsAppActivityDay[] | null;
}) {
  const hasAppActivityHistory = Array.isArray(appActivityDays);
  const normalizedActivityDays = hasAppActivityHistory
    ? Array.from({ length: 7 }, (_, index) => {
        const day = appActivityDays[index];
        return {
          date: day?.date ?? null,
          active: Boolean(day?.active),
        };
      })
    : Array.from({ length: 7 }, () => ({ date: null, active: false }));
  let activeOrdinal = 0;
  const emberSlots = Array.from({ length: 7 }, (_, index) => {
    const day = normalizedActivityDays[index];
    const isActive = day?.active ?? false;
    const ordinal = isActive ? ++activeOrdinal : 0;
    return {
      index,
      date: day?.date ?? null,
      isActive,
      level: getAppActivityEmberLevel(ordinal),
    };
  });
  const activeDays = emberSlots.filter((slot) => slot.isActive).length;
  const appActivityStatus = hasAppActivityHistory
    ? `${activeDays}/7 active`
    : "Not tracked yet";

  return (
    <div className="rounded-xl border border-zinc-800 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.08),transparent_38%),linear-gradient(145deg,rgba(9,9,11,0.94),rgba(24,24,27,0.82))] p-2.5 text-xs text-zinc-400 shadow-[0_18px_40px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-2xl sm:p-4 sm:text-sm">
      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
        Streak momentum
      </div>

      <div className="mt-3 rounded-xl border border-white/[0.07] bg-zinc-950/55 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium text-zinc-400">
            Longest habit streak
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200/20 bg-[radial-gradient(circle_at_40%_30%,rgba(253,224,71,0.18),rgba(245,158,11,0.08)_48%,rgba(24,24,27,0.72)_78%)] py-0.5 pl-1.5 pr-2 text-sm font-semibold tabular-nums text-zinc-100 shadow-[0_0_18px_rgba(245,158,11,0.16),inset_0_1px_0_rgba(255,255,255,0.08)]">
            <FlameEmber
              level="ULTRA"
              size="xs"
              className="shrink-0 overflow-visible opacity-95 [&_svg]:overflow-visible"
            />
            <span>{longestStreak} days</span>
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 px-0.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          App activity streak
        </span>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          {appActivityStatus}
        </span>
      </div>

      <div
        className="mt-1.5 grid grid-cols-7 gap-1.5 rounded-xl border border-white/[0.06] bg-black/25 p-1.5 sm:gap-2 sm:p-2"
        aria-label={
          hasAppActivityHistory
            ? `${activeDays} of 7 app activity days active`
            : "Seven-day app activity history is not tracked yet"
        }
      >
        {emberSlots.map((slot) => (
          <span
            key={slot.index}
            className={classNames(
              "flex h-9 min-w-0 items-center justify-center rounded-lg border sm:h-10",
              slot.isActive
                ? "streak-ember-slot--active border-amber-300/20 bg-[radial-gradient(circle_at_50%_70%,rgba(251,191,36,0.18),rgba(180,83,9,0.08)_44%,rgba(24,24,27,0.48)_76%)] shadow-[0_0_18px_rgba(245,158,11,0.12),inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "border-white/[0.06] bg-zinc-950/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]",
              slot.index === 6 &&
                slot.level === "EXTREME" &&
                "border-amber-200/35 bg-[radial-gradient(circle_at_50%_72%,rgba(253,224,71,0.24),rgba(245,158,11,0.14)_44%,rgba(24,24,27,0.5)_78%)] shadow-[0_0_24px_rgba(245,158,11,0.22),inset_0_1px_0_rgba(255,255,255,0.12)]"
            )}
            title={
              hasAppActivityHistory
                ? `${formatAppActivityDateLabel(slot.date)}: ${slot.isActive ? "active" : "inactive"}`
                : `Day ${slot.index + 1}: app activity history unavailable`
            }
          >
            {slot.isActive ? (
              <FlameEmber
                level={slot.level}
                size="sm"
                className={classNames(
                  "shrink-0 overflow-visible opacity-95 [&_svg]:overflow-visible",
                  slot.level === "EXTREME" && "scale-110"
                )}
              />
            ) : (
              <span
                className="h-3 w-2.5 rounded-full border border-zinc-700/70 bg-zinc-900/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                aria-hidden="true"
              />
            )}
          </span>
        ))}
      </div>
      <style jsx global>{`
        .streak-ember-slot--active {
          animation: streakEmberSlotGlow 3.8s ease-in-out infinite;
        }

        @keyframes streakEmberSlotGlow {
          0%,
          100% {
            box-shadow:
              0 0 16px rgba(245, 158, 11, 0.1),
              inset 0 1px 0 rgba(255, 255, 255, 0.08);
          }
          50% {
            box-shadow:
              0 0 22px rgba(245, 158, 11, 0.16),
              inset 0 1px 0 rgba(255, 255, 255, 0.1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .streak-ember-slot--active {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

function getAppActivityEmberLevel(activeOrdinal: number): FlameLevel {
  if (activeOrdinal <= 0) {
    return "NO";
  }

  if (activeOrdinal >= 7) {
    return "EXTREME";
  }

  if (activeOrdinal >= 5) {
    return "HIGH";
  }

  if (activeOrdinal >= 3) {
    return "MEDIUM";
  }

  return "LOW";
}

function formatAppActivityDateLabel(date: string | null) {
  if (!date) {
    return "App activity day";
  }

  return date;
}

function SectionCard({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const hasHeader = Boolean(title || description || action);

  return (
    <section
      id={id}
      className={classNames(
        "rounded-xl border border-zinc-800 bg-zinc-950/85 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur sm:rounded-2xl sm:p-5",
        className
      )}
    >
      {hasHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-2.5 sm:gap-3">
          <div>
            {title ? (
              <h2 className="text-sm font-semibold text-white sm:text-lg">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
                {description}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={hasHeader ? "mt-3 sm:mt-4" : undefined}>{children}</div>
    </section>
  );
}

function EmptyCopy({ copy }: { copy: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 px-3 py-4 text-center text-xs text-zinc-500 sm:px-4 sm:py-5 sm:text-sm">
      {copy}
    </div>
  );
}

function AnalyticsPaywallState({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-700/80 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.12),transparent_34%),linear-gradient(145deg,rgba(9,9,11,0.98),rgba(24,24,27,0.94))] p-4 shadow-[0_24px_64px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-6">
      <div className="max-w-2xl">
        <div className="mb-3 inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-amber-100">
          CREATOR Pro
        </div>
        <h3 className="text-lg font-semibold text-white sm:text-2xl">
          Unlock CREATOR Pro analytics
        </h3>
        <p className="mt-2 text-sm leading-6 text-zinc-300 sm:text-base">
          Analytics are part of CREATOR Pro. Upgrade to see your execution
          trends, schedule performance, and skill progress in one place.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            onClick={onUpgrade}
            className="border border-amber-200/30 bg-amber-200 text-zinc-950 shadow-[0_10px_28px_rgba(250,204,21,0.18)] hover:bg-amber-100"
          >
            Upgrade to CREATOR Pro
          </Button>
          <p className="text-xs text-zinc-500">
            Built for users who want the full system view.
          </p>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-4 text-xs text-red-200 sm:rounded-2xl sm:px-4 sm:py-5 sm:text-sm">
      {message}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={classNames(
        "animate-pulse rounded-2xl bg-zinc-900/80",
        className
      )}
    />
  );
}
function DailyConsistencyCard({
  points,
  range,
}: {
  points: AnalyticsOverviewDailyPoint[];
  range: AnalyticsRange;
}) {
  const cells = useMemo(
    () => buildDailyConsistencyCells(points, range),
    [points, range]
  );
  const maxCompletedEvents = cells.reduce(
    (max, cell) => Math.max(max, cell.completedEvents),
    0
  );
  const activeDays = cells.filter((cell) => cell.completedEvents > 0).length;
  const columns = getDailyConsistencyColumnCount(range, cells.length);

  return (
    <div className="rounded-2xl border border-emerald-400/10 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_32%),linear-gradient(145deg,rgba(9,9,11,0.96),rgba(24,24,27,0.88))] p-3.5 shadow-[0_18px_44px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Daily consistency
          </div>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          {activeDays}/{cells.length} DAYS ACTIVE
        </div>
      </div>

      <div className="mt-4 pb-1">
        <div
          className="grid w-full gap-1.5 sm:gap-2"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
          aria-label="Completed Events daily consistency heatmap"
        >
          {cells.map((cell, index) => (
            <span
              key={cell.dateKey}
              className={classNames(
                "block aspect-square w-full rounded-[5px] border transition",
                cell.completedEvents > 0
                  ? "daily-consistency-cell--active border-emerald-300/25 shadow-[0_4px_14px_rgba(34,197,94,0.18)]"
                  : "border-zinc-800/80 bg-zinc-950/80"
              )}
              style={getDailyConsistencyCellStyle(
                cell,
                index,
                maxCompletedEvents
              )}
              title={`${cell.label} · ${cell.completedEvents} completed Event${
                cell.completedEvents === 1 ? "" : "s"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-zinc-500">
        <span>No Events</span>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3].map((step) => (
            <span
              key={step}
              className={classNames(
                "block h-3.5 w-3.5 rounded-[4px] border",
                step === 0
                  ? "border-zinc-800 bg-zinc-950/80"
                  : "border-emerald-300/20"
              )}
              style={
                step === 0
                  ? undefined
                  : {
                      backgroundColor: getDailyConsistencyColor(
                        step,
                        3
                      ),
                    }
              }
            />
          ))}
        </div>
        <span>More</span>
      </div>
      <style jsx global>{`
        @keyframes dailyConsistencyOrganicWobble {
          0% {
            transform: translate3d(0, 0, 0) rotate(0deg);
          }
          18% {
            transform: translate3d(0.16px, -0.28px, 0) rotate(0.32deg) scale(1.012);
          }
          37% {
            transform: translate3d(-0.22px, 0.18px, 0) rotate(-0.26deg) scale(0.998);
          }
          53% {
            transform: translate3d(0.1px, 0.12px, 0) rotate(0.18deg) scale(1.006);
          }
          71% {
            transform: translate3d(-0.08px, -0.12px, 0) rotate(-0.12deg) scale(1.002);
          }
          100% {
            transform: translate3d(0, 0, 0) rotate(0deg);
          }
        }

        .daily-consistency-cell--active {
          animation: dailyConsistencyOrganicWobble 3.6s cubic-bezier(0.38, 0, 0.22, 1) infinite;
          animation-delay: var(--daily-consistency-delay, 0ms);
          transform-origin: center;
          will-change: transform;
        }

        @media (prefers-reduced-motion: reduce) {
          .daily-consistency-cell--active {
            animation: none;
            transform: none;
            will-change: auto;
          }
        }
      `}</style>
    </div>
  );
}

function buildDailyConsistencyCells(
  points: AnalyticsOverviewDailyPoint[],
  range: AnalyticsRange
) {
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const grouped = new Map<
    string,
    { date: Date; completedEvents: number }
  >();

  for (const point of points) {
    const date = parseTrendDate(point.date, range);
    const dateKey = getDailyConsistencyDateKey(date);
    const existing = grouped.get(dateKey);
    if (existing) {
      existing.completedEvents += Math.max(
        0,
        Math.round(point.completedEvents ?? 0)
      );
    } else {
      grouped.set(dateKey, {
        date,
        completedEvents: Math.max(0, Math.round(point.completedEvents ?? 0)),
      });
    }
  }

  const sortedCells = Array.from(grouped.entries())
    .sort(([, a], [, b]) => a.date.getTime() - b.date.getTime())
    .map(([dateKey, cell]) => ({
      dateKey,
      label: dateFormatter.format(cell.date),
      completedEvents: cell.completedEvents,
    }));
  const rangeDays = getDailyConsistencyRangeDays(range);

  if (rangeDays == null) {
    return sortedCells;
  }

  const endDate =
    sortedCells.length > 0
      ? parseTrendDate(sortedCells[sortedCells.length - 1].dateKey, range)
      : new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - (rangeDays - 1));

  return Array.from({ length: rangeDays }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const dateKey = getDailyConsistencyDateKey(date);
    const existing = grouped.get(dateKey);

    return {
      dateKey,
      label: dateFormatter.format(date),
      completedEvents: existing?.completedEvents ?? 0,
    };
  });
}

function getDailyConsistencyColor(value: number, maxValue: number) {
  if (value <= 0) {
    return "#09090b";
  }
  const ratio = maxValue <= 1 ? 1 : Math.min(value / maxValue, 1);
  const alpha = 0.32 + ratio * 0.56;
  return `rgba(34,197,94,${alpha.toFixed(2)})`;
}

function getDailyConsistencyRangeDays(range: AnalyticsRange) {
  if (range === "7d") {
    return 7;
  }

  if (range === "30d") {
    return 30;
  }

  if (range === "90d") {
    return 90;
  }

  return null;
}

function getDailyConsistencyColumnCount(range: AnalyticsRange, cellCount: number) {
  if (range === "30d" || range === "90d") {
    return 10;
  }

  if (range === "7d") {
    return 7;
  }

  return Math.max(1, Math.min(cellCount, 10));
}

function getDailyConsistencyDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getDailyConsistencyCellStyle(
  cell: { completedEvents: number; dateKey: string },
  index: number,
  maxCompletedEvents: number
): CSSProperties | undefined {
  if (cell.completedEvents <= 0) {
    return undefined;
  }

  return {
    "--daily-consistency-delay": `${((index % 10) * 120 + (index % 4) * 55) * -1}ms`,
    backgroundColor: getDailyConsistencyColor(
      cell.completedEvents,
      maxCompletedEvents
    ),
  } as CSSProperties;
}
