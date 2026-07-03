"use client";

import { useEffect, useRef } from "react";

type BloomingHexagonLoaderProps = {
  className?: string;
  statusText?: string;
  ariaLabel?: string;
  "aria-label"?: string;
};

const TAU = Math.PI * 2;
const HEX_SIDES = 6;
const DESIGN_BASE_RADIUS = 520;
const DESIGN_MIN_RADIUS = 8;
const ORIENTATION_STEP = 0.012;
const BLOOM_SPEED = 0.00135;
const BASE_INCREMENT = 1.5;
const BLOOM_INCREMENT = 56;
const TWIST_DIVISOR = 430;
const START_PHASE_MS = 900;
const FRAME_INTERVAL_MS = 1000 / 30;
const MAX_DEVICE_PIXEL_RATIO = 2;

const hexAngles = Array.from(
  { length: HEX_SIDES },
  (_, index) => (index + 1) * (TAU / HEX_SIDES)
);

function drawHexagon(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  orientation: number
) {
  const vertexDistance = radius / 2;

  context.beginPath();

  for (let index = 0; index < HEX_SIDES; index += 1) {
    const angle = orientation + hexAngles[index];
    const x = centerX + Math.cos(angle) * vertexDistance;
    const y = centerY + Math.sin(angle) * vertexDistance;

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.closePath();
  context.fill();
}

export function BloomingHexagonLoader({
  className,
  statusText,
  ariaLabel,
  "aria-label": ariaLabelAttribute,
}: BloomingHexagonLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
      return;
    }

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let orientation = 0;
    let lastRenderTime = 0;

    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const resizeCanvas = () => {
      const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        MAX_DEVICE_PIXEL_RATIO
      );

      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = Math.max(1, Math.floor(width * pixelRatio));
      canvas.height = Math.max(1, Math.floor(height * pixelRatio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.imageSmoothingEnabled = true;
    };

    const drawFrame = (timeMs: number) => {
      const centerX = width / 2;
      const centerY = height / 2;

      context.fillStyle = "rgb(0, 0, 0)";
      context.fillRect(0, 0, width, height);

      if (!reduceMotion) {
        orientation = (orientation + ORIENTATION_STEP) % TAU;
      }

      const bloomTime = reduceMotion ? START_PHASE_MS : timeMs + START_PHASE_MS;
      const inc =
        BASE_INCREMENT +
        Math.abs(Math.sin(bloomTime * BLOOM_SPEED)) * BLOOM_INCREMENT;

      const effectScale = Math.min(
        3.2,
        Math.max(1.35, (Math.max(width, height) * 1.18) / DESIGN_BASE_RADIUS)
      );

      context.save();
      context.translate(centerX, centerY);
      context.scale(effectScale, effectScale);

      for (
        let radius = DESIGN_BASE_RADIUS;
        radius >= DESIGN_MIN_RADIUS;
        radius -= inc
      ) {
        const animatedRadius = reduceMotion
          ? radius
          : radius + Math.sin(bloomTime * 0.002 + radius * 0.045) * 1.75;
        const originalValue = Math.max(0, Math.min(255, 255 - radius / 2));
        const normalizedValue = originalValue / 255;
        const charcoalValue = Math.pow(normalizedValue, 1.08);
        const gray = Math.max(
          3,
          Math.min(68, Math.round(4 + charcoalValue * 64))
        );

        context.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;

        drawHexagon(
          context,
          0,
          0,
          animatedRadius,
          orientation + radius * (Math.PI / TWIST_DIVISOR)
        );
      }

      context.restore();
    };

    const renderFrame = (timeMs: number) => {
      if (timeMs - lastRenderTime >= FRAME_INTERVAL_MS) {
        lastRenderTime = timeMs;
        drawFrame(timeMs);
      }

      if (!reduceMotion) {
        animationFrame = window.requestAnimationFrame(renderFrame);
      }
    };

    resizeCanvas();
    drawFrame(0);

    if (!reduceMotion) {
      animationFrame = window.requestAnimationFrame(renderFrame);
    }

    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);

      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

  return (
    <div
      aria-label={ariaLabelAttribute ?? ariaLabel ?? statusText ?? "Loading"}
      className={className}
      role="status"
      style={{
        background: "#000000",
        height: "100dvh",
        inset: 0,
        overflow: "hidden",
        position: "fixed",
        width: "100vw",
        zIndex: 50,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          display: "block",
          height: "100%",
          width: "100%",
        }}
      />
    </div>
  );
}

export default BloomingHexagonLoader;
