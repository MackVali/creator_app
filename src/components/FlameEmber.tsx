import React from "react";

type FlameLevel = "NO" | "LOW" | "MEDIUM" | "HIGH" | "ULTRA" | "EXTREME";
type FlameSize = "sm" | "md" | "lg";

export type FlameEmberProps = {
  level: FlameLevel;
  size?: FlameSize;
  className?: string;
};

const SIZE_MAP: Record<FlameSize, number> = { sm: 24, md: 36, lg: 48 };

export default function FlameEmber({ level, size = "md", className }: FlameEmberProps) {
  const px = SIZE_MAP[size];
  return (
    <div
      className={className}
      style={{ width: px, height: px * 1.2, display: "inline-block" }}
      aria-label={`${level} energy flame`}
    >
      {renderFlame(level)}
    </div>
  );
}

function renderFlame(level: FlameLevel) {
  // Route to different visuals/motion by level.
  switch (level) {
    case "NO":
      return <NoFlame />;
    case "LOW":
      return <ScaledFlame scale={0.75} speed={1.3} specks={0} tiltDeg={1.2} coreScale={0.85} />;
    case "MEDIUM":
      return <ScaledFlame scale={0.9} speed={1.1} specks={0} tiltDeg={2.0} coreScale={0.95} />;
    case "HIGH":
      // Reference-matched
      return <HighFlame />;
    case "ULTRA":
      return <ScaledFlame scale={1.1} speed={0.9} specks={2} tiltDeg={4.5} coreScale={1.05} chaos={0.5} />;
    case "EXTREME":
      return <ScaledFlame scale={1.2} speed={0.75} specks={3} tiltDeg={6.0} coreScale={1.1} chaos={0.9} />;
  }
}

/** ————— Reference-accurate HIGH flame ————— */
function HighFlame() {
  return (
    <svg viewBox="0 0 100 120" width="100%" height="100%" role="img">
      <defs>
        <filter id="flameGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <radialGradient id="coreGrad" cx="50%" cy="70%" r="60%">
          <stop offset="0%" stopColor="#fff59d" />
          <stop offset="55%" stopColor="#ffe066" />
          <stop offset="100%" stopColor="#ffd54f" />
        </radialGradient>

        <linearGradient id="midGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff9800" />
          <stop offset="100%" stopColor="#ff6f00" />
        </linearGradient>

        <linearGradient id="outerGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff3d00" />
          <stop offset="100%" stopColor="#e53935" />
        </linearGradient>
      </defs>

      <g filter="url(#flameGlow)" className="flame">
        {/* Outer red silhouette */}
        <path
          className="outer"
          fill="url(#outerGrad)"
          d="M50,114 C35,112 26,103 24,94 C22,85 26,78 29,73
             C27,71 25,65 26,59 C27,52 31,47 36,43
             C37,38 40,33 45,28 C50,22 54,18 56,22
             C59,27 57,34 58,39 C63,38 68,40 71,45
             C74,49 74,56 72,60 C80,64 84,70 84,79
             C84,92 73,110 50,114 Z"
        />

        {/* Mid orange swirl */}
        <path
          className="mid"
          fill="url(#midGrad)"
          d="M52,106 C40,104 33,96 33,89 C33,83 36,79 40,76
             C39,74 38,70 39,67 C40,63 43,60 46,58
             C47,55 49,51 52,49 C55,47 56,49 56,52
             C57,55 56,58 56,61 C60,60 63,61 65,64
             C67,66 67,70 66,72 C71,75 73,79 73,84
             C73,93 65,104 52,106 Z"
            opacity="0.95"
        />

        {/* Yellow core */}
        <path
          className="core"
          fill="url(#coreGrad)"
          d="M52,100 C44,99 40,93 40,88 C40,84 42,81 45,79
             C45,77 45,74 46,72 C47,70 49,69 51,68
             C52,66 54,64 55,64 C56,64 56,66 56,67
             C56,69 55,71 55,72 C57,72 59,73 60,75
             C61,76 61,78 60,79 C62,80 63,82 63,84
             C63,90 58,99 52,100 Z"
        />

        {/* Side micro tongues */}
        <path className="nub nub-left"  fill="#e53935" d="M28,86 C26,85 25,83 26,81 C27,79 30,78 32,79 C31,82 30,84 28,86 Z" />
        <path className="nub nub-right" fill="#e53935" d="M76,86 C78,85 79,83 78,81 C77,79 74,78 72,79 C73,82 74,84 76,86 Z" />

        {/* Floating specks */}
        <circle className="speck speck-1" cx="33" cy="70" r="1.4" fill="#ffc107" />
        <circle className="speck speck-2" cx="69" cy="66" r="1.2" fill="#ffab00" />
      </g>

      <style>{cssHigh}</style>
    </svg>
  );
}

