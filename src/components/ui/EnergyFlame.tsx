import React, { CSSProperties, useId } from "react";
import clsx from "clsx";

export type EnergyLevel =
  | "NO"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "ULTRA"
  | "EXTREME";

interface EnergyFlameProps {
  level: EnergyLevel;
  size?: number;
  className?: string;
  monochrome?: boolean;
}

const colors = {
  gemPurple: "#9966CC",
  grayLight: "#D0D0D0",
  grayDark: "#A6A6A6",
};

interface FlameConfig {
  scale: number;
  flicker: number; // seconds
  flickerScale: number;
  sway: number; // degrees
  glow: { blur: number; color: string; extra?: string };
  embers: number;
  outer: [string, string];
  inner: [string, string];
  core: string;
  emberColor: string;
  flare?: boolean;
}

const levelConfig: Record<EnergyLevel, FlameConfig | null> = {
  NO: null,
  LOW: {
    scale: 16 / 24,
    flicker: 1.2,
    flickerScale: 0.02,
    sway: 2,
    glow: { blur: 6, color: "rgba(255,193,7,0.18)" },
    embers: 0,
    outer: ["#FFC66D", "#FF8A3D"],
    inner: ["#FFE0A3", "#FFC66D"],
    core: "#FFF2B3",
    emberColor: "#FFE380",
  },
  MEDIUM: {
    scale: 18 / 24,
    flicker: 1.05,
    flickerScale: 0.03,
    sway: 3,
    glow: { blur: 8, color: "rgba(255,140,0,0.22)" },
    embers: 1,
    outer: ["#FFB347", "#FF6A00"],
    inner: ["#FFD28C", "#FF9D2E"],
    core: "#FFF2B3",
    emberColor: "#FFE380",
  },
  HIGH: {
    scale: 1,
    flicker: 0.9,
    flickerScale: 0.04,
    sway: 4,
    glow: { blur: 10, color: "rgba(255,90,0,0.28)" },
    embers: 2,
    outer: ["#FF9D2E", "#FF4600"],
    inner: ["#FFC46D", "#FF7A1A"],
    core: "#FFF2B3",
    emberColor: "#FFE380",
  },
  ULTRA: {
    scale: 1.15,
    flicker: 0.75,
    flickerScale: 0.05,
    sway: 5,
    glow: { blur: 14, color: "rgba(255,70,0,0.35)" },
    embers: 3,
    outer: ["#FFB000", "#FF2D00"],
    inner: ["#FFD166", "#FF6600"],
    core: "#FFF2B3",
    emberColor: "#FFE380",
    flare: true,
  },
  EXTREME: {
    scale: 1.2,
    flicker: 0.7,
    flickerScale: 0.05,
    sway: 6,
    glow: {
      blur: 14,
      color: "rgba(76,178,255,0.45)",
      extra: " drop-shadow(0 0 8px rgba(255,59,59,0.55))",
    },
    embers: 1,
    outer: ["#4CB2FF", "#2E7BEF"],
    inner: ["#FF5A5A", "#FFA1A1"],
    core: "#FFFFFF",
    emberColor: "#B3E5FF",
    flare: true,
  },
};

