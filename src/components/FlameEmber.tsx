import React from "react";

export type FlameLevel = "NO" | "LOW" | "MEDIUM" | "HIGH" | "ULTRA" | "EXTREME";
type FlameSize = "sm" | "md" | "lg";

export type FlameEmberProps = {
  level: FlameLevel;
  size?: FlameSize;
  className?: string;
};

const SIZE_MAP: Record<FlameSize, number> = { sm: 24, md: 36, lg: 48 };

const OUTER_SHAPES: Record<string, string> = {
  stubby: `M50,112 C36,110 28,102 27,96 C26,90 29,85 32,81
           C30,79 29,74 30,69 C31,64 34,60 38,57
           C39,53 42,49 45,46 C48,44 50,45 51,49
           C52,53 51,57 51,60 C55,60 58,62 60,65
           C62,68 62,72 61,74 C66,77 69,82 69,88
           C69,97 61,109 50,112 Z`,
  standard: `M50,114 C35,112 26,103 24,94 C22,85 26,78 29,73
             C27,71 25,65 26,59 C27,52 31,47 36,43
             C37,38 40,33 45,28 C50,22 54,18 56,22
             C59,27 57,34 58,39 C63,38 68,40 71,45
             C74,49 74,56 72,60 C80,64 84,70 84,79
             C84,92 73,110 50,114 Z`,
  splitTip: `M50,114 C35,112 26,103 24,94 C22,85 26,78 29,73
             C27,71 25,65 26,59 C27,52 31,47 36,43
             C40,30 50,22 54,28 C57,33 55,40 55,46
             C60,44 66,45 69,49 C72,53 71,59 69,63
             C78,67 84,73 84,81 C84,93 73,110 50,114 Z
             M55,33 C58,28 63,27 66,31 C69,35 66,41 60,43 Z`,
  waveTip: `M50,116 C32,112 24,100 24,90 C24,82 29,76 33,72
            C30,67 30,60 33,55 C36,50 41,48 45,46
            C45,40 49,34 54,31 C59,28 61,31 61,36
            C61,40 60,44 60,48 C66,48 70,51 73,56
            C75,60 75,65 73,69 C82,72 87,79 87,88
            C87,100 73,113 50,116 Z`,
};

const PALETTES = {
  LOW:   { redTop:"#ff5a36", redBot:"#e84a3b", midTop:"#ff8f3a", midBot:"#ff6d00", core0:"#ffe08a", core1:"#ffd061" },
  MEDIUM:{ redTop:"#ff4a2b", redBot:"#e43b36", midTop:"#ff8a00", midBot:"#ff6a00", core0:"#ffd86f", core1:"#ffc94f" },
  HIGH:  { redTop:"#ff3d00", redBot:"#e53935", midTop:"#ff9800", midBot:"#ff6f00", core0:"#fff59d", core1:"#ffd54f" },
  ULTRA: { redTop:"#ff2f00", redBot:"#e0252d", midTop:"#ffa000", midBot:"#ff6a00", core0:"#fff6b0", core1:"#ffe066" },
  EXTREME:{redTop:"#ff2200", redBot:"#d81b24", midTop:"#ffad00", midBot:"#ff6a00", core0:"#fff9c4", core1:"#ffe27a" },
} as const;

type Profile = {
  shape: keyof typeof OUTER_SHAPES;
  tilt: number;
  breathe: number;
  flicker: [number, number, number];
  nubs: number;
  specks: number;
  halo: boolean;
};

type Palette = (typeof PALETTES)[keyof typeof PALETTES];

