"use client";

import { useEffect, useState } from "react";

const entries = [
  { label: "sm", min: 640 },
  { label: "md", min: 768 },
  { label: "lg", min: 1024 },
  { label: "xl", min: 1280 },
  { label: "2xl", min: 1536 },
] as const;

export default function useBreakpoint() {
  const [bp, setBp] = useState<"sm" | "md" | "lg" | "xl" | "2xl">("sm");

  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      const current = entries.filter((e) => w >= e.min).pop();
      setBp((current ? current.label : "sm") as typeof bp);
    };

    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  return bp;
}

