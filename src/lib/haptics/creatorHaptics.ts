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

function hapticDelay(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function selectionTick() {
  await Haptics.selectionStart();
  await Haptics.selectionChanged();
  await Haptics.selectionEnd();
}

export function hapticTap() {
  return runHaptic(() => Haptics.impact({ style: ImpactStyle.Light }));
}

export function hapticPress() {
  return runHaptic(() => Haptics.impact({ style: ImpactStyle.Medium }));
}

export function hapticSoftTick() {
  return runHaptic(selectionTick);
}

export function hapticSnap() {
  return runHaptic(async () => {
    await Haptics.impact({ style: ImpactStyle.Medium });
    await hapticDelay(35);
    await selectionTick();
  });
}

export function hapticLongPress() {
  return runHaptic(async () => {
    await Haptics.impact({ style: ImpactStyle.Heavy });
    await hapticDelay(55);
    await selectionTick();
  });
}

export function hapticComplete() {
  return runHaptic(async () => {
    await Haptics.impact({ style: ImpactStyle.Medium });
    await hapticDelay(45);
    await Haptics.notification({ type: NotificationType.Success });
    await hapticDelay(65);
    await Haptics.impact({ style: ImpactStyle.Light });
  });
}

export function hapticLevelUp() {
  return runHaptic(async () => {
    await Haptics.impact({ style: ImpactStyle.Heavy });
    await hapticDelay(45);
    await Haptics.notification({ type: NotificationType.Success });
    await hapticDelay(80);
    await Haptics.impact({ style: ImpactStyle.Medium });
  });
}

export function hapticWarningPattern() {
  return runHaptic(async () => {
    await Haptics.impact({ style: ImpactStyle.Medium });
    await hapticDelay(55);
    await Haptics.notification({ type: NotificationType.Warning });
  });
}

export function hapticErrorPattern() {
  return runHaptic(async () => {
    await Haptics.impact({ style: ImpactStyle.Heavy });
    await hapticDelay(45);
    await Haptics.notification({ type: NotificationType.Error });
    await hapticDelay(70);
    await Haptics.impact({ style: ImpactStyle.Medium });
  });
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
  return runHaptic(selectionTick);
}

export { ImpactStyle as CreatorImpactStyle };
