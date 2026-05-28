import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

export type CreatorHapticImpactStyle = ImpactStyle;

function isCreatorHapticsEnabled() {
  // TODO: Wire this to CREATOR's profile-backed settings once a haptics
  // preference exists alongside notifications/dark mode/timezone.
  return true;
}

function canUseNativeHaptics() {
  return (
    typeof window !== "undefined" &&
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable("Haptics") &&
    isCreatorHapticsEnabled()
  );
}

async function runHaptic(effect: () => Promise<void>) {
  if (!canUseNativeHaptics()) {
    return;
  }

  try {
    await effect();
  } catch {
    // Haptics are optional UX polish; unsupported devices should stay silent.
  }
}

export function hapticTap() {
  return runHaptic(() => Haptics.impact({ style: ImpactStyle.Light }));
}

export function hapticSuccess() {
  return runHaptic(() =>
    Haptics.notification({ type: NotificationType.Success })
  );
}

export function hapticError() {
  return runHaptic(() =>
    Haptics.notification({ type: NotificationType.Error })
  );
}

export function hapticImpact(style: CreatorHapticImpactStyle) {
  return runHaptic(() => Haptics.impact({ style }));
}

export { ImpactStyle as CreatorImpactStyle };
