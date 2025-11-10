"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Position = {
  x: number;
  y: number;
};

type Direction = Position;

const GRID_SIZE = 18;
const DEFAULT_SPEED = 160;

const createInitialSnake = (): Position[] => {
  const center = Math.floor(GRID_SIZE / 2);
  return [
    { x: center + 1, y: center },
    { x: center, y: center },
    { x: center - 1, y: center },
  ];
};

const getRandomPosition = (occupied: Position[]): Position => {
  const occupiedSet = new Set(occupied.map((segment) => `${segment.x}-${segment.y}`));

  if (occupiedSet.size >= GRID_SIZE * GRID_SIZE) {
    return occupied[0] ?? { x: 0, y: 0 };
  }

  let position: Position;

  do {
    position = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
  } while (occupiedSet.has(`${position.x}-${position.y}`));

  return position;
};

const directionForKey = (key: string): Direction | null => {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return { x: 0, y: -1 };
    case "ArrowDown":
    case "s":
    case "S":
      return { x: 0, y: 1 };
    case "ArrowLeft":
    case "a":
    case "A":
      return { x: -1, y: 0 };
    case "ArrowRight":
    case "d":
    case "D":
      return { x: 1, y: 0 };
    default:
      return null;
  }
};

export default function SnakePage() {
  const [snake, setSnake] = useState<Position[]>(() => createInitialSnake());
  const [direction, setDirection] = useState<Direction>({ x: 1, y: 0 });
  const [apple, setApple] = useState<Position>(() => getRandomPosition(createInitialSnake()));
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [isRunning, setIsRunning] = useState(true);
  const [gameOver, setGameOver] = useState(false);

  const snakeCells = useMemo(() => {
    return new Set(snake.map((segment) => `${segment.x}-${segment.y}`));
  }, [snake]);

  const resetGame = useCallback(() => {
    const initialSnake = createInitialSnake();
    setSnake(initialSnake);
    setDirection({ x: 1, y: 0 });
    setApple(getRandomPosition(initialSnake));
    setScore(0);
    setSpeed(DEFAULT_SPEED);
    setIsRunning(true);
    setGameOver(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === " " || event.key === "Enter") && gameOver) {
        event.preventDefault();
        resetGame();
        return;
      }

      const nextDirection = directionForKey(event.key);

      if (!nextDirection) {
        return;
      }

      setDirection((current) => {
        if (current.x === -nextDirection.x && current.y === -nextDirection.y) {
          return current;
        }

        return nextDirection;
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameOver, resetGame]);

  useEffect(() => {
    if (!isRunning || gameOver) {
      return;
    }

    const interval = window.setInterval(() => {
      setSnake((previousSnake) => {
        const currentDirection = direction;
        const head = previousSnake[0];
        const newHead = {
          x: head.x + currentDirection.x,
          y: head.y + currentDirection.y,
        };

        const hasHitWall =
          newHead.x < 0 ||
          newHead.x >= GRID_SIZE ||
          newHead.y < 0 ||
          newHead.y >= GRID_SIZE;

        const hasHitSelf = previousSnake.some(
          (segment) => segment.x === newHead.x && segment.y === newHead.y,
        );

        if (hasHitWall || hasHitSelf) {
          setIsRunning(false);
          setGameOver(true);
          return previousSnake;
        }

        const hasEatenApple = newHead.x === apple.x && newHead.y === apple.y;
        const nextSnake = [newHead, ...previousSnake];

        if (!hasEatenApple) {
          nextSnake.pop();
          return nextSnake;
        }

        setApple(getRandomPosition(nextSnake));
        setScore((previousScore) => {
          const updated = previousScore + 1;
          setHighScore((previousHighScore) => Math.max(previousHighScore, updated));
          return updated;
        });
        setSpeed((previousSpeed) => Math.max(70, previousSpeed - 5));

        return nextSnake;
      });
    }, speed);

    return () => window.clearInterval(interval);
  }, [apple, direction, gameOver, isRunning, speed]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-7.5rem)] w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Snake</h1>
          <p className="mt-1 max-w-xl text-sm text-white/70">
            Use the arrow keys or WASD to guide the snake. Eat the glowing apples to grow longer,
            and avoid colliding with the walls or yourself.
          </p>
        </div>
        <div className="flex items-center gap-6 rounded-lg border border-white/10 bg-white/5 px-6 py-3 text-white">
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-white/60">Score</p>
            <p className="text-2xl font-semibold">{score}</p>
          </div>
          <div className="h-10 w-px bg-white/10" aria-hidden="true" />
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-white/60">High Score</p>
            <p className="text-2xl font-semibold">{highScore}</p>
          </div>
        </div>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-xl rounded-2xl border border-white/10 bg-black/70 p-3 shadow-xl">
        <div
          className="grid h-full w-full gap-[2px] rounded-xl bg-[#0F172A] p-[2px]"
          style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, index) => {
            const x = index % GRID_SIZE;
            const y = Math.floor(index / GRID_SIZE);
            const isSnake = snakeCells.has(`${x}-${y}`);
            const isHead = snake[0]?.x === x && snake[0]?.y === y;
            const isApple = apple.x === x && apple.y === y;

            return (
              <div
                key={`${x}-${y}`}
                className={[
                  "aspect-square rounded-[4px] transition-colors duration-150",
                  isHead && !gameOver
                    ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]"
                    : isSnake
                      ? "bg-emerald-500/80"
                      : isApple
                        ? "bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.7)]"
                        : "bg-[#1E293B]",
                  gameOver && isHead ? "animate-pulse bg-rose-500" : "",
                ].join(" ")}
                aria-hidden="true"
              />
            );
          })}
        </div>

        {gameOver ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl bg-black/80 text-center text-white">
            <h2 className="text-2xl font-semibold">Game Over</h2>
            <p className="max-w-xs text-sm text-white/70">
              You scored {score} point{score === 1 ? "" : "s"}. Press Enter, Space, or the button below to try again.
            </p>
            <button
              onClick={resetGame}
              className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-black shadow-lg transition hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              Play again
            </button>
          </div>
        ) : null}
      </div>

      <div className="mx-auto max-w-xl rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
        <h3 className="text-base font-semibold text-white">Tips</h3>
        <ul className="mt-2 space-y-1 list-disc pl-5">
          <li>Planning ahead helps you avoid boxing yourself in as the snake grows.</li>
          <li>The snake speeds up slightly each time you eat an apple.</li>
          <li>You can restart instantly with the Space or Enter keys when the game ends.</li>
        </ul>
      </div>
    </div>
  );
}
