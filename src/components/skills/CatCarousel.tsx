"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import type { CatItem } from "@/types/dashboard";
import { CatCard } from "@/components/ui/CatCard";

interface CatCarouselProps {
  cats: CatItem[];
}

export function CatCarousel({ cats }: CatCarouselProps) {
  const [index, setIndex] = useState(0);
  const [height, setHeight] = useState(256);
  const cardRef = useRef<HTMLDivElement>(null);
  const total = cats.length;

  useEffect(() => {
    if (cardRef.current) {
      setHeight(cardRef.current.offsetHeight);
    }
  }, [index, cats]);

  const paginate = (newIndex: number) => {
    const next = (newIndex + total) % total;
    setIndex(next);
  };

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    const offsetX = info.offset.x;
    if (offsetX < -50) paginate(index + 1);
    else if (offsetX > 50) paginate(index - 1);
  };

  const stack: { cat: CatItem; position: number }[] = [];
  for (let i = 1; i < Math.min(3, total); i++) {
    const nextIndex = (index + i) % total;
    stack.push({ cat: cats[nextIndex], position: i });
  }

  if (total === 0) return null;

  return (
    <div className="relative w-full overflow-visible" style={{ height }}>
      <AnimatePresence initial={false}>
        <motion.div
          key={cats[index].cat_id}
          ref={cardRef}
          className="absolute inset-0"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={handleDragEnd}
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -300, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <CatCard cat={cats[index]} />
        </motion.div>
      </AnimatePresence>

      {stack.map(({ cat, position }) => (
        <motion.div
          key={cat.cat_id}
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translateX(${position * 32}px) translateY(${-position * 4}px)` ,
            zIndex: -position,
          }}
          initial={false}
          animate={{ scale: 1 - position * 0.05 }}
        >
          <CatCard cat={cat} />
        </motion.div>
      ))}
    </div>
  );
}

export default CatCarousel;

