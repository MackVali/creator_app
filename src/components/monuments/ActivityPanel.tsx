"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { CheckCircle2, Pin, TriangleAlert } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  segmentedToggleActiveClassName,
  segmentedToggleButtonClassName,
  segmentedToggleContainerClassName,
  segmentedToggleInactiveClassName,
} from "@/components/ui/segmented-toggle-styles";
import { cn } from "@/lib/utils";
import {
  type MonumentLevelHistoryPoint,
  type MonumentActivityNote,
  type MonumentXpSkillMixPoint,
  useMonumentActivity,
} from "@/lib/hooks/useMonumentActivity";

interface ActivityPanelProps {
  monumentId: string;
}

type MonumentGraphTab = "level" | "xp";

function formatRelativeTime(date: Date) {
  const divisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { amount: 60, unit: "second" },
    { amount: 60, unit: "minute" },
    { amount: 24, unit: "hour" },
    { amount: 7, unit: "day" },
    { amount: 4.34524, unit: "week" },
    { amount: 12, unit: "month" },
    { amount: Number.POSITIVE_INFINITY, unit: "year" },
  ];

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  let duration = (date.getTime() - Date.now()) / 1000;

  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return formatter.format(0, "second");
}

function formatTimeLabel(date: Date) {
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  return `${time} • ${formatRelativeTime(date)}`;
}

function formatChartDateLabel(date: string, compact = false) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: compact ? undefined : "numeric",
  }).format(parsed);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(value);
}

function getLevelTickValues(minLevel: number, maxLevel: number) {
  if (minLevel === maxLevel) {
    return [minLevel];
  }

  const span = Math.max(1, maxLevel - minLevel);
  const middle = Math.round(minLevel + span / 2);
  const ticks = [minLevel, middle, maxLevel];

  return [...new Set(ticks)].sort((a, b) => a - b);
}

function getXpTickValues(minXp: number, maxXp: number) {
  if (minXp === maxXp) {
    return [minXp];
  }

  const span = Math.max(1, maxXp - minXp);
  const ticks = [minXp, minXp + span / 2, maxXp];

  return [...new Set(ticks.map((tick) => Math.round(tick)))].sort(
    (a, b) => a - b
  );
}

function getLevelBucketKey(date: Date, bucket: "day" | "week" | "month") {
  const year = date.getFullYear();
  const month = date.getMonth();

  if (bucket === "month") {
    return `${year}-${month}`;
  }

  if (bucket === "week") {
    const weekStart = new Date(year, month, date.getDate());
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    return `${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`;
  }

  return `${year}-${month}-${date.getDate()}`;
}

function getDisplayLevelPoints(levelHistory: MonumentLevelHistoryPoint[]) {
  if (levelHistory.length <= 18) {
    return levelHistory;
  }

  const times = levelHistory
    .map((point) => Date.parse(point.date))
    .filter((time) => !Number.isNaN(time));
  const minTime = times.length > 0 ? Math.min(...times) : 0;
  const maxTime = times.length > 0 ? Math.max(...times) : minTime;
  const durationInDays = (maxTime - minTime) / (1000 * 60 * 60 * 24);
  const bucket: "day" | "week" | "month" =
    durationInDays > 365 ? "month" : durationInDays > 70 ? "week" : "day";
  const buckets = new Map<string, MonumentLevelHistoryPoint>();

  for (const point of levelHistory) {
    const date = new Date(point.date);
    if (Number.isNaN(date.getTime())) continue;
    buckets.set(getLevelBucketKey(date, bucket), point);
  }

  return Array.from(buckets.values());
}

function getLevelXAxisLabels(points: MonumentLevelHistoryPoint[]) {
  if (points.length === 0) return [];
  if (points.length === 1) return [0];

  const candidates = new Set<number>([
    0,
    points.length - 1,
  ]);

  if (points.length > 5) {
    candidates.add(Math.floor((points.length - 1) / 2));
  }

  return [...candidates].sort((a, b) => a - b);
}

