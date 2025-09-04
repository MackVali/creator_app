import React, { CSSProperties } from "react";
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

// color tokens
const colors = {
  emberOrange: "#FF6A00",
  amber: "#FFC107",
  yellow: "#FFE380",
  hotBlue: "#4CB2FF",
  sapphire: "#2E7BEF",
  coreRed: "#FF3B3B",
  grayDark: "#A6A6A6",
  grayLight: "#D0D0D0",
  gemPurple: "#9966CC",
};

const levelConfig: Record<EnergyLevel, { scale: number; flicker: number; sway: number; rotate: number; embers: number; glow: { blur: number; color: string } | null }> = {
  NO: { scale: 0.6, flicker: 0, sway: 0, rotate: 0, embers: 0, glow: null },
  LOW: {
    scale: 0.6,
    flicker: 1.2,
    sway: 2.4,
    rotate: 2,
    embers: 0,
    glow: { blur: 6, color: "rgba(255,193,7,0.25)" },
  },
  MEDIUM: {
    scale: 0.75,
    flicker: 1.1,
    sway: 2.2,
    rotate: 3,
    embers: 1,
    glow: { blur: 6, color: "rgba(255,193,7,0.25)" },
  },
  HIGH: {
    scale: 1,
    flicker: 0.9,
    sway: 1.8,
    rotate: 4,
    embers: 2,
    glow: { blur: 10, color: "rgba(255,106,0,0.35)" },
  },
  ULTRA: {
    scale: 1.15,
    flicker: 0.75,
    sway: 1.5,
    rotate: 5,
    embers: 3,
    glow: { blur: 14, color: "rgba(255,106,0,0.35)" },
  },
  EXTREME: {
    scale: 1.2,
    flicker: 0.7,
    sway: 1.4,
    rotate: 6,
    embers: 1,
    glow: {
      blur: 14,
      color: "rgba(76,178,255,0.45)",
    },
  },
};

export function EnergyFlame({
  level,
  size = 24,
  className,
  monochrome = false,
}: EnergyFlameProps) {
  const cfg = levelConfig[level];
  const outerColor = monochrome
    ? colors.grayLight
    : level === "EXTREME"
    ? `url(#grad)`
    : colors.emberOrange;
  const innerColor = monochrome
    ? colors.grayDark
    : level === "EXTREME"
    ? colors.coreRed
    : level === "LOW"
    ? colors.amber
    : level === "MEDIUM"
    ? colors.yellow
    : colors.amber;

  const glowColor = monochrome
    ? colors.gemPurple
    : cfg.glow?.color;

  const containerStyle: CSSProperties = {
    width: size,
    height: size,
  };

  const flameStyle: CSSProperties = {
    transformOrigin: "50% 100%",
    transform: `scale(${cfg.scale})`,
    animation:
      cfg.flicker > 0
        ? `energy-flame-flicker ${cfg.flicker}s ease-in-out infinite alternate, energy-flame-sway ${cfg.sway}s ease-in-out infinite alternate`
        : undefined,
    filter: glowColor ? `drop-shadow(0 0 ${cfg.glow?.blur}px ${glowColor})` : undefined,
  };

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
        fill="none"
        className="overflow-visible"
      >
        {level === "NO" ? (
          <g className="energy-animate">
            {[0, 1, 2].map((i) => (
              <circle
                key={i}
                cx="12"
                cy="18"
                r="3"
                fill={monochrome ? colors.grayDark : colors.grayLight}
                style={{
                  animation: `energy-smoke-drift 8s ease-in-out ${i * 1.5}s infinite`,
                } as CSSProperties}
              />
            ))}
          </g>
        ) : (
          <g className="energy-animate" style={flameStyle}>
            {level === "EXTREME" && !monochrome && (
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.hotBlue} />
                  <stop offset="100%" stopColor={colors.sapphire} />
                </linearGradient>
              </defs>
            )}
            <path
              d="M12 2C9 4 7 8 7 12c0 5 5 9 5 9s5-4 5-9c0-4-2-8-5-10z"
              fill={outerColor}
            />
            <path
              d="M12 6c-1.5 1.5-2.5 3.5-2.5 5.5 0 3 2.5 5.5 2.5 5.5s2.5-2.5 2.5-5.5c0-2-1-4-2.5-5.5z"
              fill={innerColor}
            />
            {level === "EXTREME" && !monochrome && (
              <circle cx="12" cy="11" r="1" fill="#fff" />
            )}
            {cfg.embers > 0 && (
              <g>
                {[...Array(cfg.embers)].map((_, i) => (
                  <circle
                    key={i}
                    cx="12"
                    cy="20"
                    r="0.8"
                    fill={monochrome ? colors.grayLight : colors.yellow}
                    style={{
                      animation: `energy-ember-rise 2s linear ${i * 0.5}s infinite`,
                    } as CSSProperties}
                  />
                ))}
              </g>
            )}
          </g>
        )}
        <style>{`
          @keyframes energy-flame-flicker {
            from { transform: scale(0.98); }
            to { transform: scale(1.02); }
          }
          @keyframes energy-flame-sway {
            from { transform: rotate(-${cfg.rotate}deg); }
            to { transform: rotate(${cfg.rotate}deg); }
          }
          @keyframes energy-ember-rise {
            0% { transform: translateY(0) scale(1); opacity: 0.8; }
            100% { transform: translateY(-16px) scale(0.5); opacity: 0; }
          }
          @keyframes energy-smoke-drift {
            0% { transform: translateY(0) translateX(0); opacity: 0.5; }
            100% { transform: translateY(-20px) translateX(-4px); opacity: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .energy-animate { animation: none !important; }
          }
        `}</style>
      </svg>
    </span>
  );
}