const PROFILE: Record<FlameLevel, Profile> = {
  NO:      { shape: "stubby",   tilt: 0.5, breathe: 0.02, flicker: [0.01, 0.015, 0.02], nubs: 0, specks: 0, halo: false },
  LOW:     { shape: "stubby",   tilt: 1.0, breathe: 0.04, flicker: [0.03, 0.04, 0.05], nubs: 0, specks: 0, halo: false },
  MEDIUM:  { shape: "standard", tilt: 2.5, breathe: 0.06, flicker: [0.05, 0.06, 0.07], nubs: 1, specks: 0, halo: false },
  HIGH:    { shape: "standard", tilt: 2.8, breathe: 0.06, flicker: [0.06, 0.07, 0.08], nubs: 2, specks: 2, halo: false },
  ULTRA:   { shape: "splitTip", tilt: 4.5, breathe: 0.09, flicker: [0.09, 0.10, 0.11], nubs: 2, specks: 3, halo: true },
  EXTREME: { shape: "waveTip",  tilt: 6.0, breathe: 0.12, flicker: [0.12, 0.13, 0.15], nubs: 2, specks: 4, halo: true },
};

const MID_PATH = `M52,106 C40,104 33,96 33,89 C33,83 36,79 40,76
             C39,74 38,70 39,67 C40,63 43,60 46,58
             C47,55 49,51 52,49 C55,47 56,49 56,52
             C57,55 56,58 56,61 C60,60 63,61 65,64
             C67,66 67,70 66,72 C71,75 73,79 73,84
             C73,93 65,104 52,106 Z`;

const CORE_PATH = `M52,100 C44,99 40,93 40,88 C40,84 42,81 45,79
             C45,77 45,74 46,72 C47,70 49,69 51,68
             C52,66 54,64 55,64 C56,64 56,66 56,67
             C56,69 55,71 55,72 C57,72 59,73 60,75
             C61,76 61,78 60,79 C62,80 63,82 63,84
             C63,90 58,99 52,100 Z`;

const NUB_LEFT = "M28,86 C26,85 25,83 26,81 C27,79 30,78 32,79 C31,82 30,84 28,86 Z";
const NUB_RIGHT = "M76,86 C78,85 79,83 78,81 C77,79 74,78 72,79 C73,82 74,84 76,86 Z";

export default function FlameEmber({ level, size = "md", className }: FlameEmberProps) {
  const px = SIZE_MAP[size];
  return (
    <div
      className={className}
      style={{ width: px, height: px * 1.2, display: "inline-block" }}
      aria-label={`Energy: ${level}`}
    >
      {renderFlame(level)}
    </div>
  );
}

function renderFlame(level: FlameLevel) {
  if (level === "NO") return <NoFlame />;
  const profile = PROFILE[level];
  const palette = PALETTES[level as keyof typeof PALETTES] || PALETTES.HIGH;
  return <LevelFlame level={level} profile={profile} palette={palette} />;
}

