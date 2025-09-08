"use client";

import { Reorder, useDragControls } from "framer-motion";
import { useRef, useState, type MouseEvent, type PointerEvent } from "react";
import SkillRow from "./SkillRow";
import type { Skill } from "./useSkillsData";

interface Props {
  skill: Skill;
  dragging: React.MutableRefObject<boolean>;
  onColor: string;
  trackColor: string;
  fillColor: string;
  onDragStateChange?: (dragging: boolean) => void;
}

export default function DraggableSkill({
  skill,
  dragging,
  onColor,
  trackColor,
  fillColor,
  onDragStateChange,
}: Props) {
  const controls = useDragControls();
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setReady(false);
  };

  return (
    <Reorder.Item
      value={skill}
      as="div"
      dragListener={false}
      dragControls={controls}
      className="cursor-grab"
      onPointerDown={() => {
        timer.current = setTimeout(() => {
          setReady(true);
        }, 3000);
      }}
      onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
        if (ready && !dragging.current) {
          controls.start(e);
          dragging.current = true;
          onDragStateChange?.(true);
          setReady(false);
        }
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onDragEnd={() => {
        dragging.current = false;
        onDragStateChange?.(false);
        clear();
      }}
      onClickCapture={(e: MouseEvent) => {
        if (dragging.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      animate={ready ? { rotate: [-2, 2, -2, 2, 0] } : { rotate: 0 }}
      transition={
        ready ? { duration: 0.3, repeat: Infinity, repeatType: "mirror" } : undefined
      }
    >
      <SkillRow
        skill={skill}
        onColor={onColor}
        trackColor={trackColor}
        fillColor={fillColor}
      />
    </Reorder.Item>
  );
}

