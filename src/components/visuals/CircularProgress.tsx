import { useMemo } from "react";

interface CircularProgressProps {
  size: number;
  strokeWidth?: number;
  progress: number; // 0-100
  trackClassName?: string;
  progressClassName?: string;
  label?: React.ReactNode;
}

export function CircularProgress({
  size,
  strokeWidth = 6,
  progress,
  trackClassName = "stroke-gray-700",
  progressClassName = "stroke-red-400",
  label,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = useMemo(
    () =>
      circumference -
      (Math.min(100, Math.max(0, progress)) / 100) * circumference,
    [circumference, progress]
  );

  return (
    <div className="relative flex items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="h-full w-full"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          className={trackClassName}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={progressClassName}
          style={{
            transition: "stroke-dashoffset 0.6s ease",
            ...(typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? { transition: "none" }
              : {}),
          }}
        />
      </svg>
      {label && (
        <span className="absolute text-xs font-semibold text-white">
          {label}
        </span>
      )}
    </div>
  );
}