/** ————— Parameterized flame for other levels (reuses HIGH paths, scales motion) ————— */
function ScaledFlame({
  scale = 1,
  speed = 1,
  specks = 0,
  tiltDeg = 2.5,
  coreScale = 1,
  chaos = 0,
}: {
  scale?: number;
  speed?: number;     // lower = faster
  specks?: number;    // 0..3
  tiltDeg?: number;   // max tilt amplitude
  coreScale?: number; // core emphasis
  chaos?: number;     // 0..1 jitter intensity
}) {
  return (
    <svg viewBox="0 0 100 120" width="100%" height="100%" role="img">
      <defs>
        <filter id="flameGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="coreGrad" cx="50%" cy="70%" r="60%">
          <stop offset="0%" stopColor="#fff59d" />
          <stop offset="55%" stopColor="#ffe066" />
          <stop offset="100%" stopColor="#ffd54f" />
        </radialGradient>
        <linearGradient id="midGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff9800" />
          <stop offset="100%" stopColor="#ff6f00" />
        </linearGradient>
        <linearGradient id="outerGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff3d00" />
          <stop offset="100%" stopColor="#e53935" />
        </linearGradient>
      </defs>

      <g filter="url(#flameGlow)" className="flame"
         style={{ transformOrigin: "50% 100%", animation: `tilt ${1700*speed}ms ease-in-out infinite, breathe ${1200*speed}ms ease-in-out infinite`, }}>
        <g style={{ transform: `scale(${scale})`, transformOrigin: "50% 100%" }}>
          {/* Outer same as HIGH */}
          <path className="outer" fill="url(#outerGrad)"
            d="M50,114 C35,112 26,103 24,94 C22,85 26,78 29,73
               C27,71 25,65 26,59 C27,52 31,47 36,43
               C37,38 40,33 45,28 C50,22 54,18 56,22
               C59,27 57,34 58,39 C63,38 68,40 71,45
               C74,49 74,56 72,60 C80,64 84,70 84,79
               C84,92 73,110 50,114 Z"
            style={{ transformOrigin: "50% 100%", animation: `flickerOuter ${950*speed}ms ease-in-out infinite` }}
          />
          {/* Mid */}
          <path className="mid" fill="url(#midGrad)"
            d="M52,106 C40,104 33,96 33,89 C33,83 36,79 40,76
               C39,74 38,70 39,67 C40,63 43,60 46,58
               C47,55 49,51 52,49 C55,47 56,49 56,52
               C57,55 56,58 56,61 C60,60 63,61 65,64
               C67,66 67,70 66,72 C71,75 73,79 73,84
               C73,93 65,104 52,106 Z"
            opacity={0.95}
            style={{ transformOrigin: "50% 100%", animation: `flickerMid ${900*speed}ms ease-in-out infinite` }}
          />
          {/* Core (scaled emphasis) */}
          <path className="core" fill="url(#coreGrad)"
            d="M52,100 C44,99 40,93 40,88 C40,84 42,81 45,79
               C45,77 45,74 46,72 C47,70 49,69 51,68
               C52,66 54,64 55,64 C56,64 56,66 56,67
               C56,69 55,71 55,72 C57,72 59,73 60,75
               C61,76 61,78 60,79 C62,80 63,82 63,84
               C63,90 58,99 52,100 Z"
            style={{ transformOrigin: "50% 100%", animation: `flickerCore ${850*speed}ms ease-in-out infinite, glow ${1200*speed}ms ease-in-out infinite`, transform: `scale(${coreScale})` }}
          />

          {/* Side nubs show only when scale >= 0.9 */}
          {scale >= 0.9 && (
            <>
              <path className="nub" fill="#e53935" d="M28,86 C26,85 25,83 26,81 C27,79 30,78 32,79 C31,82 30,84 28,86 Z"
                style={{ animation: `nubFlicker ${800*speed}ms ease-in-out infinite` }} />
              <path className="nub" fill="#e53935" d="M76,86 C78,85 79,83 78,81 C77,79 74,78 72,79 C73,82 74,84 76,86 Z"
                style={{ animation: `nubFlicker ${820*speed}ms ease-in-out infinite` }} />
            </>
          )}

          {/* Specks for ULTRA/EXTREME */}
          {[...Array(specks)].map((_, i) => (
            <circle key={i} className="speck" cx={i % 2 ? 69 : 33} cy={i % 2 ? 66 : 70} r={i % 2 ? 1.2 : 1.4}
              fill={i % 2 ? "#ffab00" : "#ffc107"}
              style={{ opacity: 0, animation: `speckRise ${1400*speed}ms linear ${i*350}ms infinite` }} />
          ))}
        </g>
      </g>

      <style>{cssScaled(tiltDeg, chaos)}</style>
    </svg>
  );
}

