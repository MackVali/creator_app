"use client";

import { motion } from "framer-motion";

interface ChargingRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
}

export function ChargingRing({ value, size = 80, strokeWidth = 8 }: ChargingRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} className="text-zinc-700">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        stroke="currentColor"
        fill="transparent"
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="var(--accent)"
        strokeWidth={strokeWidth}
        fill="transparent"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
        transition={{ duration: 0.5 }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        className="text-sm font-semibold"
      >
        {Math.round(value)}%
      </text>
    </svg>
  );
}

export default ChargingRing;
