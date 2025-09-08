"use client";

import { Reorder, useDragControls } from "framer-motion";
import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  const startEvent = useRef<PointerEvent | null>(null);

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
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        startEvent.current = e.nativeEvent;
        timer.current = setTimeout(() => {
          setReady(true);
        }, 3000);
      }}
      onPointerMove={() => {
        if (ready && !dragging.current && startEvent.current) {
          controls.start(startEvent.current);
          dragging.current = true;
          onDragStateChange?.(true);
          setReady(false);
        }
      }}
      onPointerUp={() => {
        clear();
        startEvent.current = null;
      }}
      onPointerLeave={() => {
        clear();
        startEvent.current = null;
      }}
      onDragEnd={() => {
        dragging.current = false;
        onDragStateChange?.(false);
        clear();
        startEvent.current = null;
      }}
      onClickCapture={(e: ReactMouseEvent) => {
        if (dragging.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
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