/** ————— NO-ENERGY ember (smoke only) ————— */
function NoFlame() {
  return (
    <svg viewBox="0 0 100 120" width="100%" height="100%" role="img">
      <g className="ember">
        <circle cx="50" cy="100" r="8" fill="#424242" />
        <circle className="smoke s1" cx="50" cy="88" r="3" fill="#9e9e9e" opacity="0.5" />
        <circle className="smoke s2" cx="46" cy="84" r="2.5" fill="#bdbdbd" opacity="0.4" />
        <circle className="smoke s3" cx="54" cy="82" r="2" fill="#bdbdbd" opacity="0.35" />
      </g>
      <style>{`
        .ember { transform-origin: 50% 100%; }
        .smoke { animation: smoke 5000ms ease-in-out infinite; }
        .s2 { animation-delay: 1200ms; }
        .s3 { animation-delay: 2400ms; }
        @keyframes smoke {
          0% { transform: translateY(0) scale(1); opacity: .4; }
          40% { opacity: .25; }
          100% { transform: translateY(-24px) scale(1.25); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) { .smoke { animation: none; } }
      `}</style>
    </svg>
  );
}

/** CSS for HIGH (reference-matched) */
const cssHigh = `
  .flame { transform-origin: 50% 100%;
    animation: tilt 1700ms ease-in-out infinite, breathe 1200ms ease-in-out infinite; }
  .outer { transform-origin: 50% 100%;
    animation: flickerOuter 950ms ease-in-out infinite; }
  .mid { transform-origin: 50% 100%;
    animation: flickerMid 900ms ease-in-out infinite; }
  .core { transform-origin: 50% 100%;
    animation: flickerCore 850ms ease-in-out infinite, glow 1200ms ease-in-out infinite; }
  .nub { transform-origin: 50% 100%;
    animation: nubFlicker 800ms ease-in-out infinite; }
  .speck { opacity: 0; animation: speckRise 1400ms linear infinite; }
  .speck-2 { animation-delay: 450ms; }

  @keyframes tilt { 0%{rotate:0} 30%{rotate:2.8deg} 55%{rotate:-2.6deg} 80%{rotate:2.1deg} 100%{rotate:0} }
  @keyframes breathe { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(1.06)} }
  @keyframes flickerOuter { 0%,100%{transform:translateY(0) scaleY(1)} 45%{transform:translateY(-.8px) scaleY(1.03) skewX(.4deg)} }
  @keyframes flickerMid   { 0%,100%{transform:translateY(0) scaleY(1)} 50%{transform:translateY(-1.1px) scaleY(1.05) skewX(-.5deg)} }
  @keyframes flickerCore  { 0%,100%{transform:translateY(0) scaleY(1)} 50%{transform:translateY(-1.6px) scaleY(1.08) skewX(.6deg)} }
  @keyframes glow { 0%,100%{opacity:.92} 50%{opacity:1} }
  @keyframes nubFlicker { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-.6px) scale(1.05)} }
  @keyframes speckRise { 0%{transform:translateY(0) scale(1);opacity:0} 10%{opacity:.9} 100%{transform:translateY(-18px) scale(.6);opacity:0} }

  @media (prefers-reduced-motion: reduce) {
    .flame, .outer, .mid, .core, .nub, .speck { animation: none !important; }
  }
`;

/** CSS generator for scaled levels */
function cssScaled(tiltDeg: number, chaos = 0) {
  // chaos adds tiny skew jitter to give ULTRA/EXTREME more life
  const skewOuter = (0.2 + chaos * 0.6).toFixed(2);
  const skewMid   = (0.3 + chaos * 0.8).toFixed(2);
  const skewCore  = (0.4 + chaos * 1.0).toFixed(2);

  return `
    .flame { transform-origin: 50% 100%; }
    @keyframes tilt { 0%{rotate:0} 35%{rotate:${tiltDeg}deg} 70%{rotate:${-tiltDeg}deg} 100%{rotate:0} }
    @keyframes breathe { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(1.04)} }
    @keyframes flickerOuter { 0%,100%{transform:translateY(0) scaleY(1)} 50%{transform:translateY(-.7px) scaleY(1.03) skewX(${skewOuter}deg)} }
    @keyframes flickerMid   { 0%,100%{transform:translateY(0) scaleY(1)} 50%{transform:translateY(-.9px) scaleY(1.05) skewX(${-skewMid}deg)} }
    @keyframes flickerCore  { 0%,100%{transform:translateY(0) scaleY(1)} 50%{transform:translateY(-1.2px) scaleY(1.07) skewX(${skewCore}deg)} }
    @keyframes glow { 0%,100%{opacity:.9} 50%{opacity:1} }
    @keyframes nubFlicker { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-.5px) scale(1.04)} }
    @keyframes speckRise { 0%{transform:translateY(0) scale(1);opacity:0} 15%{opacity:.9} 100%{transform:translateY(-16px) scale(.6);opacity:0} }
    @media (prefers-reduced-motion: reduce) {
      .flame, .outer, .mid, .core, .nub, .speck { animation: none !important; }
    }
  `;
}

export type { FlameLevel };
