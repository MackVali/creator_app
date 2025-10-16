export interface HeroGradientPreset {
  id: string;
  label: string;
  background: string;
  overlay?: string;
  highlight?: string;
}

export const HERO_GRADIENT_PRESETS: HeroGradientPreset[] = [
  {
    id: "aurora-midnight",
    label: "Aurora Midnight",
    background:
      "radial-gradient(circle at 20% -10%, rgba(147, 197, 253, 0.45), transparent 55%), radial-gradient(circle at 90% 10%, rgba(244, 114, 182, 0.45), transparent 62%), linear-gradient(135deg, #020617 0%, #0b1120 45%, #111827 100%)",
    overlay:
      "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.18), transparent 65%)",
  },
  {
    id: "velvet-dusk",
    label: "Velvet Dusk",
    background:
      "radial-gradient(circle at 25% 20%, rgba(253, 164, 175, 0.35), transparent 55%), radial-gradient(circle at 80% 0%, rgba(244, 114, 182, 0.28), transparent 68%), linear-gradient(160deg, #0b021f 0%, #1b0331 50%, #220a3e 100%)",
    overlay:
      "radial-gradient(circle at 80% 30%, rgba(255,255,255,0.12), transparent 60%)",
  },
  {
    id: "noir-gold",
    label: "Noir Gold",
    background:
      "radial-gradient(circle at 20% 15%, rgba(250, 204, 21, 0.32), transparent 50%), radial-gradient(circle at 70% 0%, rgba(249, 115, 22, 0.24), transparent 60%), linear-gradient(140deg, #030712 0%, #0f172a 45%, #111827 100%)",
    overlay:
      "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.1), transparent 55%)",
  },
  {
    id: "ocean-haze",
    label: "Ocean Haze",
    background:
      "radial-gradient(circle at 15% -5%, rgba(56, 189, 248, 0.35), transparent 55%), radial-gradient(circle at 85% 15%, rgba(165, 243, 252, 0.3), transparent 68%), linear-gradient(180deg, #041026 0%, #04253c 50%, #0b395b 100%)",
    overlay:
      "radial-gradient(circle at 65% 5%, rgba(255,255,255,0.15), transparent 60%)",
  },
];

export const DEFAULT_HERO_GRADIENT_ID = HERO_GRADIENT_PRESETS[0]?.id ?? "aurora-midnight";

export function getHeroGradientPreset(id?: string | null): HeroGradientPreset {
  if (!id) {
    return HERO_GRADIENT_PRESETS.find((preset) => preset.id === DEFAULT_HERO_GRADIENT_ID) || HERO_GRADIENT_PRESETS[0];
  }

  return (
    HERO_GRADIENT_PRESETS.find((preset) => preset.id === id) ||
    HERO_GRADIENT_PRESETS.find((preset) => preset.id === DEFAULT_HERO_GRADIENT_ID) ||
    HERO_GRADIENT_PRESETS[0]
  );
}
