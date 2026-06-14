"use client";

import { useParams } from "next/navigation";

import { SkillDetail } from "./SkillDetail";

export default function SkillDetailPage() {
  const params = useParams();
  const id = params.id as string;

  return <SkillDetail skillId={id} />;
}