function MonumentLevelCurveChart({
  levelHistory,
}: {
  levelHistory: MonumentLevelHistoryPoint[];
}) {
  const gradientId = useId().replace(/:/g, "");
  const width = 720;
  const height = 240;
  const padding = { top: 18, right: 18, bottom: 42, left: 44 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const displayPoints = getDisplayLevelPoints(levelHistory);
  const hasPoints = displayPoints.length > 0;
  const levels = hasPoints ? displayPoints.map((point) => point.level) : [1];
  const rawMinLevel = Math.min(...levels);
  const rawMaxLevel = Math.max(...levels);
  const minLevel = Math.max(1, rawMinLevel);
  const maxLevel = rawMaxLevel === minLevel ? minLevel + 1 : rawMaxLevel;
  const yTicks = getLevelTickValues(minLevel, maxLevel);
  const timeValues = displayPoints.map((point) => Date.parse(point.date));
  const minTime = timeValues.length > 0 ? Math.min(...timeValues) : 0;
  const maxTime = timeValues.length > 0 ? Math.max(...timeValues) : minTime;
  const timeSpan = Math.max(1, maxTime - minTime);

  const getX = (point: MonumentLevelHistoryPoint) => {
    if (displayPoints.length === 1) return padding.left + chartWidth / 2;

    const time = Date.parse(point.date);
    if (Number.isNaN(time)) return padding.left;

    return padding.left + ((time - minTime) / timeSpan) * chartWidth;
  };

  const svgPoints = displayPoints.map((point) => {
    const x = getX(point);
    const y =
      padding.top +
      chartHeight -
      ((point.level - minLevel) / Math.max(1, maxLevel - minLevel)) *
        chartHeight;

    return { x, y, point };
  });

  const linePath = svgPoints
    .map(
      ({ x, y }, index) =>
        `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`
    )
    .join(" ");

  const areaPath = hasPoints
    ? [
        `M${padding.left},${padding.top + chartHeight}`,
        ...svgPoints.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`),
        `L${padding.left + chartWidth},${padding.top + chartHeight}`,
        "Z",
      ].join(" ")
    : "";

  const xLabels = getLevelXAxisLabels(displayPoints).map((index) => ({
    x: getX(displayPoints[index]),
    label: formatChartDateLabel(displayPoints[index]?.date ?? "", true),
  }));

  return (
    <div className="mt-4 min-w-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-[210px] w-full opacity-95 transition-opacity sm:h-[220px]"
        role="img"
        aria-label="Monument level over time"
      >
        <defs>
          <linearGradient id={`${gradientId}-area`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(244,244,245,0.16)" />
            <stop offset="100%" stopColor="rgba(244,244,245,0.01)" />
          </linearGradient>
          <linearGradient id={`${gradientId}-line`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#71717a" />
            <stop offset="100%" stopColor="#d4d4d8" />
          </linearGradient>
        </defs>

        {yTicks.map((value) => {
          const y =
            padding.top +
            chartHeight -
            ((value - minLevel) / Math.max(1, maxLevel - minLevel)) *
              chartHeight;

          return (
            <g key={`level-grid-${value}`}>
              <line
                x1={padding.left}
                x2={padding.left + chartWidth}
                y1={y}
                y2={y}
                stroke="rgba(82,82,91,0.3)"
                strokeDasharray="3 6"
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fill="rgba(161,161,170,0.72)"
                fontSize="11"
              >
                Lv {value}
              </text>
            </g>
          );
        })}

        <line
          x1={padding.left}
          x2={padding.left + chartWidth}
          y1={padding.top + chartHeight}
          y2={padding.top + chartHeight}
          stroke="rgba(82,82,91,0.34)"
          strokeDasharray="3 6"
        />

        {hasPoints ? (
          <>
            <path d={areaPath} fill={`url(#${gradientId}-area)`} />
            <path
              d={linePath}
              fill="none"
              stroke={`url(#${gradientId}-line)`}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
            />
            {svgPoints.length > 1 ? (
              <circle
                cx={svgPoints[svgPoints.length - 1]?.x}
                cy={svgPoints[svgPoints.length - 1]?.y}
                r={3.4}
                fill="#e4e4e7"
                stroke="rgba(5,6,8,0.95)"
                strokeWidth={1.2}
              />
            ) : null}
          </>
        ) : (
          <g>
            <line
              x1={padding.left}
              x2={padding.left + chartWidth}
              y1={padding.top + chartHeight * 0.55}
              y2={padding.top + chartHeight * 0.55}
              stroke="rgba(63,63,70,0.55)"
              strokeDasharray="4 6"
            />
            <text
              x={padding.left + chartWidth / 2}
              y={padding.top + chartHeight * 0.47}
              textAnchor="middle"
              fill="rgba(212,212,216,0.86)"
              fontSize="13"
            >
              No monument XP yet.
            </text>
          </g>
        )}

        {xLabels.map((label, index) => (
          <text
            key={`${label.label}-${index}`}
            x={label.x}
            y={height - 16}
            textAnchor="middle"
            fill="rgba(161,161,170,0.82)"
            fontSize="11"
          >
            {label.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function MonumentXpTrendChart({
  levelHistory,
}: {
  levelHistory: MonumentLevelHistoryPoint[];
}) {
  const gradientId = useId().replace(/:/g, "");
  const width = 720;
  const height = 240;
  const padding = { top: 18, right: 18, bottom: 42, left: 56 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const displayPoints = getDisplayLevelPoints(levelHistory);
  const hasPoints = displayPoints.length > 0;
  const xpValues = hasPoints ? displayPoints.map((point) => point.totalXp) : [0];
  const rawMinXp = Math.min(...xpValues);
  const rawMaxXp = Math.max(...xpValues);
  const minXp = Math.max(0, rawMinXp);
  const maxXp = rawMaxXp === minXp ? minXp + 1 : rawMaxXp;
  const yTicks = getXpTickValues(minXp, maxXp);
  const timeValues = displayPoints.map((point) => Date.parse(point.date));
  const minTime = timeValues.length > 0 ? Math.min(...timeValues) : 0;
  const maxTime = timeValues.length > 0 ? Math.max(...timeValues) : minTime;
  const timeSpan = Math.max(1, maxTime - minTime);

  const getX = (point: MonumentLevelHistoryPoint) => {
    if (displayPoints.length === 1) return padding.left + chartWidth / 2;

    const time = Date.parse(point.date);
    if (Number.isNaN(time)) return padding.left;

    return padding.left + ((time - minTime) / timeSpan) * chartWidth;
  };

  const svgPoints = displayPoints.map((point) => {
    const x = getX(point);
    const y =
      padding.top +
      chartHeight -
      ((point.totalXp - minXp) / Math.max(1, maxXp - minXp)) * chartHeight;

    return { x, y, point };
  });

  const linePath = svgPoints
    .map(
      ({ x, y }, index) =>
        `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`
    )
    .join(" ");

  const areaPath = hasPoints
    ? [
        `M${padding.left},${padding.top + chartHeight}`,
        ...svgPoints.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`),
        `L${padding.left + chartWidth},${padding.top + chartHeight}`,
        "Z",
      ].join(" ")
    : "";

  const xLabels = getLevelXAxisLabels(displayPoints).map((index) => ({
    x: getX(displayPoints[index]),
    label: formatChartDateLabel(displayPoints[index]?.date ?? "", true),
  }));

  return (
    <div className="mt-4 min-w-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-[210px] w-full opacity-95 transition-opacity sm:h-[220px]"
        role="img"
        aria-label="Monument total XP over time"
      >
        <defs>
          <linearGradient id={`${gradientId}-area`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(244,244,245,0.16)" />
            <stop offset="100%" stopColor="rgba(244,244,245,0.01)" />
          </linearGradient>
          <linearGradient id={`${gradientId}-line`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#71717a" />
            <stop offset="100%" stopColor="#d4d4d8" />
          </linearGradient>
        </defs>

        {yTicks.map((value) => {
          const y =
            padding.top +
            chartHeight -
            ((value - minXp) / Math.max(1, maxXp - minXp)) * chartHeight;

          return (
            <g key={`xp-grid-${value}`}>
              <line
                x1={padding.left}
                x2={padding.left + chartWidth}
                y1={y}
                y2={y}
                stroke="rgba(82,82,91,0.3)"
                strokeDasharray="3 6"
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fill="rgba(161,161,170,0.72)"
                fontSize="11"
              >
                {formatCompactNumber(value)}
              </text>
            </g>
          );
        })}

        <line
          x1={padding.left}
          x2={padding.left + chartWidth}
          y1={padding.top + chartHeight}
          y2={padding.top + chartHeight}
          stroke="rgba(82,82,91,0.34)"
          strokeDasharray="3 6"
        />

        {hasPoints ? (
          <>
            <path d={areaPath} fill={`url(#${gradientId}-area)`} />
            <path
              d={linePath}
              fill="none"
              stroke={`url(#${gradientId}-line)`}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
            />
            {svgPoints.length > 1 ? (
              <circle
                cx={svgPoints[svgPoints.length - 1]?.x}
                cy={svgPoints[svgPoints.length - 1]?.y}
                r={3.4}
                fill="#e4e4e7"
                stroke="rgba(5,6,8,0.95)"
                strokeWidth={1.2}
              />
            ) : null}
          </>
        ) : (
          <g>
            <line
              x1={padding.left}
              x2={padding.left + chartWidth}
              y1={padding.top + chartHeight * 0.55}
              y2={padding.top + chartHeight * 0.55}
              stroke="rgba(63,63,70,0.55)"
              strokeDasharray="4 6"
            />
            <text
              x={padding.left + chartWidth / 2}
              y={padding.top + chartHeight * 0.47}
              textAnchor="middle"
              fill="rgba(212,212,216,0.86)"
              fontSize="13"
            >
              No monument XP yet.
            </text>
          </g>
        )}

        {xLabels.map((label, index) => (
          <text
            key={`${label.label}-${index}`}
            x={label.x}
            y={height - 16}
            textAnchor="middle"
            fill="rgba(161,161,170,0.82)"
            fontSize="11"
          >
            {label.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

type DisplaySkillMixPoint =
  | MonumentXpSkillMixPoint
  | {
      skillId: "other";
      skillName: "Other";
      skillIcon: null;
      xp: number;
      count: number;
      percent: number;
    };

const MONUMENT_XP_MIX_DONUT_COLORS = [
  "#c5c8ce",
  "#adb2ba",
  "#969ca6",
  "#7f8691",
  "#6b727d",
  "#575f6b",
  "#464e59",
  "#3a424d",
];

type MonumentXpMixDonutSegment = {
  color: string;
  endAngle: number;
  item: DisplaySkillMixPoint;
  path: string;
  startAngle: number;
};

type MonumentXpMixDonutLabel = {
  anchorX: number;
  anchorY: number;
  connectorX: number;
  connectorY: number;
  elbowX: number;
  labelX: number;
  labelY: number;
  lineEndX: number;
  preferredY: number;
  segment: MonumentXpMixDonutSegment;
  side: "left" | "right";
};

type MonumentXpMixDonutLabelSideConfig = {
  elbowX: number;
  labelX: number;
  lineEndX: number;
  maxY: number;
  minGap: number;
  minY: number;
};

const MONUMENT_XP_MIX_LABEL_TOP_PADDING = 38;
const MONUMENT_XP_MIX_LABEL_BOTTOM_PADDING = 342;
const MONUMENT_XP_MIX_LABEL_DESKTOP_ROW_GAP = 34;
const MONUMENT_XP_MIX_LABEL_MOBILE_ROW_GAP = 24;

const MONUMENT_XP_MIX_LABEL_CONFIG: Record<
  MonumentXpMixDonutLabel["side"],
  MonumentXpMixDonutLabelSideConfig
> = {
  left: {
    elbowX: 112,
    labelX: 106,
    lineEndX: 118,
    maxY: MONUMENT_XP_MIX_LABEL_BOTTOM_PADDING,
    minGap: MONUMENT_XP_MIX_LABEL_DESKTOP_ROW_GAP,
    minY: MONUMENT_XP_MIX_LABEL_TOP_PADDING,
  },
  right: {
    elbowX: 308,
    labelX: 314,
    lineEndX: 302,
    maxY: MONUMENT_XP_MIX_LABEL_BOTTOM_PADDING,
    minGap: MONUMENT_XP_MIX_LABEL_DESKTOP_ROW_GAP,
    minY: MONUMENT_XP_MIX_LABEL_TOP_PADDING,
  },
};

function getDisplaySkillMix(
  xpSkillMix: MonumentXpSkillMixPoint[]
): DisplaySkillMixPoint[] {
  if (xpSkillMix.length <= 8) return xpSkillMix;

  const topSkills = xpSkillMix.slice(0, 8);
  const otherSkills = xpSkillMix.slice(8);
  const totalXp = xpSkillMix.reduce((sum, item) => sum + item.xp, 0);
  const otherXp = otherSkills.reduce((sum, item) => sum + item.xp, 0);
  const otherCount = otherSkills.reduce((sum, item) => sum + item.count, 0);

  if (otherXp <= 0) return topSkills;

  return [
    ...topSkills,
    {
      skillId: "other",
      skillName: "Other",
      skillIcon: null,
      xp: otherXp,
      count: otherCount,
      percent: totalXp > 0 ? (otherXp / totalXp) * 100 : 0,
    },
  ];
}

function getDonutSkillMix(displayMix: DisplaySkillMixPoint[]) {
  if (displayMix.length <= 7) return displayMix;

  const visible = displayMix.slice(0, 6);
  const grouped = displayMix.slice(6);
  const totalXp = displayMix.reduce((sum, item) => sum + item.xp, 0);
  const otherXp = grouped.reduce((sum, item) => sum + item.xp, 0);
  const otherCount = grouped.reduce((sum, item) => sum + item.count, 0);

  if (otherXp <= 0) return visible;

  return [
    ...visible,
    {
      skillId: "other",
      skillName: "Other",
      skillIcon: null,
      xp: otherXp,
      count: otherCount,
      percent: totalXp > 0 ? (otherXp / totalXp) * 100 : 0,
    },
  ] satisfies DisplaySkillMixPoint[];
}

function buildMonumentXpMixDonutLabels(
  segments: MonumentXpMixDonutSegment[],
  centerX: number,
  centerY: number,
  radius: number
): MonumentXpMixDonutLabel[] {
  const preferredLabelRadius = radius + 78;
  const anchorRadius = radius + 10;
  const radialBreakRadius = radius + 24;
  const leftLabels: MonumentXpMixDonutLabel[] = [];
  const rightLabels: MonumentXpMixDonutLabel[] = [];

  segments.forEach((segment) => {
    const midAngle = (segment.startAngle + segment.endAngle) / 2;
    const side: MonumentXpMixDonutLabel["side"] =
      Math.sin((midAngle * Math.PI) / 180) >= 0 ? "right" : "left";
    const config = MONUMENT_XP_MIX_LABEL_CONFIG[side];
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
    const label: MonumentXpMixDonutLabel = {
      anchorX: anchor.x,
      anchorY: anchor.y,
      connectorX: radialBreak.x,
      connectorY: radialBreak.y,
      elbowX: config.elbowX,
      labelX: config.labelX,
      labelY: preferred.y,
      lineEndX: config.lineEndX,
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
    ...layoutMonumentXpMixDonutLabelSide(
      leftLabels,
      MONUMENT_XP_MIX_LABEL_CONFIG.left
    ),
    ...layoutMonumentXpMixDonutLabelSide(
      rightLabels,
      MONUMENT_XP_MIX_LABEL_CONFIG.right
    ),
  ];
}

function layoutMonumentXpMixDonutLabelSide(
  labels: MonumentXpMixDonutLabel[],
  config: MonumentXpMixDonutLabelSideConfig
): MonumentXpMixDonutLabel[] {
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
          MONUMENT_XP_MIX_LABEL_MOBILE_ROW_GAP,
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

  const evenGap = Math.min(
    48,
    Math.max(effectiveGap, available / (sorted.length - 1))
  );
  const evenSpan = evenGap * (sorted.length - 1);
  const preferredCenter =
    sorted.reduce((sum, label) => sum + label.preferredY, 0) / sorted.length;
  const startY = clamp(preferredCenter - evenSpan / 2, minY, maxY - evenSpan);

  return placed.map((label, index) => ({
    ...label,
    labelY: startY + evenGap * index,
  }));
}

function formatMonumentXpMixDonutName(name: string) {
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

function formatMonumentXpMixXpLabel(value: number) {
  return `${formatCompactNumber(value)} XP`;
}

function formatPercentLabel(value: number) {
  const clamped = clampPercent(value);
  return `${clamped}%`;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function MonumentXpMixDonut({
  xpSkillMix,
}: {
  xpSkillMix: MonumentXpSkillMixPoint[];
}) {
  const shadowId = useId().replace(/:/g, "");
  const glowId = useId().replace(/:/g, "");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const totalXp = xpSkillMix.reduce((sum, item) => sum + item.xp, 0);
  const displayMix = getDisplaySkillMix(xpSkillMix);
  const donutMix = useMemo(() => getDonutSkillMix(displayMix), [displayMix]);
  const hasMix = donutMix.length > 0 && totalXp > 0;
  const size = 420;
  const centerX = size / 2;
  const centerY = 190;
  const radius = 74;
  const strokeWidth = 20;
  const separatorWidth = strokeWidth + 2;
  const selectedSkill =
    donutMix.find((item) => item.skillId === selectedSkillId) ?? null;
  const segments = useMemo<MonumentXpMixDonutSegment[]>(() => {
    let cursor = -90;

    return donutMix.map((item, index) => {
      const percent = totalXp > 0 ? (item.xp / totalXp) * 100 : 0;
      const startAngle = cursor;
      const arcDegrees = Math.min(359.99, (percent / 100) * 360);
      const endAngle = cursor + arcDegrees;
      cursor = endAngle;

      return {
        color:
          MONUMENT_XP_MIX_DONUT_COLORS[
            index % MONUMENT_XP_MIX_DONUT_COLORS.length
          ],
        endAngle,
        item,
        path: describeDonutArc(centerX, centerY, radius, startAngle, endAngle),
        startAngle,
      };
    });
  }, [centerX, centerY, donutMix, radius, totalXp]);
  const labels = useMemo(
    () => buildMonumentXpMixDonutLabels(segments, centerX, centerY, radius),
    [centerX, centerY, radius, segments]
  );

  useEffect(() => {
    setSelectedSkillId((current) =>
      current != null && donutMix.some((item) => item.skillId === current)
        ? current
        : null
    );
  }, [donutMix]);

  return (
    <div className="mt-4 min-w-0">
      <div className="border-y border-white/[0.06] py-3">
        <div className="relative mx-auto aspect-[420/380] w-full min-w-0 max-w-[420px]">
          <svg
            viewBox={`0 0 ${size} 380`}
            className="h-full w-full overflow-visible"
            role="img"
            aria-label="Monument skill contribution XP mix"
          >
            <defs>
              <filter
                id={`${shadowId}-center-shadow`}
                x="-25%"
                y="-25%"
                width="150%"
                height="150%"
              >
                <feDropShadow
                  dx="0"
                  dy="2"
                  stdDeviation="3"
                  floodColor="#000000"
                  floodOpacity="0.34"
                />
              </filter>
              <filter
                id={`${glowId}-selected-glow`}
                x="-35%"
                y="-35%"
                width="170%"
                height="170%"
              >
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
            {hasMix ? (
              segments.map((segment) => {
                const { color, endAngle, item, path, startAngle } = segment;
                const selected = item.skillId === selectedSkillId;
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
                  <g key={item.skillId}>
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
                        filter={`url(#${glowId}-selected-glow)`}
                        pointerEvents="none"
                      />
                    ) : null}
                    <path
                      d={path}
                      fill="none"
                      stroke={color}
                      strokeWidth={selected ? strokeWidth + 1 : strokeWidth}
                      strokeLinecap="butt"
                      opacity={selected || selectedSkillId == null ? 1 : 0.48}
                      className="cursor-pointer transition-[opacity,stroke-width] duration-150 focus:outline-none"
                      onMouseEnter={() => setSelectedSkillId(item.skillId)}
                      onClick={() => setSelectedSkillId(item.skillId)}
                      role="button"
                      tabIndex={0}
                      aria-label={`${item.skillName}, ${formatPercentLabel(
                        item.percent
                      )} of XP`}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedSkillId(item.skillId);
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
              })
            ) : (
              <circle
                cx={centerX}
                cy={centerY}
                r={radius}
                fill="none"
                stroke="rgba(113,113,122,0.32)"
                strokeWidth={strokeWidth}
                strokeDasharray="7 10"
              />
            )}
            {hasMix
              ? labels.map((label) => {
                  const { item } = label.segment;
                  const selected = item.skillId === selectedSkillId;
                  const name = formatMonumentXpMixDonutName(item.skillName);
                  const details = `${formatPercentLabel(
                    item.percent
                  )}  +${formatMonumentXpMixXpLabel(item.xp)}`;

                  return (
                    <g
                      key={`label-${item.skillId}`}
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
                        stroke={
                          selected
                            ? "rgba(235,236,240,0.68)"
                            : "rgba(161,166,175,0.34)"
                        }
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
                        className={cn(
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
                        className={cn(
                          "fill-current text-[9px] font-medium tabular-nums min-[380px]:text-[10px]",
                          selected ? "text-zinc-300" : "text-zinc-600"
                        )}
                      >
                        {details}
                      </text>
                    </g>
                  );
                })
              : null}
            <circle
              cx={centerX}
              cy={centerY}
              r={radius - strokeWidth / 2 - 4}
              fill="#070a0f"
              filter={`url(#${shadowId}-center-shadow)`}
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
            <div className="max-w-[104px] min-[380px]:max-w-[112px]">
              <div className="truncate text-[8px] font-semibold uppercase tracking-[0.12em] text-zinc-500 min-[380px]:text-[9px]">
                {selectedSkill ? selectedSkill.skillName : "TOTAL XP"}
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold leading-tight text-zinc-50 min-[380px]:text-base">
                {hasMix
                  ? selectedSkill
                    ? `${formatCompactNumber(selectedSkill.xp)} XP`
                    : formatCompactNumber(totalXp)
                  : "No XP"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {hasMix ? (
        <div className="min-w-0 rounded-xl border border-zinc-800 bg-[#080b11] p-3">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Skill contribution
              </div>
              <div className="mt-1 truncate text-base font-semibold text-zinc-50">
                XP by skill
              </div>
            </div>
            <div className="shrink-0 text-right text-lg font-semibold text-zinc-50">
              +{formatCompactNumber(totalXp)} XP
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {displayMix.map((item) => (
              <div
                key={item.skillId}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/55 px-2 py-1.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-xs text-zinc-300"
                    aria-hidden="true"
                  >
                    {item.skillIcon || item.skillName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-zinc-100">
                      {item.skillName}
                    </div>
                    <div className="truncate text-[10px] text-zinc-500">
                      {formatPercentLabel(item.percent)} of total · {item.count}{" "}
                      {item.count === 1 ? "event" : "events"}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs font-semibold text-zinc-100">
                  +{formatCompactNumber(item.xp)} XP
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="border-b border-white/[0.06] py-5 text-center text-xs font-medium text-white/55">
          No skill XP for this monument yet.
        </p>
      )}
    </div>
  );
}

export default function ActivityPanel({ monumentId }: ActivityPanelProps) {
  const { events, loading, error, summary, notes, levelHistory, xpSkillMix } =
    useMonumentActivity(monumentId);

  const storageKey = useMemo(
    () => `monument:${monumentId}:pinned-insights`,
    [monumentId]
  );

  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [graphTab, setGraphTab] = useState<MonumentGraphTab>("level");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setPinnedIds([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setPinnedIds([]);
        return;
      }
      const sanitized = parsed.filter((value): value is string => typeof value === "string");
      setPinnedIds(sanitized);
    } catch (readError) {
      console.warn("Unable to read pinned insights from storage", readError);
      setPinnedIds([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (notes.length === 0) return;
    setPinnedIds((current) => {
      const valid = current.filter((id) => notes.some((note) => note.id === id));
      if (valid.length === current.length) return current;
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(valid));
        } catch (writeError) {
          console.warn("Unable to persist pinned insights", writeError);
        }
      }
      return valid;
    });
  }, [notes, storageKey]);

  const togglePin = useCallback(
    (noteId: string) => {
      setPinnedIds((current) => {
        const exists = current.includes(noteId);
        const next = exists
          ? current.filter((id) => id !== noteId)
          : [noteId, ...current];
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(next));
          } catch (writeError) {
            console.warn("Unable to persist pinned insights", writeError);
          }
        }
        return next;
      });
    },
    [storageKey]
  );

  const noteById = useMemo(() => {
    const map = new Map<string, MonumentActivityNote>();
    for (const note of notes) {
      map.set(note.id, note);
    }
    return map;
  }, [notes]);

  const pinnedNotes = useMemo(() => {
    if (pinnedIds.length === 0) return [] as MonumentActivityNote[];
    return pinnedIds
      .map((id) => noteById.get(id))
      .filter((note): note is MonumentActivityNote => Boolean(note))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [noteById, pinnedIds]);

  const hasPinnedNotes = pinnedNotes.length > 0;

  function summarizeNoteContent(note: MonumentActivityNote) {
    const raw = note.content?.replace(/\s+/g, " ").trim();
    if (!raw) return "Drop more detail in this note to keep the blueprint vivid.";
    if (raw.length <= 180) return raw;
    return `${raw.slice(0, 177)}…`;
  }

  const hasEvents = events.length > 0;
  const currentLevelPoint = levelHistory[levelHistory.length - 1] ?? null;
  const currentLevel = currentLevelPoint?.level ?? 1;
  const currentTotalXp = currentLevelPoint?.totalXp ?? 0;
  const firstLevelPoint = levelHistory[0] ?? null;
  const xpGainedAcrossHistory = Math.max(
    0,
    currentTotalXp - (firstLevelPoint?.totalXp ?? 0)
  );
  const xpToNextLevel = currentLevelPoint
    ? Math.max(
        0,
        currentLevelPoint.xpForNextLevel - currentLevelPoint.xpIntoLevel
      )
    : 0;
  const xpPointCount = Math.max(0, levelHistory.length - 1);
  const xpSkillMixTotal = xpSkillMix.reduce((sum, item) => sum + item.xp, 0);
  const xpSkillEventCount = xpSkillMix.reduce((sum, item) => sum + item.count, 0);
  const topSkillPoint = xpSkillMix[0] ?? null;
  const topSkill = topSkillPoint?.skillName ?? "None";
  const topSkillIcon = topSkillPoint?.skillIcon || topSkill.charAt(0).toUpperCase();
  const graphTabs: Array<{ label: string; value: MonumentGraphTab }> = [
    { label: "LEVEL CURVE", value: "level" },
    { label: "XP TREND", value: "xp" },
  ];

  const phases = useMemo(
    () => [
      {
        label: "Foundation",
        description: "Capture ideas and define the footprint.",
        threshold: 20,
      },
      {
        label: "Framework",
        description: "Half your goals are carrying weight.",
        threshold: 50,
      },
      {
        label: "Finishing",
        description: "Final goals and XP polish the structure.",
        threshold: 80,
      },
      {
        label: "Legacy",
        description: "Charge maxed — monument stands complete.",
        threshold: 100,
      },
    ],
    []
  );

  const chargePercent = Math.min(Math.max(summary.chargePercent, 0), 100);

  const thermometerHeight = Math.max(chargePercent, hasEvents ? 6 : 0);

  return (
    <Card className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#050608] p-3 text-white shadow-[0_28px_80px_-46px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.045)] sm:p-5 lg:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.03),_transparent_52%)]" />
      <div className="pointer-events-none absolute -right-20 top-0 h-52 w-52 rounded-full bg-white/[0.025] blur-3xl" />
      <div className="relative grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="relative min-w-0">
          {loading ? (
            <div className="min-w-0 animate-pulse rounded-2xl border border-white/[0.08] bg-[#07080A] px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="h-3 w-28 rounded-full bg-white/[0.08]" />
                  <div className="mt-3 h-4 w-40 rounded-full bg-white/[0.055]" />
                </div>
                <div className="h-7 w-24 rounded-full bg-white/[0.055]" />
              </div>
              <div className="mt-6 flex h-28 items-end gap-1.5">
                <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-[#050608]">
                  <div className="absolute inset-x-4 top-6 h-px border-t border-dashed border-white/[0.07]" />
                  <div className="absolute inset-x-4 top-1/2 h-px border-t border-dashed border-white/[0.07]" />
                  <div className="absolute inset-x-4 bottom-7 h-px border-t border-dashed border-white/[0.07]" />
                  <div className="absolute bottom-8 left-5 h-10 w-[90%] rounded-[55%] border-t-2 border-white/[0.08]" />
                  <div className="absolute bottom-8 left-5 h-14 w-[90%] rounded-[55%] bg-white/[0.025]" />
                </div>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-11 rounded-2xl border border-white/[0.06] bg-white/[0.025]"
                  />
                ))}
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 rounded-2xl border border-red-400/20 bg-red-950/20 px-4 py-5 text-sm text-red-200">
              <TriangleAlert className="size-5" aria-hidden="true" />
              <div>
                <p className="font-semibold">Couldn&apos;t load activity</p>
                <p className="text-xs text-red-100/70">{error}</p>
              </div>
            </div>
          ) : (
            <div className="relative min-w-0 space-y-6">
              {hasPinnedNotes ? (
                <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#0B0C0F] px-4 py-4 text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
                  <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/55">
                        Pinned insights
                      </p>
                      <h4 className="text-sm font-semibold text-white/90">Keep these blueprints within reach</h4>
                    </div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/40">
                      {pinnedNotes.length} saved
                    </p>
                  </header>
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {pinnedNotes.map((note) => {
                      const updatedAt = new Date(note.updatedAt);
                      const updatedLabel = Number.isNaN(updatedAt.getTime())
                        ? null
                        : formatTimeLabel(updatedAt);
                      return (
                        <li key={note.id} className="group relative">
                          <article className="flex h-full flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#07080A] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition group-hover:border-white/[0.12] group-hover:bg-[#0B0C0F]">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-white/90">
                                  {note.title || "Pinned note"}
                                </p>
                                {updatedLabel ? (
                                  <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/40">
                                    Updated {updatedLabel}
                                  </p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => togglePin(note.id)}
                                className="rounded-full border border-white/[0.10] bg-white/[0.04] p-2 text-white/60 transition hover:border-white/[0.16] hover:bg-white/[0.07] hover:text-white/78"
                                aria-label="Unpin insight"
                              >
                                <Pin className="size-4 -rotate-45" aria-hidden="true" />
                              </button>
                            </div>
                            <p className="text-xs leading-relaxed text-white/58">
                              {summarizeNoteContent(note)}
                            </p>
                          </article>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              <section className="relative min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#07080A] px-3 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-4 sm:py-5">
                <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-white/[0.06]" />
                <header className="relative space-y-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:block">
                        <div className="space-y-1">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/42">
                            Monument analytics
                          </p>
                          <h4 className="text-sm font-semibold text-white/90">
                            {graphTab === "level"
                              ? "Level over time"
                              : "XP over time"}
                          </h4>
                        </div>
                        <div className={segmentedToggleContainerClassName}>
                          {graphTabs.map((tab) => (
                            <button
                              key={tab.value}
                              type="button"
                              onClick={() => setGraphTab(tab.value)}
                              className={cn(
                                segmentedToggleButtonClassName,
                                graphTab === tab.value
                                  ? segmentedToggleActiveClassName
                                  : segmentedToggleInactiveClassName
                              )}
                              aria-pressed={graphTab === tab.value}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-end gap-3">
                        <p className="text-4xl font-semibold leading-none text-white sm:text-5xl">
                          {graphTab === "level"
                            ? currentLevel
                            : formatCompactNumber(currentTotalXp)}
                        </p>
                        <div className="pb-0.5 sm:pb-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/42">
                            {graphTab === "level" ? "Current level" : "Total XP"}
                          </p>
                          <p className="mt-1 text-xs text-white/45">
                            {graphTab === "level"
                              ? `${formatCompactNumber(xpToNextLevel)} XP to next`
                              : `${formatCompactNumber(xpGainedAcrossHistory)} XP gained across history`}
                          </p>
                        </div>
                      </div>
                    </div>
                    <dl className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.06] pt-3 text-left lg:max-w-[420px] lg:border-t-0 lg:pt-0">
                      <div className="space-y-1">
                        <dt className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/38">
                          {graphTab === "level" ? "Total XP" : "Current level"}
                        </dt>
                        <dd className="mt-1 text-sm font-semibold text-white/82">
                          {graphTab === "level"
                            ? formatCompactNumber(currentTotalXp)
                            : currentLevel}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/38">
                          {graphTab === "level" ? "To next" : "XP to next"}
                        </dt>
                        <dd className="mt-1 text-sm font-semibold text-white/82">
                          {formatCompactNumber(xpToNextLevel)}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/38">
                          Points
                        </dt>
                        <dd className="mt-1 text-sm font-semibold text-white/82">
                          {xpPointCount}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </header>

                {graphTab === "level" ? (
                  <MonumentLevelCurveChart levelHistory={levelHistory} />
                ) : (
                  <MonumentXpTrendChart levelHistory={levelHistory} />
                )}

                <section className="mt-5 min-w-0 border-t border-white/[0.06] pt-5">
                  <header className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="space-y-1">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/42">
                          Skill contribution
                        </p>
                        <h4 className="text-sm font-semibold text-white/90">
                          XP mix
                        </h4>
                      </div>
                      <div className="flex min-w-0 items-end gap-3">
                        <p className="min-w-0 truncate text-3xl font-semibold leading-none text-white sm:text-4xl">
                          {formatCompactNumber(xpSkillMixTotal)}
                        </p>
                        <div className="min-w-0 pb-0.5 sm:pb-1">
                          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.26em] text-white/42">
                            Total XP
                          </p>
                          <p className="mt-1 truncate text-xs text-white/45">
                            {xpSkillMix.length} skills
                          </p>
                        </div>
                      </div>
                    </div>
                    <dl className="grid w-full min-w-0 grid-cols-2 gap-x-4 gap-y-2 border-t border-white/[0.06] pt-3 text-left lg:max-w-[320px] lg:border-t-0 lg:pt-0">
                      <div className="min-w-0 space-y-1">
                        <dt className="truncate text-[9px] font-semibold uppercase tracking-[0.22em] text-white/38">
                          Total events
                        </dt>
                        <dd className="mt-1 truncate text-sm font-semibold text-white/82">
                          {formatCompactNumber(xpSkillEventCount)}
                        </dd>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <dt className="truncate text-[9px] font-semibold uppercase tracking-[0.22em] text-white/38">
                          Top skill
                        </dt>
                        <dd className="mt-1 flex min-w-0 items-center gap-1.5 text-sm font-semibold text-white/82">
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-white/[0.07] bg-white/[0.035] text-xs text-white/78">
                            {topSkillIcon}
                          </span>
                          <span className="min-w-0 truncate">{topSkill}</span>
                        </dd>
                      </div>
                    </dl>
                  </header>
                  <MonumentXpMixDonut xpSkillMix={xpSkillMix} />
                </section>
              </section>
            </div>
          )}
        </div>

        <aside className="space-y-4 2xl:sticky 2xl:top-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#08090B] p-5 shadow-[0_18px_46px_-36px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.045)]">
            <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/[0.06]" />
            <div className="relative space-y-4">
              <header className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/48">
                  Charge Thermometer
                </p>
                <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
                  <p className="text-3xl font-semibold text-white">{chargePercent}%</p>
                  <p className="text-xs text-white/48">
                    charged from the past month of linked completions
                  </p>
                </div>
              </header>
              <div className="relative h-40 rounded-[22px] border border-white/[0.08] bg-[#07080A] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="relative flex h-full items-end justify-center">
                  <div
                    className="w-12 rounded-full border border-white/[0.10] bg-gradient-to-t from-zinc-950 via-zinc-700/65 to-zinc-200/70 shadow-[0_10px_24px_-18px_rgba(255,255,255,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all"
                    style={{ height: `${thermometerHeight}%` }}
                    aria-hidden="true"
                  />
                </div>
              </div>
              <ul className="relative grid gap-3">
                {phases.map((phase) => {
                  const reached = chargePercent >= phase.threshold;
                  return (
                    <li
                      key={phase.label}
                      className={cn(
                        "flex items-start gap-3 rounded-2xl border px-4 py-3",
                        reached
                          ? "border-white/[0.14] bg-white/[0.06] text-white/82"
                          : "border-white/[0.08] bg-[#07080A] text-white/45"
                      )}
                    >
                      <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-current/40">
                        {reached ? (
                          <CheckCircle2 className="size-4" aria-hidden="true" />
                        ) : (
                          <span className="size-2 rounded-full bg-current/40" />
                        )}
                      </span>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em]">
                          {phase.label}
                        </p>
                        <p className="text-xs leading-relaxed">{phase.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-[#07080A] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
                XP logged (last 30 days)
              </p>
              <div className="mt-2 flex items-end gap-2">
                <p className="text-2xl font-semibold text-white">{summary.totalXp}</p>
                <span className="text-xs text-white/45">across {summary.xpEvents} completions</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-[#07080A] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
                Goals completed
              </p>
              <div className="mt-2 flex items-end gap-2">
                <p className="text-2xl font-semibold text-white">
                  {summary.completedGoals}
                  <span className="text-base text-white/45">
                    /{summary.totalGoals}
                  </span>
                </p>
                <span className="text-xs text-white/45">fueling this monument</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-[#07080A] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
                Notes captured
              </p>
              <div className="mt-2 flex items-end gap-2">
                <p className="text-2xl font-semibold text-white">{summary.notesLogged}</p>
                <span className="text-xs text-white/45">structured ideas in the archive</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </Card>
  );
}
