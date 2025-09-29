"use client";

import React, {
  ForwardedRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import voronoiCrackFragment from "@/lib/shaders/voronoiCrack.frag";

export interface LavaCrackOverlayHandle {
  playCrack: () => Promise<void>;
  explode: (origin: { x: number; y: number }) => Promise<void>;
  teardown: () => void;
}

export interface LavaCrackOverlayProps {
  className?: string;
}

type Mode = "idle" | "pixi" | "svg";

type PixiContext = {
  app: any;
  crackFilter: any;
  crackSprite: any;
  shardsContainer: any;
  textures: any[];
  SpriteCtor: any;
  timeTicker?: (delta: number) => void;
};

type SvgHandle = {
  playCrack: () => Promise<void>;
  explode: (origin: { x: number; y: number }) => Promise<void>;
  teardown: () => void;
};

const CRACK_DURATION = 360;
const EXPLOSION_DURATION = 520;
const GLOW_PULSE_INTERVAL = 180;

function canUseWebGL(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
    );
  } catch (error) {
    return false;
  }
}

const LavaCrackOverlay = forwardRef(
  (
    { className }: LavaCrackOverlayProps,
    ref: ForwardedRef<LavaCrackOverlayHandle>
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const pixiRef = useRef<PixiContext | null>(null);
    const svgRef = useRef<SvgHandle | null>(null);
    const [mode, setMode] = useState<Mode>("idle");

    useEffect(() => {
      if (typeof window === "undefined") {
        return;
      }

      if (!canUseWebGL()) {
        setMode("svg");
        return;
      }

      let cancelled = false;

      const init = async () => {
        const pixi = await import("pixi.js");
        const {
          Application,
          Sprite,
          Texture,
          Container,
          Graphics,
          Filter,
        } = pixi as any;

        if (!containerRef.current || cancelled) {
          return;
        }

        const app = new Application();
        await app.init({
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resizeTo: containerRef.current,
        });

        const canvas: HTMLCanvasElement =
          app.canvas ?? app.view ?? app.renderer?.view;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        containerRef.current.appendChild(canvas);

        const crackSprite = new Sprite(Texture.WHITE);
        const resolution = app.renderer.resolution ?? 1;
        crackSprite.width = app.renderer.width / resolution;
        crackSprite.height = app.renderer.height / resolution;
        crackSprite.alpha = 0;

        const uniforms = {
          u_time: 0,
          u_progress: 0,
          u_glow: 0,
          u_resolution: {
            x: crackSprite.width,
            y: crackSprite.height,
          },
          u_seed: Math.random() * 8,
        };

        const crackFilter = new Filter(undefined, voronoiCrackFragment, uniforms);
        crackSprite.filters = [crackFilter];

        const shardsContainer = new Container();
        shardsContainer.visible = false;

        app.stage.addChild(crackSprite);
        app.stage.addChild(shardsContainer);

        const textures: any[] = [];
        const baseColors = [0x0b0f0e, 0x101513, 0x18231f];

        for (let i = 0; i < 3; i += 1) {
          const g = new Graphics();
          g.beginFill(baseColors[i], 0.95);
          g.lineStyle(1, 0x1a6b52, 0.9);
          g.moveTo(0, 0);
          g.lineTo(6 + i * 1.2, 1 + i * 0.6);
          g.lineTo(3 + i * 0.8, 6 + i * 1.1);
          g.closePath();
          const texture = app.renderer.generateTexture(g);
          g.destroy();
          textures.push(texture);
        }

        const timeTicker = (delta: number) => {
          uniforms.u_time += (delta / 60) * 0.5;
        };
        app.ticker.add(timeTicker);

        pixiRef.current = {
          app,
          crackFilter,
          crackSprite,
          shardsContainer,
          textures,
          SpriteCtor: Sprite,
          timeTicker,
        };

        setMode("pixi");
      };

      init();

      return () => {
        cancelled = true;
        if (pixiRef.current) {
          const { app, timeTicker } = pixiRef.current;
          if (timeTicker) {
            app.ticker.remove(timeTicker);
          }
          app.destroy(true, { children: true, texture: true, baseTexture: true });
          pixiRef.current = null;
        }
      };
    }, []);

    useEffect(() => {
      if (mode !== "svg") {
        return;
      }

      const node = containerRef.current;
      if (!node) {
        return;
      }

      const svgNs = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNs, "svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.style.position = "absolute";
      svg.style.inset = "0";
      svg.style.pointerEvents = "none";

      const defs = document.createElementNS(svgNs, "defs");
      const filter = document.createElementNS(svgNs, "filter");
      filter.setAttribute("id", "lava-glow");
      filter.innerHTML =
        '<feGaussianBlur stdDeviation="1.6" result="blur" />' +
        '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>';
      defs.appendChild(filter);

      const group = document.createElementNS(svgNs, "g");
      group.setAttribute("stroke", "#22ff88");
      group.setAttribute("stroke-width", "2");
      group.setAttribute("stroke-linecap", "round");
      group.setAttribute("fill", "none");
      group.setAttribute("filter", "url(#lava-glow)");

      const segments = [
        "M5 8 L30 28 L18 58",
        "M45 12 L55 32 L48 70",
        "M78 18 L58 44 L76 86",
        "M12 82 L44 64 L72 92",
      ];

      segments.forEach((d) => {
        const path = document.createElementNS(svgNs, "path");
        path.setAttribute("d", d);
        path.setAttribute("stroke-dasharray", "0 200");
        path.setAttribute("stroke-dashoffset", "0");
        path.style.opacity = "0";
        path.style.transition = "stroke-dashoffset 0.32s ease-out, opacity 0.2s ease-in";
        group.appendChild(path);
      });

      svg.appendChild(defs);
      svg.appendChild(group);
      node.appendChild(svg);

      svgRef.current = {
        playCrack() {
          const animations = Array.from(group.children).map((child, index) => {
            const path = child as SVGPathElement;
            const length = path.getTotalLength();
            path.setAttribute("stroke-dasharray", `${length}`);
            path.setAttribute("stroke-dashoffset", `${length}`);
            path.style.opacity = "1";
            return new Promise<void>((resolve) => {
              requestAnimationFrame(() => {
                path.setAttribute("stroke-dashoffset", "0");
                setTimeout(resolve, CRACK_DURATION + index * 40);
              });
            });
          });
          return Promise.all(animations).then(() => undefined);
        },
        explode() {
          group.style.transition = "opacity 0.4s ease-out";
          group.style.opacity = "0";
          return new Promise<void>((resolve) => {
            setTimeout(resolve, EXPLOSION_DURATION);
          });
        },
        teardown() {
          svg.remove();
        },
      };

      return () => {
        svg.remove();
        svgRef.current = null;
      };
    }, [mode]);

    useImperativeHandle(
      ref,
      () => ({
        playCrack() {
          if (mode === "pixi" && pixiRef.current) {
            const { app, crackFilter, crackSprite } = pixiRef.current;
            crackSprite.alpha = 1;
            crackFilter.uniforms.u_progress = 0;
            crackFilter.uniforms.u_glow = 1;

            return new Promise<void>((resolve) => {
              let elapsed = 0;
              const run = (delta: number) => {
                elapsed += (delta * 1000) / 60;
                const progress = Math.min(elapsed / CRACK_DURATION, 1);
                crackFilter.uniforms.u_progress = progress;
                crackFilter.uniforms.u_glow =
                  1 + 0.18 * Math.sin((elapsed / GLOW_PULSE_INTERVAL) * Math.PI * 2);
                if (progress >= 1) {
                  crackFilter.uniforms.u_glow = 1;
                  app.ticker.remove(run);
                  resolve();
                }
              };

              app.ticker.add(run);
            });
          }

          if (mode === "svg" && svgRef.current) {
            return svgRef.current.playCrack();
          }

          return Promise.resolve();
        },
        explode(origin) {
          if (mode === "pixi" && pixiRef.current) {
            const {
              app,
              shardsContainer,
              crackFilter,
              crackSprite,
              textures,
              SpriteCtor,
            } = pixiRef.current;

            shardsContainer.removeChildren();
            shardsContainer.visible = true;

            const particles: Array<{
              sprite: any;
              vx: number;
              vy: number;
              rotationSpeed: number;
              life: number;
            }> = [];

            const count = 90;
            for (let i = 0; i < count; i += 1) {
              const texture = textures[i % textures.length];
              const sprite = new SpriteCtor(texture);
              sprite.anchor.set(0.5);
              sprite.position.set(origin.x, origin.y);
              sprite.alpha = 1;
              sprite.scale.set(0.6 + Math.random() * 0.4);
              shardsContainer.addChild(sprite);

              const angle = (Math.random() * Math.PI * 2);
              const speed = 2.5 + Math.random() * 2.5;
              particles.push({
                sprite,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.6,
                rotationSpeed: (Math.random() - 0.5) * 0.25,
                life: 1,
              });
            }

            return new Promise<void>((resolve) => {
              let elapsed = 0;
              const gravity = 0.18;
              const run = (delta: number) => {
                elapsed += (delta * 1000) / 60;
                const dt = delta / 60;

                particles.forEach((particle) => {
                  particle.vy += gravity * dt;
                  particle.sprite.x += particle.vx * 12 * dt;
                  particle.sprite.y += particle.vy * 12 * dt;
                  particle.sprite.rotation += particle.rotationSpeed * delta;
                  particle.life -= dt * 0.9;
                  particle.sprite.alpha = Math.max(particle.life, 0);
                });

                const fade = Math.max(0, 1 - elapsed / EXPLOSION_DURATION);
                crackFilter.uniforms.u_glow = fade;
                crackSprite.alpha = fade;

                if (elapsed >= EXPLOSION_DURATION) {
                  app.ticker.remove(run);
                  shardsContainer.visible = false;
                  shardsContainer.removeChildren();
                  crackSprite.alpha = 0;
                  resolve();
                }
              };

              app.ticker.add(run);
            });
          }

          if (mode === "svg" && svgRef.current) {
            return svgRef.current.explode(origin);
          }

          return Promise.resolve();
        },
        teardown() {
          if (mode === "pixi" && pixiRef.current) {
            const { app, timeTicker } = pixiRef.current;
            if (timeTicker) {
              app.ticker.remove(timeTicker);
            }
            app.destroy(true, { children: true, texture: true, baseTexture: true });
            pixiRef.current = null;
          }

          if (mode === "svg" && svgRef.current) {
            svgRef.current.teardown();
            svgRef.current = null;
          }
        },
      }),
      [mode]
    );

    return (
      <div
        aria-hidden
        className={className}
        ref={containerRef}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />
    );
  }
);

LavaCrackOverlay.displayName = "LavaCrackOverlay";

export default LavaCrackOverlay;
