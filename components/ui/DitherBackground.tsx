"use client";
import Dither from "./Dither";

interface DitherBackgroundProps {
  /** Optional wrapper className */
  className?: string;
}

export default function DitherBackground({ className }: DitherBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 -z-10 h-full w-full ${className ?? ""}`.trim()}
    >
      <Dither
        waveColor={[0.5, 0.5, 0.5]}
        disableAnimation={false}
        enableMouseInteraction={true}
        mouseRadius={0.3}
        colorNum={4}
        waveAmplitude={0.3}
        waveFrequency={3}
        waveSpeed={0.05}
      />
    </div>
  );
}

