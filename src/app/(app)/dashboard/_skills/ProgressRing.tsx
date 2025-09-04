"use client";

import React from "react";

export function calculateDashOffset(radius: number, percent: number) {
  const circumference = 2 * Math.PI * radius;
  return circumference - (percent / 100) * circumference;
}

interface ProgressRingProps {
  size?: number;
  stroke?: number;
  percent: number;
  className?: string;
}

export function ProgressRing({
  size = 22,
  stroke = 3,
  percent,
  className,
}: ProgressRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = calculateDashOffset(radius, percent);

  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox={`0 0 ${size} ${size}`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={stroke}
        fill="transparent"
        opacity={0.2}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth={stroke}
        fill="transparent"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
      />
    </svg>
  );
}

export default ProgressRing;

