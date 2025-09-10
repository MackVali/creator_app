"use client";
import { useEffect, useRef } from "react";

/**
 * Full-bleed dither background:
 * - Layer A: pixel dither via radial-gradient grid (no images)
 * - Layer B: ultra-soft vignette to keep edges quiet
 * - Layer C (optional): accent tint (very low opacity)
 * - Optional parallax transform on scroll (disabled if reduced motion)
 */
export default function DitherBackground({
  parallax = true,
  tint = false,
}: { parallax?: boolean; tint?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!parallax) return;
    const el = ref.current;
    if (!el) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;

    let raf = 0;
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      // small subpixel translate for depth; keep very subtle for iOS GPU
      const t = Math.min(20, y * 0.03); // clamp
      el.style.transform = `translate3d(0, ${t}px, 0)`;
    };
    const queued = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(onScroll);
    };

    window.addEventListener("scroll", queued, { passive: true });
    onScroll();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", queued);
    };
  }, [parallax]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-50"
      style={{
        // Layer A: dither grid (radial dots in a square lattice)
        background:
          `
          radial-gradient(circle at 1px 1px, var(--dither-fg) 1px, transparent 1px) 0 0 / var(--dither-size) var(--dither-size),
          var(--dither-bg)
          `,
        opacity: "var(--dither-opacity)",
        willChange: "transform",
      }}
    >
      {/* Layer B: vignette to quiet edges and status/home bars */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 120% at 50% 0%, transparent 50%, rgba(0,0,0,0.35) 100%)",
          mixBlendMode: "normal",
        }}
      />
      {/* Layer C: optional accent tint (super subtle, like your video) */}
      {tint && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,69,58,0.05), transparent 35%, transparent 65%, rgba(255,69,58,0.03))",
          }}
        />
      )}
    </div>
  );
}
