"use client";

import { useRouter } from "next/navigation";
import FocusPomo from "@/components/focus/FocusPomo";

export default function FocusPomoPage() {
  const router = useRouter();

  return (
    <FocusPomo
      open
      source={null}
      onClose={() => {
        router.push("/dashboard");
      }}
    />
  );
}