function LevelFlame({ level, profile, palette }: { level: FlameLevel; profile: Profile; palette: Palette }) {
  const id = level.toLowerCase();
  const coreScale = level === "LOW" ? 0.85 : level === "ULTRA" ? 1.05 : 1;
  const midStyle: React.CSSProperties = level === "LOW" ? { transform: "translateY(8px) scale(0.8)", transformOrigin: "50% 100%" } : { transformOrigin: "50% 100%" };

  return (
    <svg viewBox="0 0 100 120" width="100%" height="100%" role="img">
      <defs>
        <filter id={`flameGlow-${id}`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <radialGradient id={`coreGrad-${id}`} cx="50%" cy="70%" r="60%">
          <stop offset="0%" stopColor={palette.core0} />
          <stop offset="100%" stopColor={palette.core1} />
        </radialGradient>

        <linearGradient id={`midGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.midTop} />
          <stop offset="100%" stopColor={palette.midBot} />
        </linearGradient>

        <linearGradient id={`outerGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.redTop} />
          <stop offset="100%" stopColor={palette.redBot} />
        </linearGradient>
      </defs>

      <g filter={`url(#flameGlow-${id})`} className="flame">
        {profile.halo && (
          <ellipse
            cx="50"
            cy="100"
            rx="22"
            ry="10"
            fill="#ff9800"
            opacity=".25"
            style={{ filter: "blur(6px)", animation: "halo 1600ms ease-in-out infinite" }}
          />
        )}
        <path className="outer" fill={`url(#outerGrad-${id})`} d={OUTER_SHAPES[profile.shape]} />
        <path className="mid" fill={`url(#midGrad-${id})`} d={MID_PATH} style={midStyle} opacity={0.95} />
        <path
          className="core"
          fill={`url(#coreGrad-${id})`}
          d={CORE_PATH}
          style={{ transform: `scale(${coreScale})`, transformOrigin: "50% 100%" }}
        />
        {profile.nubs >= 1 && <path className="nub nub-left" fill={palette.redBot} d={NUB_LEFT} />}
        {profile.nubs >= 2 && <path className="nub nub-right" fill={palette.redBot} d={NUB_RIGHT} />}
        {[...Array(profile.specks)].map((_, i) => (
          <circle
            key={i}
            className="speck"
            cx={i % 2 ? 69 : 33}
            cy={i % 2 ? 66 : 70}
            r={i % 2 ? 1.2 : 1.4}
            fill={i % 2 ? palette.midTop : palette.core0}
            style={{ opacity: 0, animation: `speckRise 1400ms linear ${i * 350}ms infinite` }}
          />
        ))}
        {level === "EXTREME" && (
          <path
            className="micro"
            fill={`url(#coreGrad-${id})`}
            d="M52,42 C50,41 49,39 50,38 C51,37 53,37 54,38 C54,39 53,41 52,42 Z"
            style={{ transformOrigin: "50% 100%", animation: "micro 900ms ease-in-out infinite" }}
          />
        )}
      </g>

      <style>{cssFor(profile)}</style>
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

/** CSS generator based on profile */
function cssFor(profile: Profile) {
  const [fo, fm, fc] = profile.flicker;
  return `
    .flame { transform-origin:50% 100%; animation:tilt 1700ms ease-in-out infinite, breathe 1200ms ease-in-out infinite; }
    @keyframes tilt { 0%{rotate:0} 35%{rotate:${profile.tilt}deg} 70%{rotate:${-profile.tilt}deg} 100%{rotate:0} }
    @keyframes breathe { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(${1 + profile.breathe})} }

    .outer { transform-origin:50% 100%; animation:flickerOuter 950ms ease-in-out infinite; }
    @keyframes flickerOuter { 0%,100%{transform:translateY(0) scaleY(1)} 50%{transform:translateY(${-0.6 - fo * 6}px) scaleY(${1 + fo}) skewX(${0.3 + fo * 6}deg)} }

    .mid { transform-origin:50% 100%; animation:flickerMid 900ms ease-in-out infinite; }
    @keyframes flickerMid { 0%,100%{transform:translateY(0) scaleY(1)} 50%{transform:translateY(${-0.8 - fm * 6}px) scaleY(${1 + fm}) skewX(${-(0.4 + fm * 6)}deg)} }

    .core { transform-origin:50% 100%; animation:flickerCore 850ms ease-in-out infinite, glow 1200ms ease-in-out infinite; }
    @keyframes flickerCore { 0%,100%{transform:translateY(0) scaleY(1)} 50%{transform:translateY(${-1.0 - fc * 6}px) scaleY(${1 + fc}) skewX(${0.5 + fc * 6}deg)} }
    @keyframes glow { 0%,100%{opacity:.9} 50%{opacity:1} }

    .nub { transform-origin:50% 100%; animation:nubFlicker 800ms ease-in-out infinite; }
    @keyframes nubFlicker { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-.5px) scale(1.04)} }

    .speck { opacity:0; animation:speckRise 1400ms linear infinite; }
    @keyframes speckRise { 0%{transform:translateY(0) scale(1);opacity:0} 15%{opacity:.9} 100%{transform:translateY(-16px) scale(.6);opacity:0} }

    .micro { transform-origin:50% 100%; }
    @keyframes micro { 0%{opacity:0;transform:translateY(0) scale(.6)} 50%{opacity:1;transform:translateY(-4px) scale(1)} 100%{opacity:0;transform:translateY(-8px) scale(.8)} }

    @keyframes halo { 0%,100%{opacity:.15;transform:scale(1)} 50%{opacity:.3;transform:scale(1.05)} }

    @media (prefers-reduced-motion: reduce) { .flame, .outer, .mid, .core, .nub, .speck, .micro { animation: none !important; } }
  `;
}

