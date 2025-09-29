import confetti, { type CreateTypes } from "canvas-confetti";

export type ParticleBurstOrigin = { x: number; y: number };

export interface ParticleBurstOptions {
  container: HTMLElement;
  origin: ParticleBurstOrigin;
  particleCount?: number;
  reducedMotion?: boolean;
  palette?: string[];
}

type ExtendedConfetti = typeof confetti & {
  shapeFromPath?: (path: string) => CreateTypes.Shape;
  shapeFromText?: (input: {
    text: string;
    scalar?: number;
    color?: string;
    fontFamily?: string;
  }) => CreateTypes.Shape;
};

const DEFAULT_COLORS = ["#1a6b52", "#22c55e", "#9ae6b4"];
const extendedConfetti = confetti as ExtendedConfetti;

let cachedShapes: {
  circle?: CreateTypes.Shape;
  xpGlyph?: CreateTypes.Shape;
  leaf?: CreateTypes.Shape;
} | null = null;

function ensureShapes() {
  if (cachedShapes) return cachedShapes;

  const shapes: typeof cachedShapes = {};

  if (extendedConfetti.shapeFromPath) {
    shapes.circle = extendedConfetti.shapeFromPath(
      "M 6 0 A 6 6 0 1 0 -6 0 A 6 6 0 1 0 6 0 Z"
    );
    shapes.leaf = extendedConfetti.shapeFromPath(
      "M 0 -7 C 5 -7, 7 -2, 0 7 C -7 -2, -5 -7, 0 -7 Z"
    );
  }

  if (extendedConfetti.shapeFromText) {
    shapes.xpGlyph = extendedConfetti.shapeFromText({
      text: "+XP",
      scalar: 0.85,
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    });
  }

  cachedShapes = shapes;
  return shapes;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function buildShapePool(): Array<CreateTypes.Shape | "circle" | "square"> {
  const shapes = ensureShapes();
  const pool: Array<CreateTypes.Shape | "circle" | "square"> = [];
  const circleShape = shapes.circle ?? "circle";
  const xpShape = shapes.xpGlyph ?? "square";
  const leafShape = shapes.leaf ?? "circle";

  for (let i = 0; i < 6; i += 1) pool.push(circleShape);
  for (let i = 0; i < 3; i += 1) pool.push(xpShape);
  for (let i = 0; i < 2; i += 1) pool.push(leafShape);

  return pool;
}

export function particleBurst({
  container,
  origin,
  particleCount,
  reducedMotion = false,
  palette = DEFAULT_COLORS,
}: ParticleBurstOptions): Promise<void> | void {
  if (typeof window === "undefined" || reducedMotion) {
    return;
  }

  if (!container) return;

  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const canvas = document.createElement("canvas");
  canvas.width = rect.width * (window.devicePixelRatio || 1);
  canvas.height = rect.height * (window.devicePixelRatio || 1);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.mixBlendMode = "screen";
  canvas.style.zIndex = "30";

  container.appendChild(canvas);

  const context = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  if (context) {
    context.scale(dpr, dpr);
  }

  const normalizedX = clamp((origin.x - rect.left) / Math.max(rect.width, 1), 0, 1);
  const normalizedY = clamp((origin.y - rect.top) / Math.max(rect.height, 1), 0, 1);

  const lowPower =
    typeof navigator !== "undefined" &&
    typeof navigator.hardwareConcurrency === "number" &&
    navigator.hardwareConcurrency > 0 &&
    navigator.hardwareConcurrency <= 4;

  const baseCount = particleCount ?? 70;
  const effectiveCount = lowPower
    ? Math.min(40, Math.max(24, Math.round(baseCount * 0.6)))
    : clamp(baseCount, 40, 80);

  const shapePool = buildShapePool();

  const create = confetti.create(canvas, {
    resize: false,
    useWorker: true,
  });

  const burst = create({
    particleCount: effectiveCount,
    spread: randomInRange(60, 90),
    startVelocity: randomInRange(35, 55),
    decay: 0.92,
    gravity: 0.9,
    ticks: Math.round(randomInRange(120, 180)),
    scalar: randomInRange(0.8, 1.2),
    origin: {
      x: normalizedX,
      y: normalizedY,
    },
    colors: palette,
    shapes: shapePool,
    drift: randomInRange(-1.2, 1.2),
  });

  return new Promise(resolve => {
    const cleanup = () => {
      requestAnimationFrame(() => {
        canvas.remove();
        resolve();
      });
    };

    if (burst && typeof (burst as PromiseLike<unknown>).then === "function") {
      (burst as PromiseLike<unknown>).then(cleanup, cleanup);
    } else {
      cleanup();
    }
  });
}

export default particleBurst;
