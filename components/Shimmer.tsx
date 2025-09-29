import { motion } from "framer-motion";
import { useEffect } from "react";

interface ShimmerProps {
  durationMs?: number;
  onComplete?: () => void;
}

export function Shimmer({ durationMs = 260, onComplete }: ShimmerProps) {
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      onComplete?.();
    }, durationMs);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [durationMs, onComplete]);

  return (
    <motion.div
      role="presentation"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ borderRadius: "inherit" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.6, 0] }}
      transition={{ duration: durationMs / 1000, ease: "easeOut", times: [0, 0.35, 1] }}
    >
      <motion.div
        className="absolute inset-y-0 left-0 w-1/2"
        style={{
          background:
            "linear-gradient(120deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.25) 45%, rgba(255,255,255,0) 100%)",
          mixBlendMode: "screen",
        }}
        initial={{ x: "-120%" }}
        animate={{ x: "120%" }}
        transition={{ duration: durationMs / 1000, ease: "easeOut" }}
      />
    </motion.div>
  );
}

export default Shimmer;