export function EnergyFlame({
  level,
  size = 24,
  className,
  monochrome = false,
}: EnergyFlameProps) {
  const id = useId();
  const cfg = levelConfig[level];

  const containerStyle: CSSProperties = { width: size, height: size };

  if (level === "NO") {
    return (
      <span
        aria-label="Energy: NO"
        role="img"
        className={clsx("inline-block relative", className)}
        style={containerStyle}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          className="overflow-visible"
        >
          <g className="energy-animate">
            {[0, 1, 2].map((i) => (
              <circle
                key={i}
                cx="12"
                cy="18"
                r="3"
                fill={monochrome ? colors.grayDark : colors.grayLight}
                style={
                  {
                    animation: `energy-smoke-drift ${5 + i}s ease-in-out ${
                      i * 1.5
                    }s infinite`,
                    ["--sx" as string]: `${i % 2 ? 2 : -2}px`,
                  } as CSSProperties
                }
              />
            ))}
          </g>
          <style>{`
            @keyframes energy-smoke-drift {
              0% { transform: translate(0,0) scale(0.8); opacity: .5; }
              100% { transform: translate(var(--sx), -24px) scale(1.1); opacity: 0; }
            }
            @media (prefers-reduced-motion: reduce) {
              .energy-animate { animation: none !important; }
            }
          `}</style>
        </svg>
      </span>
    );
  }

  if (!cfg) return null;

  const outerId = `outer-${id}`;
  const innerId = `inner-${id}`;

  const outerGrad = monochrome
    ? { start: colors.grayLight, end: colors.grayDark }
    : { start: cfg.outer[0], end: cfg.outer[1] };
  const innerGrad = monochrome
    ? { start: colors.grayDark, end: "#666666" }
    : { start: cfg.inner[0], end: cfg.inner[1] };
  const coreColor = monochrome ? colors.grayLight : cfg.core;
  const emberColor = monochrome ? colors.grayLight : cfg.emberColor;

  const glowFilter = monochrome
    ? `drop-shadow(0 0 ${cfg.glow.blur}px ${colors.gemPurple})`
    : `drop-shadow(0 0 ${cfg.glow.blur}px ${cfg.glow.color})${
        cfg.glow.extra || ""
      }`;

  const swayDuration = cfg.flicker * 2;

  return (
    <span
      aria-label={`Energy: ${level}`}
      role="img"
      className={clsx("inline-block relative", className)}
      style={containerStyle}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={outerId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={outerGrad.start} />
            <stop offset="100%" stopColor={outerGrad.end} />
          </linearGradient>
          <linearGradient id={innerId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={innerGrad.start} />
            <stop offset="100%" stopColor={innerGrad.end} />
          </linearGradient>
        </defs>
        <g
          style={{
            transformOrigin: "50% 100%",
            transform: `scale(${cfg.scale})`,
            filter: glowFilter,
          }}
        >
          <g
            className="energy-animate"
            style={{
              transformOrigin: "50% 100%",
              animation: `energy-flame-sway ${swayDuration}s ease-in-out infinite`,
              animationDelay: `-${cfg.flicker / 2}s`,
            }}
          >
            <g
              className="energy-animate"
              style={{
                transformOrigin: "50% 100%",
                animation: `energy-flame-flicker ${cfg.flicker}s ease-in-out infinite`,
                animationDelay: `-${cfg.flicker / 3}s`,
              }}
            >
              <path
                d="M12 2C8 6 7 9 7 13c0 4 3 7 5 9 2-2 5-5 5-9 0-4-1-7-5-11z"
                fill={`url(#${outerId})`}
                className={cfg.flare ? "energy-animate energy-flare" : undefined}
                style={
                  cfg.flare
                    ? ({
                        animation: `energy-flare 4s ease-in-out infinite`,
                      } as CSSProperties)
                    : undefined
                }
              />
              <path
                d="M12 6c-1.8 2-2.5 4-2.5 6 0 3 2.5 5 2.5 5s2.5-2 2.5-5c0-2-.7-4-2.5-6z"
                fill={`url(#${innerId})`}
              />
              <path
                d="M12 11c-.8 1-1 2-1 3 0 1.5 1 2.5 1 2.5s1-1 1-2.5c0-1-.2-2-1-3z"
                fill={coreColor}
              />
            </g>
          </g>
          {cfg.embers > 0 && (
            <g>
              {Array.from({ length: Math.min(cfg.embers, 3) }).map((_, i) => (
                <circle
                  key={i}
                  cx="12"
                  cy="20"
                  r="0.8"
                  fill={emberColor}
                  className="energy-animate"
                  style={
                    {
                      animation: `energy-ember-rise ${cfg.flicker + 0.9}s linear ${
                        i * 0.5
                      }s infinite`,
                      ["--dx" as string]: `${i % 2 ? 3 : -3}px`,
                    } as CSSProperties
                  }
                />
              ))}
            </g>
          )}
        </g>
        <style>{`
          @keyframes energy-flame-flicker {
            0%,100% { transform: scale(${1 - cfg.flickerScale}); }
            50% { transform: scale(${1 + cfg.flickerScale}); }
          }
          @keyframes energy-flame-sway {
            0% { transform: rotate(-${cfg.sway}deg); }
            50% { transform: rotate(${cfg.sway}deg); }
            100% { transform: rotate(-${cfg.sway}deg); }
          }
          @keyframes energy-flare {
            0%,95% { filter: brightness(1); }
            100% { filter: brightness(1.06); }
          }
          @keyframes energy-ember-rise {
            0% { transform: translate(0,0); opacity: .8; }
            100% { transform: translate(var(--dx), -20px); opacity: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .energy-animate { animation: none !important; }
          }
        `}</style>
      </svg>
    </span>
  );
}

