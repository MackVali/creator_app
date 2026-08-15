"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

import type {
  FocusGateNativeAuthorizationStatus,
  FocusGateNativeEnforcementState,
  FocusGateNativeSelectionStatus,
} from "./types";

const FOCUS_GATE_PLUGIN_NAME = "FocusGate";

export type FocusGateNativeAvailability = {
  isBrowser: boolean;
  isNative: boolean;
  platform: string;
  isIos: boolean;
  pluginAvailable: boolean;
  canUse: boolean;
};

export type FocusGateSelectionSummary = {
  selectionStatus: FocusGateNativeSelectionStatus;
  hasSelection: boolean;
  applicationCount: number | null;
  categoryCount: number | null;
  webDomainCount: number | null;
  totalTokenCount: number | null;
};

export type FocusGateSyncAllowanceInput = {
  enabled: boolean;
  xpToday: number;
  allowedMinutes: number;
  creatorDayStartsAt: string;
  creatorDayEndsAt: string;
  timezone: string;
};

type FocusGatePlugin = {
  isAvailable(): Promise<{ available: boolean }>;
  getAuthorizationStatus(): Promise<{
    status: FocusGateNativeAuthorizationStatus;
  }>;
  requestAuthorization(): Promise<{
    status: FocusGateNativeAuthorizationStatus;
  }>;
  presentActivityPicker(): Promise<FocusGateSelectionSummary>;
  getSelectionSummary(): Promise<FocusGateSelectionSummary>;
  syncAllowance(options: FocusGateSyncAllowanceInput): Promise<FocusGateNativeEnforcementState>;
  getEnforcementState(): Promise<FocusGateNativeEnforcementState>;
};

const FocusGate = registerPlugin<FocusGatePlugin>(FOCUS_GATE_PLUGIN_NAME);

export function getFocusGateNativeAvailability(): FocusGateNativeAvailability {
  const isBrowser = typeof window !== "undefined";
  const isNative = isBrowser && Capacitor.isNativePlatform();
  const platform = isBrowser ? Capacitor.getPlatform() : "server";
  const isIos = platform === "ios";
  const pluginAvailable =
    isBrowser && Capacitor.isPluginAvailable(FOCUS_GATE_PLUGIN_NAME);

  return {
    isBrowser,
    isNative,
    platform,
    isIos,
    pluginAvailable,
    canUse: isBrowser && isNative && isIos && pluginAvailable,
  };
}

export async function isFocusGateNativeAvailable() {
  const availability = getFocusGateNativeAvailability();
  if (!availability.canUse) return { available: false, availability };

  try {
    const result = await FocusGate.isAvailable();
    return { available: result.available === true, availability };
  } catch {
    return { available: false, availability };
  }
}

export async function getFocusGateAuthorizationStatus(): Promise<{
  status: FocusGateNativeAuthorizationStatus;
  availability: FocusGateNativeAvailability;
}> {
  const availability = getFocusGateNativeAvailability();
  if (!availability.canUse) return { status: "unavailable", availability };

  try {
    const result = await FocusGate.getAuthorizationStatus();
    return { status: result.status ?? "unavailable", availability };
  } catch {
    return { status: "unavailable", availability };
  }
}

export async function requestFocusGateAuthorization(): Promise<{
  status: FocusGateNativeAuthorizationStatus;
  availability: FocusGateNativeAvailability;
}> {
  const availability = getFocusGateNativeAvailability();
  if (!availability.canUse) return { status: "unavailable", availability };

  const result = await FocusGate.requestAuthorization();
  return { status: result.status ?? "unavailable", availability };
}

export async function presentFocusGateActivityPicker(): Promise<
  | { ok: true; summary: FocusGateSelectionSummary }
  | { ok: false; reason: "unavailable"; availability: FocusGateNativeAvailability }
> {
  const availability = getFocusGateNativeAvailability();
  if (!availability.canUse) return { ok: false, reason: "unavailable", availability };

  const summary = await FocusGate.presentActivityPicker();
  return { ok: true, summary };
}

export async function getFocusGateSelectionSummary(): Promise<
  FocusGateSelectionSummary & { availability: FocusGateNativeAvailability }
> {
  const availability = getFocusGateNativeAvailability();
  if (!availability.canUse) {
    return {
      selectionStatus: "unavailable",
      hasSelection: false,
      applicationCount: null,
      categoryCount: null,
      webDomainCount: null,
      totalTokenCount: null,
      availability,
    };
  }

  try {
    const summary = await FocusGate.getSelectionSummary();
    return { ...summary, availability };
  } catch {
    return {
      selectionStatus: "unavailable",
      hasSelection: false,
      applicationCount: null,
      categoryCount: null,
      webDomainCount: null,
      totalTokenCount: null,
      availability,
    };
  }
}

export async function syncFocusGateAllowance(
  input: FocusGateSyncAllowanceInput
): Promise<
  | { ok: true; availability: FocusGateNativeAvailability; state: FocusGateNativeEnforcementState }
  | { ok: false; reason: "unavailable"; availability: FocusGateNativeAvailability }
> {
  const availability = getFocusGateNativeAvailability();
  if (!availability.canUse) return { ok: false, reason: "unavailable", availability };

  const state = await FocusGate.syncAllowance(input);
  return { ok: true, availability, state };
}

export async function getFocusGateEnforcementState(): Promise<
  FocusGateNativeEnforcementState & { availability: FocusGateNativeAvailability }
> {
  const availability = getFocusGateNativeAvailability();
  if (!availability.canUse) {
    return {
      authorizationStatus: "unavailable",
      selectionStatus: "unavailable",
      shielded: null,
      nativeAvailable: false,
      availability,
    };
  }

  try {
    const state = await FocusGate.getEnforcementState();
    return { ...state, availability };
  } catch {
    return {
      authorizationStatus: "unavailable",
      selectionStatus: "unavailable",
      shielded: null,
      nativeAvailable: false,
      availability,
    };
  }
}
