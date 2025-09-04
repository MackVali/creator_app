"use client";

import React from "react";
import clsx from "clsx";

type EnergyLevel = "NO" | "LOW" | "MEDIUM" | "HIGH" | "ULTRA" | "EXTREME";

interface EnergyFlameProps {
  level: EnergyLevel;
  size?: number;
  className?: string;
  monochrome?: boolean;
}

interface LevelConfig {
  scale: number; // overall scale of flame group
  flickerDur: number; // seconds
  flickerMin: number;
  flickerMax: number;
  flickerBright: number;
  sway: number; // degrees
  emberDur?: number; // seconds
  glow: string; // css drop-shadow string
  flareDur?: number; // seconds
  blur: number; // px
}

const LEVEL_CONFIG: Record<EnergyLevel, LevelConfig> = {
  NO: {
    scale: 1,
    flickerDur: 0,
    flickerMin: 1,
    flickerMax: 1,
    flickerBright: 1,
    sway: 0,
    glow: "none",
    blur: 0,
  },
  LOW: {
    scale: 0.67,
    flickerDur: 1.2,
    flickerMin: 0.98,
    flickerMax: 1.02,
    flickerBright: 1.02,
    sway: 2,
    glow: "drop-shadow(0 0 6px rgba(255,193,7,0.18))",
    blur: 2,
  },
  MEDIUM: {
    scale: 0.75,
    flickerDur: 1.05,
    flickerMin: 0.97,
    flickerMax: 1.03,
    flickerBright: 1.04,
    sway: 3,
    emberDur: 2.2,
    glow: "drop-shadow(0 0 8px rgba(255,140,0,0.22))",
    blur: 3,
  },
  HIGH: {
    scale: 1,
    flickerDur: 0.9,
    flickerMin: 0.96,
    flickerMax: 1.04,
    flickerBright: 1.05,
    sway: 4,
    emberDur: 1.6,
    glow: "drop-shadow(0 0 10px rgba(255,90,0,0.28))",
    blur: 4,
  },
  ULTRA: {
    scale: 1.15,
    flickerDur: 0.75,
    flickerMin: 0.95,
    flickerMax: 1.05,
    flickerBright: 1.06,
    sway: 5,
    emberDur: 1,
    glow: "drop-shadow(0 0 14px rgba(255,70,0,0.35))",
    flareDur: 4,
    blur: 5,
  },
  EXTREME: {
    scale: 1.2,
    flickerDur: 0.7,
    flickerMin: 0.95,
    flickerMax: 1.05,
    flickerBright: 1.07,
    sway: 6,
    emberDur: 1.2,
    glow:
      "drop-shadow(0 0 14px rgba(76,178,255,0.45)) drop-shadow(0 0 8px rgba(255,59,59,0.55))",
    flareDur: 4,
    blur: 6,
  },
};

interface LevelColors {
  outer: [string, string];
  inner: [string, string];
  core: string;
  ember: string;
}

const LEVEL_COLORS: Record<Exclude<EnergyLevel, "NO">, LevelColors> = {
  LOW: {
    outer: ["#FFC66D", "#FF8A3D"],
    inner: ["#FFE0A3", "#FFC66D"],
    core: "#FFF2B3",
    ember: "#FFE3A1",
  },
  MEDIUM: {
    outer: ["#FFB347", "#FF6A00"],
    inner: ["#FFD87A", "#FF9A3D"],
    core: "#FFF2B3",
    ember: "#FFE380",
  },
  HIGH: {
    outer: ["#FF9D2E", "#FF4600"],
    inner: ["#FFBE73", "#FF7A1A"],
    core: "#FFF2B3",
    ember: "#FFE380",
  },
  ULTRA: {
    outer: ["#FFB000", "#FF2D00"],
    inner: ["#FFD166", "#FF7A1A"],
    core: "#FFF2B3",
    ember: "#FFE380",
  },
  EXTREME: {
    outer: ["#4CB2FF", "#2E7BEF"],
    inner: ["#FF5A5A", "#FFA1A1"],
    core: "#FFFFFF",
    ember: "#E6F4FF",
  },
};

