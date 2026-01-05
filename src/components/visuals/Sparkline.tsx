import { useMemo } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  area?: boolean;
  className?: string;
}

export function Sparkline({
  data,
  width = 280,
  height = 120,
  strokeWidth = 2.5,
  area = false,
  className,
}: SparklineProps) {
  const { linePath, areaPath } = useMemo(() => {
    if (data.length === 0) return { linePath: "", areaPath: "" };

    const values = data;
    const maxValue = Math.max(...values, 1);
    const minValue = Math.min(...values, 0);
    const verticalPadding = 12;
    const range = maxValue - minValue || 1;

    const points = values.map((value, index) => {
      const x =
        data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
      const normalized = (value - minValue) / range;
      const y =
        height -
        (normalized * (height - verticalPadding * 2) + verticalPadding);
      return { x, y };
    });

    const linePath = points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(
            2
          )}`
      )
      .join(" ");

    const areaPath = area
      ? [
          `M0,${height}`,
          ...points.map(
            (point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`
          ),
          `L${width},${height}`,
          "Z",
        ].join(" ")
      : "";

    return { linePath, areaPath };
  }, [data, width, height, area]);

  if (data.length === 0) {
    return (
      <div
        className={`flex h-32 items-center justify-center ${className || ""}`}
      >
        <span className="text-xs text-gray-500">No data</span>
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`h-32 w-full ${className || ""}`}
    >
      <defs>
        <linearGradient id="sparklineGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(254,202,202,0.6)" />
          <stop offset="100%" stopColor="rgba(248,113,113,0.05)" />
        </linearGradient>
      </defs>
      {area && areaPath && <path d={areaPath} fill="url(#sparklineGradient)" />}
      <path
        d={linePath}
        fill="none"
        stroke="url(#sparklineGradient)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}
