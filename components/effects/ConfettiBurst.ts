import confetti from "canvas-confetti";

type ConfettiShape = string | ((ctx: CanvasRenderingContext2D) => void);

export interface ConfettiBurstOptions {
  originClient: { x: number; y: number };
  colors?: string[];
  count?: number;
  shapes?: ConfettiShape[];
}

type ConfettiModule = typeof confetti & {
  shapeFromText?: (options: { text: string; scalar?: number }) => ConfettiShape;
  shapeFromPath?: (options: {
    path: string;
    scalar?: number;
  }) => ConfettiShape;
};

let cachedXpShape: ConfettiShape | null = null;
let cachedShardShape: ConfettiShape | null = null;

const DEFAULT_COLORS = ["#22ff88", "#1a6b52", "#9ae6b4"];

function ensureShapes(module: ConfettiModule): { xp: ConfettiShape; shard: ConfettiShape } {
  if (cachedXpShape && cachedShardShape) {
    return { xp: cachedXpShape, shard: cachedShardShape };
  }

  const xpShape =
    module.shapeFromText?.({ text: "+XP", scalar: 0.7 }) ??
    ((ctx: CanvasRenderingContext2D) => {
      ctx.font = "10px sans-serif";
      ctx.fillText("+XP", -8, 3);
    });

  const shardPath = "M0 0 L6 1 L4 6 L-1 5 Z";
  const shardShape =
    module.shapeFromPath?.({ path: shardPath, scalar: 0.5 }) ??
    ((ctx: CanvasRenderingContext2D) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(6, 1);
      ctx.lineTo(4, 6);
      ctx.lineTo(-1, 5);
      ctx.closePath();
      ctx.fill();
    });

  cachedXpShape = xpShape;
  cachedShardShape = shardShape;
  return { xp: xpShape, shard: shardShape };
}

export function fireConfettiBurst(options: ConfettiBurstOptions): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  const module = confetti as ConfettiModule;
  const { xp, shard } = ensureShapes(module);

  const count = Math.max(20, Math.min(options.count ?? 60, 120));
  const shapes = options.shapes ?? ["circle", xp, shard];
  const colors = options.colors ?? DEFAULT_COLORS;

  const origin = {
    x: options.originClient.x / window.innerWidth,
    y: options.originClient.y / window.innerHeight,
  };

  return module({
    particleCount: count,
    spread: 75,
    startVelocity: 45,
    gravity: 0.9,
    ticks: 150,
    scalar: 1,
    colors,
    shapes,
    origin,
  }) as Promise<void>;
}

export default fireConfettiBurst;
