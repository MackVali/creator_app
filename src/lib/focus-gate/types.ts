import type { CreatorDay } from "@/lib/creatorDay";

export type FocusGateSettings = {
  enabled: boolean;
  minutesPerXp: number;
  dailyMaxMinutes: number | null;
};

export type FocusGateDerivedState = {
  xpToday: number;
  baseAllowedMinutes: number;
  allowedMinutes: number;
  creatorDay: Pick<CreatorDay, "startsAt" | "endsAt" | "timezone">;
};

export type FocusGateStatus = FocusGateSettings & FocusGateDerivedState;

export type FocusGateNativeAuthorizationStatus =
  | "notDetermined"
  | "approved"
  | "denied"
  | "restricted"
  | "unavailable";

export type FocusGateNativeSelectionStatus =
  | "notConfigured"
  | "configured"
  | "unavailable";

export type FocusGateNativeSetupStatus =
  | "disabled"
  | "unavailable"
  | "authorizationRequired"
  | "selectionRequired"
  | "locked"
  | "accessAvailable";

export type FocusGateNativeEnforcementState = {
  authorizationStatus: FocusGateNativeAuthorizationStatus;
  selectionStatus: FocusGateNativeSelectionStatus;
  shielded: boolean | null;
  nativeAvailable: boolean;
  setupStatus?: FocusGateNativeSetupStatus;
  enabled?: boolean;
  xpToday?: number;
  allowedMinutes?: number;
  lastReachedThresholdMinutes?: number;
  creatorDayStartsAt?: string;
  creatorDayEndsAt?: string;
  timezone?: string;
  lastSyncedAt?: string;
  applicationCount?: number | null;
  categoryCount?: number | null;
  webDomainCount?: number | null;
  totalTokenCount?: number | null;
};

export const DEFAULT_FOCUS_GATE_SETTINGS: FocusGateSettings = {
  enabled: false,
  minutesPerXp: 5,
  dailyMaxMinutes: null,
};
