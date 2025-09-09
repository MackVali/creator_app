"use client";

import { Reorder } from "framer-motion";
import { type MouseEvent as ReactMouseEvent } from "react";
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
  return (
    <Reorder.Item
      value={skill}
      as="div"
      className="cursor-grab touch-pan-y"
      onDragStart={() => {
        dragging.current = true;
        onDragStateChange?.(true);
      }}
      onDragEnd={() => {
        dragging.current = false;
        onDragStateChange?.(false);
      }}
      onPointerUp={() => {
        dragging.current = false;
        onDragStateChange?.(false);
      }}
      onPointerLeave={() => {
        dragging.current = false;
        onDragStateChange?.(false);
      }}
      onClickCapture={(e: ReactMouseEvent) => {
        if (dragging.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onContextMenu={(e: ReactMouseEvent) => e.preventDefault()}
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