export function EnergyFlame({
  level,
  size = 24,
  className,
  monochrome = false,
}: EnergyFlameProps) {
  const id = React.useId();
  const cfg = LEVEL_CONFIG[level];

  const colors =
    level === "NO"
      ? null
      : LEVEL_COLORS[level as Exclude<EnergyLevel, "NO">];

  const outerFill = monochrome
    ? "#A6A6A6"
    : colors
    ? `url(#outer-${id})`
    : "#000";
  const innerFill = monochrome
    ? "#D0D0D0"
    : colors
    ? `url(#inner-${id})`
    : "#000";
  const coreFill = monochrome
    ? "#F2F2F2"
    : colors
    ? colors.core
    : "#000";

  const emberFill = monochrome
    ? "#D0D0D0"
    : colors
    ? colors.ember
    : "#000";

  const glowFilter = monochrome
    ? `blur(${cfg.blur}px) drop-shadow(0 0 10px rgba(153,102,204,0.45))`
    : `blur(${cfg.blur}px) ${cfg.glow}`;

  return (
    <div
      className={clsx("relative", className)}
      style={{ width: size, height: size, pointerEvents: "none" }}
      aria-label={`Energy: ${level.charAt(0)}${level.slice(1).toLowerCase()}`}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        style={{ overflow: "visible" }}
      >
        {level !== "NO" && !monochrome && colors && (
          <defs>
            <linearGradient
              id={`outer-${id}`}
              x1="12"
              y1="2"
              x2="12"
              y2="22"
            >
              <stop offset="0%" stopColor={colors.outer[0]} />
              <stop offset="100%" stopColor={colors.outer[1]} />
            </linearGradient>
            <linearGradient
              id={`inner-${id}`}
              x1="12"
              y1="7"
              x2="12"
              y2="20"
            >
              <stop offset="0%" stopColor={colors.inner[0]} />
              <stop offset="100%" stopColor={colors.inner[1]} />
            </linearGradient>
          </defs>
        )}

        {level !== "NO" && (
          <g
            className="flame-group"
            style={{
              transform: `scale(${cfg.scale})`,
              transformOrigin: "center bottom",
              filter: glowFilter,
            }}
          >
            <g
              className="sway"
              style={{
                transformOrigin: "center bottom",
                "--sway-angle": `${cfg.sway}deg`,
                "--sway-duration": `${cfg.flickerDur * 2}s`,
              } as React.CSSProperties}
            >
              <g
                className={clsx("flicker", {
                  flare: level === "ULTRA" || level === "EXTREME",
                })}
                style={{
                  "--flicker-duration": `${cfg.flickerDur}s`,
                  "--flicker-min": cfg.flickerMin,
                  "--flicker-max": cfg.flickerMax,
                  "--flicker-bright": cfg.flickerBright,
                  ...(cfg.flareDur && { "--flare-duration": `${cfg.flareDur}s` }),
                } as React.CSSProperties}
              >
                {/* Outer lobe */}
                <path
                  d="M12 2C9 5 9.5 9 8 12C6.5 15 7 18 12 22C17 18 17.5 15 16 12C14.5 9 15 5 12 2Z"
                  fill={outerFill}
                />
                {/* Inner lobe */}
                <path
                  d="M12 7C10.5 9.5 11 11.5 10 14C9.5 16 10 18 12 20C14 18 14.5 16 14 14C13 11.5 13.5 9.5 12 7Z"
                  fill={innerFill}
                />
                {/* Core */}
                <path
                  d="M12 14C11.6 15 11.8 16 12 17C12.2 16 12.4 15 12 14Z"
                  fill={coreFill}
                />
              </g>
            </g>
          </g>
        )}

        {level === "NO" && (
          <g className="smoke-group">
            {[0, 1, 2].map((i) => (
              <circle
                key={i}
                cx="12"
                cy="18"
                r="2"
                className="smoke"
                style={{
                  "--smoke-duration": `${4 + i * 1.5}s`,
                  "--smoke-delay": `${i * 1.5}s`,
                  "--smoke-x": `${i === 1 ? -2 : 2}px`,
                } as React.CSSProperties}
                fill="#A6A6A6"
                opacity="0.6"
              />
            ))}
          </g>
        )}

        {level !== "NO" && cfg.emberDur && (
          <g
            className="embers"
            style={{ "--ember-duration": `${cfg.emberDur}s` } as React.CSSProperties}
          >
            {[0, 1, 2].map((i) => (
              <circle
                key={i}
                cx="12"
                cy="19"
                r="0.8"
                className="ember"
                style={{
                  animationDelay: `${(i * cfg.emberDur) / 3}s`,
                  "--ember-x": `${i % 2 === 0 ? 2 : -3}px`,
                } as React.CSSProperties}
                fill={emberFill}
              />
            ))}
          </g>
        )}
      </svg>
      <style jsx>{`
        .sway {
          animation: flameSway var(--sway-duration) ease-in-out infinite;
        }
        .flicker {
          animation: flameFlicker var(--flicker-duration) ease-in-out infinite;
        }
        .flare {
          animation: flarePulse var(--flare-duration) ease-in-out infinite;
        }
        .ember {
          animation: emberRise var(--ember-duration) linear infinite;
        }
        .smoke {
          animation: smokeDrift var(--smoke-duration) linear infinite;
          animation-delay: var(--smoke-delay);
        }
        @keyframes flameFlicker {
          0%,100% {
            transform: scale(var(--flicker-min));
            filter: brightness(1);
          }
          50% {
            transform: scale(var(--flicker-max));
            filter: brightness(var(--flicker-bright));
          }
        }
        @keyframes flameSway {
          0%,100% {
            transform: rotate(calc(var(--sway-angle) * -1));
          }
          50% {
            transform: rotate(var(--sway-angle));
          }
        }
        @keyframes flarePulse {
          0%,95%,100% {
            filter: brightness(1);
          }
          97% {
            filter: brightness(1.06);
          }
        }
        @keyframes emberRise {
          0% {
            opacity: 0.8;
            transform: translate(0,0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(var(--ember-x), -20px) scale(0.3);
          }
        }
        @keyframes smokeDrift {
          0% {
            opacity: 0.5;
            transform: translate(0,0) scale(0.8);
          }
          100% {
            opacity: 0;
            transform: translate(var(--smoke-x), -24px) scale(1.1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .sway,
          .flicker,
          .flare,
          .ember,
          .smoke {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export type { EnergyLevel, EnergyFlameProps };

