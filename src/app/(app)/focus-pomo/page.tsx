"use client";

import { useRouter, useSearchParams } from "next/navigation";
import FocusPomo, {
  type FocusPomoLaunchConfig,
} from "@/components/focus/FocusPomo";

function readLaunchConfig(
  params: Pick<URLSearchParams, "get">,
): FocusPomoLaunchConfig | null {
  if (params.get("launch") !== "time_block_start") return null;

  const startMs = readDateMs(params.get("start"));
  const endMs = readDateMs(params.get("end"));
  if (startMs === null || endMs === null || startMs >= endMs) return null;

  return {
    launch: "time_block_start",
    blockKey: params.get("blockKey"),
    blockLabel: params.get("blockLabel"),
    timeBlockId: params.get("timeBlockId"),
    dayTypeTimeBlockId: params.get("dayTypeTimeBlockId"),
    windowId: params.get("windowId"),
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString(),
    localDayKey: params.get("localDayKey"),
    anchorInstanceId: params.get("anchorInstanceId"),
  };
}

function readDateMs(value: string | null): number | null {
  if (!value?.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export default function FocusPomoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const launchConfig = readLaunchConfig(searchParams);

  return (
    <FocusPomo
      open
      source={null}
      launchConfig={launchConfig}
      onClose={() => {
        router.push("/dashboard");
      }}
    />
  );
}
