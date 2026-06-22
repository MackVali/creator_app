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

export function hapticLightImpact() {
  return runHaptic(() => Haptics.impact({ style: ImpactStyle.Light }));
}

export function hapticMediumImpact() {
  return runHaptic(() => Haptics.impact({ style: ImpactStyle.Medium }));
}

export function hapticHeavyImpact() {
  return runHaptic(() => Haptics.impact({ style: ImpactStyle.Heavy }));
}

export function hapticSuccess() {
  return runHaptic(() =>
    Haptics.notification({ type: NotificationType.Success })
  );
}

export function hapticWarning() {
  return runHaptic(() =>
    Haptics.notification({ type: NotificationType.Warning })
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

export function hapticSelectionChanged() {
  return runHaptic(async () => {
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
    await Haptics.selectionEnd();
  });
}

export { ImpactStyle as CreatorImpactStyle };
