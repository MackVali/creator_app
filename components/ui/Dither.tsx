"use client";
import { useRef, useEffect } from "react";

export interface DitherProps {
  waveColor?: [number, number, number];
  disableAnimation?: boolean;
  enableMouseInteraction?: boolean;
  mouseRadius?: number;
  colorNum?: number;
  waveAmplitude?: number;
  waveFrequency?: number;
  waveSpeed?: number;
}

export default function Dither({
  waveColor = [0.5, 0.5, 0.5],
  disableAnimation = false,
  enableMouseInteraction = false,
  mouseRadius = 0.2,
  colorNum = 4,
  waveAmplitude = 0.3,
  waveFrequency = 3,
  waveSpeed = 0.05,
}: DitherProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrame: number;
    const size = 160; // lower resolution for performance

    function resize() {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = size;
      canvas.height = size * (height / width);
      ctx.imageSmoothingEnabled = false;
      draw(0);
    }

    function draw(t: number) {
      const w = canvas.width;
      const h = canvas.height;
      const data = ctx.createImageData(w, h);
      const pixels = data.data;
      const tNorm = t * waveSpeed / 1000;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          let value = 0;
          value += Math.sin((x / w + tNorm) * Math.PI * 2 * waveFrequency);
          value += Math.sin((y / h + tNorm) * Math.PI * 2 * waveFrequency);
          value *= waveAmplitude;
          value = (value + 1) / 2; // normalize 0-1

          if (enableMouseInteraction) {
            const dx = x / w - pointer.current.x;
            const dy = y / h - pointer.current.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < mouseRadius) {
              value = 1;
            }
          }

          const level = Math.floor(value * colorNum) / (colorNum - 1);
          const r = Math.min(255, waveColor[0] * 255 * level);
          const g = Math.min(255, waveColor[1] * 255 * level);
          const b = Math.min(255, waveColor[2] * 255 * level);
          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = 255;
        }
      }
      ctx.putImageData(data, 0, 0);
      if (!disableAnimation) {
        animationFrame = requestAnimationFrame(draw);
      }
    }

    resize();
    window.addEventListener("resize", resize);
    if (enableMouseInteraction) {
      const move = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        pointer.current.x = (e.clientX - rect.left) / rect.width;
        pointer.current.y = (e.clientY - rect.top) / rect.height;
      };
      window.addEventListener("mousemove", move);
      return () => {
        window.removeEventListener("resize", resize);
        window.removeEventListener("mousemove", move);
        cancelAnimationFrame(animationFrame);
      };
    }

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrame);
    };
  }, [
    waveColor,
    disableAnimation,
    enableMouseInteraction,
    mouseRadius,
    colorNum,
    waveAmplitude,
    waveFrequency,
    waveSpeed,
  ]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />;
}

