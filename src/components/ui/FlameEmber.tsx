import React, { CSSProperties, useId } from "react";
import clsx from "clsx";

export type EnergyLevel =
  | "NO"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "ULTRA"
  | "EXTREME";

interface FlameEmberProps {
  level: EnergyLevel;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: 16,
  md: 24,
  lg: 32,
};

interface FlameConfig {
  scale: number;
  flicker: number; // seconds
  flickerScale: number;
  tilt: number; // degrees
  glow: { blur: number; color: string; extra?: string; min: number; max: number };
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
    scale: 0.6,
    flicker: 1.2,
    flickerScale: 0.05,
    tilt: 2,
    glow: { blur: 6, color: "rgba(255,193,7,0.25)", min: 0.7, max: 1 },
    embers: 0,
    outer: ["#FFC107", "#FF6A00"],
    inner: ["#FFE380", "#FFC107"],
    core: "#FFE380",
    emberColor: "#FFE380",
  },
  MEDIUM: {
    scale: 0.75,
    flicker: 1.5,
    flickerScale: 0.1,
    tilt: 4,
    glow: { blur: 6, color: "rgba(255,193,7,0.25)", min: 0.5, max: 0.8 },
    embers: 1,
    outer: ["#FFC107", "#FF6A00"],
    inner: ["#FFE380", "#FFC107"],
    core: "#FFE380",
    emberColor: "#FFE380",
  },
  HIGH: {
    scale: 1,
    flicker: 1,
    flickerScale: 0.15,
    tilt: 6,
    glow: { blur: 10, color: "rgba(255,106,0,0.35)", min: 0.5, max: 0.9 },
    embers: 2,
    outer: ["#FFC107", "#FF6A00"],
    inner: ["#FFE380", "#FFC107"],
    core: "#FFE380",
    emberColor: "#FFE380",
  },
  ULTRA: {
    scale: 1.15,
    flicker: 0.7,
    flickerScale: 0.2,
    tilt: 8,
    glow: { blur: 14, color: "rgba(255,106,0,0.35)", min: 0.6, max: 1 },
    embers: 3,
    outer: ["#FFC107", "#FF6A00"],
    inner: ["#FFE380", "#FFC107"],
    core: "#FFE380",
    emberColor: "#FFE380",
  },
  EXTREME: {
    scale: 1.2,
    flicker: 0.5,
    flickerScale: 0.3,
    tilt: 12,
    glow: {
      blur: 14,
      color: "rgba(76,178,255,0.45)",
      extra: " drop-shadow(0 0 6px rgba(255,59,59,0.6))",
      min: 0.4,
      max: 1,
    },
    embers: 3,
    outer: ["#4CB2FF", "#2E7BEF"],
    inner: ["#FF3B3B", "#FF3B3B"],
    core: "#FFFFFF",
    emberColor: "#B3E5FF",
    flare: true,
  },
};

export function FlameEmber({
  level,
  size = "md",
  className,
}: FlameEmberProps) {
  const id = useId();
  const cfg = levelConfig[level];
  const px = sizeMap[size];

  const containerStyle: CSSProperties = { width: px, height: px };

  if (level === "NO") {
    return (
      <span
        aria-label="Energy: NO"
        role="img"
        className={clsx("inline-block relative", className)}
        style={containerStyle}
      >
        <svg
          width={px}
          height={px}
          viewBox="0 0 24 24"
          className="overflow-visible"
        >
          <circle cx="12" cy="18" r="2" fill="#555555" />
          <g className="ember-animate">
            {[0, 1, 2].map((i) => (
              <circle
                key={i}
                cx="12"
                cy="18"
                r="3"
                fill="#D0D0D0"
                style={
                  {
                    animation: `ember-smoke ${5 + i}s ease-in-out ${
                      i * 1.5
                    }s infinite`,
                    ["--sx" as string]: `${i % 2 ? 2 : -2}px`,
                  } as CSSProperties
                }
              />
            ))}
          </g>
          <style>{`
            @keyframes ember-smoke {
              0% { transform: translate(0,0) scale(0.8); opacity: .5; }
              100% { transform: translate(var(--sx), -24px) scale(1.1); opacity: 0; }
            }
            @media (prefers-reduced-motion: reduce) {
              .ember-animate { animation: none !important; }
            }
          `}</style>
        </svg>
      </span>
    );
  }

  if (!cfg) return null;

  const outerId = `outer-${id}`;
  const innerId = `inner-${id}`;

  const outerGrad = { start: cfg.outer[0], end: cfg.outer[1] };
  const innerGrad = { start: cfg.inner[0], end: cfg.inner[1] };
  const coreColor = cfg.core;
  const emberColor = cfg.emberColor;

  const glowFilter = `drop-shadow(0 0 ${cfg.glow.blur}px ${cfg.glow.color})${
    cfg.glow.extra || ""
  }`;
  // Slow down tilt relative to flicker to give a more premium, gentle motion
  const tiltDuration = cfg.flicker * 4;

  return (
    <span
      aria-label={`Energy: ${level}`}
      role="img"
      className={clsx("inline-block relative", className)}
      style={containerStyle}
    >
      <svg
        width={px}
        height={px}
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
          className="ember-animate"
          style={{
            transformOrigin: "50% 100%",
            transform: `scale(${cfg.scale})`,
            filter: glowFilter,
            animation: `ember-glow ${cfg.flicker * 2}s ease-in-out infinite`,
          }}
        >
          <g
            className="ember-animate"
            style={{
              transformOrigin: "50% 100%",
              animation: `ember-tilt ${tiltDuration}s ease-in-out infinite`,
              animationDelay: `-${tiltDuration / 2}s`,
              ["--tilt" as string]: `${cfg.tilt}deg`,
            }}
          >
            <g
              className="ember-animate"
              style={{
                transformOrigin: "50% 100%",
                animation: `ember-flicker ${cfg.flicker}s ease-in-out infinite`,
                animationDelay: `-${cfg.flicker / 3}s`,
                ["--flicker" as string]: cfg.flickerScale,
              }}
            >
              <path
                d="M12 2C8 6 7 9 7 13c0 4 3 7 5 9 2-2 5-5 5-9 0-4-1-7-5-11z"
                fill={`url(#${outerId})`}
                className={cfg.flare ? "ember-animate ember-flare" : undefined}
                style={
                  cfg.flare
                    ? ({
                        animation: `ember-flare 4s ease-in-out infinite`,
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
                  className="ember-animate"
                  style={
                    {
                      animation: `ember-rise ${cfg.flicker + 0.9}s linear ${
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
          @keyframes ember-flicker {
            0%,100% { transform: scaleY(calc(1 - var(--flicker))); }
            50% { transform: scaleY(calc(1 + var(--flicker))); }
          }
          @keyframes ember-tilt {
            0% { transform: rotate(calc(var(--tilt) * -1)); }
            50% { transform: rotate(var(--tilt)); }
            100% { transform: rotate(calc(var(--tilt) * -1)); }
          }
          @keyframes ember-flare {
            0%,95% { filter: brightness(1); }
            100% { filter: brightness(1.06); }
          }
          @keyframes ember-rise {
            0% { transform: translate(0,0); opacity: .8; }
            100% { transform: translate(var(--dx), -20px); opacity: 0; }
          }
          @keyframes ember-glow {
            0%,100% { opacity: ${cfg.glow.min}; }
            50% { opacity: ${cfg.glow.max}; }
          }
          @media (prefers-reduced-motion: reduce) {
            .ember-animate { animation: none !important; }
          }
        `}</style>
      </svg>
    </span>
  );
}

