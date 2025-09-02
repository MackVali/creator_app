"use client";

import { useParams } from "next/navigation";
import { MonumentDetail } from "@/components/monuments/MonumentDetail";

export default function MonumentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return <MonumentDetail id={id} />;
}

