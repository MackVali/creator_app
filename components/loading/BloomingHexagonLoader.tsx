"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type BloomingHexagonLoaderProps = {
  statusText?: string;
  ariaLabel?: string;
  className?: string;
};

const DPR_LIMIT = 2;
const REDUCED_MOTION_FRAME_TIME = 1800;

function drawHexagon(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  orientation: number
) {
  context.beginPath();

  for (let vertex = 0; vertex < 6; vertex += 1) {
    const angle = orientation + vertex * (Math.PI / 3);
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    if (vertex === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.closePath();
}

function drawFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  reducedMotion: boolean
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.hypot(width, height) * 0.62;
  const orientation = reducedMotion
    ? Math.PI / 6
    : Math.PI / 6 + time * 0.00008;
  const inc = reducedMotion
    ? 24
    : 2 + Math.abs(Math.sin(time * 0.0004)) * 40;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#020303";
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    maxRadius * 0.72
  );
  glow.addColorStop(0, "rgba(15, 118, 90, 0.13)");
  glow.addColorStop(0.38, "rgba(64, 15, 28, 0.09)");
  glow.addColorStop(1, "rgba(2, 3, 3, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.lineJoin = "round";
  context.lineCap = "round";

  for (let radius = maxRadius; radius > 22; radius -= inc) {
    const normalized = radius / maxRadius;
    const wave = Math.sin(radius * 0.025 + time * 0.0009);
    const alpha = 0.025 + (1 - normalized) * 0.1 + Math.abs(wave) * 0.035;
    const emerald = 70 + Math.round((1 - normalized) * 50);
    const crimson = 38 + Math.round(Math.abs(wave) * 28);

    drawHexagon(
      context,
      centerX,
      centerY,
      radius,
      orientation + radius * 0.0008
    );

    context.lineWidth = Math.max(0.7, Math.min(2.4, radius * 0.0025));
    context.strokeStyle = `rgba(${crimson}, ${emerald}, ${76 + crimson}, ${alpha})`;
    context.stroke();
  }

  context.beginPath();
  context.arc(centerX, centerY, Math.min(width, height) * 0.14, 0, Math.PI * 2);
  const core = context.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    Math.min(width, height) * 0.18
  );
  core.addColorStop(0, "rgba(255, 255, 255, 0.05)");
  core.addColorStop(0.45, "rgba(20, 83, 45, 0.06)");
  core.addColorStop(1, "rgba(2, 3, 3, 0)");
  context.fillStyle = core;
  context.fill();
}

export function BloomingHexagonLoader({
  statusText = "Building your system",
  ariaLabel = statusText,
  className,
}: BloomingHexagonLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    let animationFrame = 0;
    let renderedStaticFrame = false;
    let reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      renderedStaticFrame = false;
    };

    const render = (time: number) => {
      if (reducedMotion) {
        if (!renderedStaticFrame) {
          drawFrame(
            context,
            canvas.width,
            canvas.height,
            REDUCED_MOTION_FRAME_TIME,
            true
          );
          renderedStaticFrame = true;
        }
        return;
      }

      drawFrame(context, canvas.width, canvas.height, time, false);
      animationFrame = window.requestAnimationFrame(render);
    };

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      renderedStaticFrame = false;
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(render);
    };

    resize();
    animationFrame = window.requestAnimationFrame(render);
    window.addEventListener("resize", resize);
    motionQuery.addEventListener("change", handleMotionPreference);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      motionQuery.removeEventListener("change", handleMotionPreference);
    };
  }, []);

  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className={cn(
        "fixed inset-0 z-50 min-h-dvh overflow-hidden bg-[#020303] text-zinc-100",
        className
      )}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
      />
      <div className="pointer-events-none relative z-10 flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <div className="rounded-lg border border-white/10 bg-black/30 px-7 py-6 shadow-[0_22px_80px_rgba(0,0,0,0.55)] backdrop-blur-md">
          <div className="text-[2rem] font-black uppercase leading-none text-zinc-50 sm:text-[2.65rem]">
            CREATOR
          </div>
          <div className="mt-4 text-xs font-semibold uppercase text-emerald-100/70">
            {statusText}
          </div>
        </div>
      </div>
    </div>
  );
}
