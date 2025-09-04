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
  scale: number;
  flickerDur: number; // seconds
  sway: number; // degrees
  swayDur: number; // seconds
  emberDur?: number; // seconds
  glow: string;
}

const LEVEL_CONFIG: Record<EnergyLevel, LevelConfig> = {
  NO: {
    scale: 1,
    flickerDur: 0,
    sway: 0,
    swayDur: 0,
    glow: "none",
  },
  LOW: {
    scale: 0.6,
    flickerDur: 1.2,
    sway: 2,
    swayDur: 2.4,
    glow: "drop-shadow(0 0 6px rgba(255,193,7,0.25))",
  },
  MEDIUM: {
    scale: 0.75,
    flickerDur: 1.1,
    sway: 3,
    swayDur: 2.2,
    emberDur: 2.5,
    glow: "drop-shadow(0 0 6px rgba(255,193,7,0.25))",
  },
  HIGH: {
    scale: 1,
    flickerDur: 0.9,
    sway: 4,
    swayDur: 1.8,
    emberDur: 1.8,
    glow: "drop-shadow(0 0 10px rgba(255,106,0,0.35))",
  },
  ULTRA: {
    scale: 1.15,
    flickerDur: 0.75,
    sway: 5,
    swayDur: 1.5,
    emberDur: 1,
    glow: "drop-shadow(0 0 14px rgba(255,106,0,0.35))",
  },
  EXTREME: {
    scale: 1.2,
    flickerDur: 0.7,
    sway: 6,
    swayDur: 1.4,
    emberDur: 2,
    glow:
      "drop-shadow(0 0 14px rgba(76,178,255,0.45)) drop-shadow(0 0 6px rgba(255,59,59,0.6))",
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

  const outerFill = monochrome
    ? "#A6A6A6"
    : level === "EXTREME"
    ? `url(#outerGradient-${id})`
    : "#FF6A00";
  const innerFill = monochrome
    ? "#D0D0D0"
    : level === "EXTREME"
    ? "#FF3B3B"
    : "#FFC107";
  const coreFill = monochrome ? "#F2F2F2" : "#FFE380";
  const glowFilter = monochrome
    ? "drop-shadow(0 0 10px rgba(153,102,204,0.45))"
    : cfg.glow;

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
        className="energy-flame"
      >
        <defs>
          {level === "EXTREME" && !monochrome && (
            <linearGradient id={`outerGradient-${id}`} x1="12" y1="2" x2="12" y2="22">
              <stop offset="0%" stopColor="#4CB2FF" />
              <stop offset="100%" stopColor="#2E7BEF" />
            </linearGradient>
          )}
        </defs>

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
                // CSS custom property for angle and duration
                "--sway-angle": `${cfg.sway}deg`,
                "--sway-duration": `${cfg.swayDur}s`,
              } as React.CSSProperties}
            >
              <g
                className={clsx("flicker", {
                  flare: level === "ULTRA",
                })}
                style={{
                  "--flicker-duration": `${cfg.flickerDur}s`,
                } as React.CSSProperties}
              >
                <path
                  d="M12.9633 2.28579C12.8416 2.12249 12.6586 2.01575 12.4565 1.9901C12.2545 1.96446 12.0506 2.02211 11.8919 2.14981C10.0218 3.65463 8.7174 5.83776 8.35322 8.32637C7.69665 7.85041 7.11999 7.27052 6.6476 6.61081C6.51764 6.42933 6.3136 6.31516 6.09095 6.29934C5.8683 6.28353 5.65017 6.36771 5.49587 6.529C3.95047 8.14442 3 10.3368 3 12.7497C3 17.7202 7.02944 21.7497 12 21.7497C16.9706 21.7497 21 17.7202 21 12.7497C21 9.08876 18.8143 5.93999 15.6798 4.53406C14.5706 3.99256 13.6547 3.21284 12.9633 2.28579Z"
                  fill={outerFill}
                />
                <path
                  d="M15.75 14.25C15.75 16.3211 14.0711 18 12 18C9.92893 18 8.25 16.3211 8.25 14.25C8.25 13.8407 8.31559 13.4467 8.43682 13.0779C9.06529 13.5425 9.78769 13.8874 10.5703 14.0787C10.7862 12.6779 11.4866 11.437 12.4949 10.5324C14.3321 10.7746 15.75 12.3467 15.75 14.25Z"
                  fill={innerFill}
                />
                <circle cx="12" cy="15" r="1.5" fill={coreFill} />
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
                cy="16"
                r="2"
                className="smoke"
                style={{
                  "--smoke-duration": `${8 + i * 2}s`,
                  "--smoke-delay": `${i * 1.5}s`,
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
            style={{
              "--ember-duration": `${cfg.emberDur}s`,
            } as React.CSSProperties}
          >
            {[0, 1, 2].map((i) => (
              <circle
                key={i}
                cx="12"
                cy="19"
                r="0.7"
                className="ember"
                style={{ animationDelay: `${i * (cfg.emberDur! / 3)}s` }}
                fill={monochrome ? "#D0D0D0" : "#FFE380"}
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
          animation: flarePulse 4s ease-in-out infinite;
        }
        .ember {
          animation: emberRise var(--ember-duration) linear infinite;
        }
        .smoke {
          animation: smokeDrift var(--smoke-duration) linear infinite;
          animation-delay: var(--smoke-delay);
        }
        @keyframes flameFlicker {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(0.98); }
        }
        @keyframes flameSway {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(var(--sway-angle)); }
        }
        @keyframes flarePulse {
          0%, 95%, 100% { opacity: 1; }
          97% { opacity: 1.05; }
        }
        @keyframes emberRise {
          0% { opacity: 0; transform: translateY(0) scale(1); }
          10% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-12px) scale(0.5); }
        }
        @keyframes smokeDrift {
          0% { opacity: 0; transform: translate(0,0) scale(0.8); }
          10% { opacity: 0.6; }
          100% { opacity: 0; transform: translate(2px,-14px) scale(1.4); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sway, .flicker, .ember, .smoke, .flare {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export type { EnergyLevel, EnergyFlameProps };
