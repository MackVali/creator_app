"use client";

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import type { PermissionState } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { RotateCcw } from "lucide-react";
import { useToastHelpers } from "@/components/ui/toast";
import {
  hapticComplete,
  hapticError,
  hapticErrorPattern,
  hapticHeavyImpact,
  hapticLightImpact,
  hapticLevelUp,
  hapticLongPress,
  hapticMediumImpact,
  hapticPress,
  hapticSnap,
  hapticSelectionChanged,
  hapticSoftTick,
  hapticSuccess,
  hapticWarning,
  hapticWarningPattern,
} from "@/lib/haptics/creatorHaptics";

const buttonClass =
  "rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-left text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.1] focus:outline-none focus:ring-2 focus:ring-white/30";

const TEST_LOCAL_NOTIFICATION_ID = 2_147_483_647;

export default function ToastTestPanel() {
  const toast = useToastHelpers();
  const [isSchedulingLocalNotification, setIsSchedulingLocalNotification] =
    useState(false);
  const hapticTests = [
    { label: "Light impact", action: hapticLightImpact },
    { label: "Medium impact", action: hapticMediumImpact },
    { label: "Heavy impact", action: hapticHeavyImpact },
    { label: "Success notification", action: hapticSuccess },
    { label: "Warning notification", action: hapticWarning },
    { label: "Error notification", action: hapticError },
    { label: "Selection changed", action: hapticSelectionChanged },
  ];
  const hapticRecipeTests = [
    // Rollout language: press = navigation/opening; snap = panel/tab/drawer transitions;
    // softTick = lightweight selection; longPress = hold recognized; complete = completion/reward;
    // levelUp = major reward; warning/error = blocked or failed action.
    { label: "Press", action: hapticPress },
    { label: "Soft tick", action: hapticSoftTick },
    { label: "Snap", action: hapticSnap },
    { label: "Long press", action: hapticLongPress },
    { label: "Complete", action: hapticComplete },
    { label: "Level up", action: hapticLevelUp },
    { label: "Warning pattern", action: hapticWarningPattern },
    { label: "Error pattern", action: hapticErrorPattern },
  ];

  const handleTestLocalNotification = async () => {
    if (isSchedulingLocalNotification) return;

    setIsSchedulingLocalNotification(true);

    try {
      if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
        toast.warning(
          "Native device required",
          "Local notifications can only be tested in the native app."
        );
        return;
      }

      if (!Capacitor.isPluginAvailable("LocalNotifications")) {
        toast.error(
          "Local notifications unavailable",
          "The native Local Notifications plugin is not available in this build."
        );
        return;
      }

      const permission = await resolveLocalNotificationPermission();

      if (!permission) {
        toast.error(
          "Permission check failed",
          "CREATOR could not check local notification permissions."
        );
        return;
      }

      if (permission !== "granted") {
        toast.warning(
          "Notifications disabled",
          "Enable notifications for CREATOR in iOS Settings, then try again."
        );
        return;
      }

      await LocalNotifications.cancel({
        notifications: [{ id: TEST_LOCAL_NOTIFICATION_ID }],
      });
      await LocalNotifications.schedule({
        notifications: [
          {
            id: TEST_LOCAL_NOTIFICATION_ID,
            title: "CREATOR",
            body: "Local notifications are working.",
            schedule: {
              at: new Date(Date.now() + 10_000),
              allowWhileIdle: true,
            },
            extra: {
              type: "admin_test_local_notification",
            },
          },
        ],
      });

      toast.success(
        "Local notification scheduled",
        "You should receive a CREATOR notification in about 10 seconds."
      );
    } catch {
      toast.error(
        "Local notification failed",
        "CREATOR could not schedule the test notification."
      );
    } finally {
      setIsSchedulingLocalNotification(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-9rem)] bg-black px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
            Internal
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Test
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-white/60">
            Admin-only toast style checks for the current shared toast system.
          </p>
        </div>

        <section className="rounded-lg border border-white/10 bg-[#090B11] p-4 shadow-2xl shadow-black/30 sm:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight text-white">
              Haptics
            </h2>
            <p className="mt-1 text-sm leading-6 text-white/60">
              Haptics only fire on supported native devices and may be silent in browser.
            </p>
          </div>
          <div className="space-y-5">
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                Raw Haptics
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {hapticTests.map((test) => (
                  <button
                    key={test.label}
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      void test.action();
                    }}
                  >
                    {test.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                  Haptic Recipes
                </h3>
                <p className="mt-1 text-xs leading-5 text-white/50">
                  These combine multiple native haptics with tight timing for richer feedback.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {hapticRecipeTests.map((test) => (
                  <button
                    key={test.label}
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      void test.action();
                    }}
                  >
                    {test.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-[#090B11] p-4 shadow-2xl shadow-black/30 sm:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight text-white">
              Notifications
            </h2>
            <p className="mt-1 text-sm leading-6 text-white/60">
              Local notifications only fire on supported native devices.
            </p>
          </div>
          <button
            type="button"
            className={buttonClass}
            disabled={isSchedulingLocalNotification}
            onClick={() => {
              void handleTestLocalNotification();
            }}
          >
            {isSchedulingLocalNotification
              ? "Scheduling local notification..."
              : "Test local notification"}
          </button>
        </section>

        <section className="rounded-lg border border-white/10 bg-[#090B11] p-4 shadow-2xl shadow-black/30 sm:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight text-white">
              Toasts
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                toast.success(
                  "Success toast",
                  "The requested update was saved and is ready to review."
                )
              }
            >
              Success with description
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                toast.error(
                  "Error toast",
                  "The request could not be completed. Check the inputs and try again."
                )
              }
            >
              Error with description
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                toast.warning(
                  "Warning toast",
                  "This change may affect scheduled creator workflows."
                )
              }
            >
              Warning with description
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                toast.info(
                  "Info toast",
                  "New status details are available in the activity feed."
                )
              }
            >
              Info with description
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => toast.success("Title-only success toast")}
            >
              Title-only success
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                toast.info(
                  "Longer toast",
                  "This message includes more detail to verify wrapping, spacing, and readability across compact mobile widths and desktop layouts."
                )
              }
            >
              Longer message-heavy toast
            </button>
            <button
              type="button"
              className={`${buttonClass} sm:col-span-2`}
              onClick={() =>
                toast.error(
                  "Retry available",
                  "The sync failed before all changes were confirmed.",
                  () =>
                    toast.info(
                      "Retry clicked",
                      "The retry action callback fired successfully."
                    )
                )
              }
            >
              <span className="inline-flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Error with retry action
              </span>
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

async function resolveLocalNotificationPermission(): Promise<PermissionState | null> {
  try {
    const checked = await LocalNotifications.checkPermissions();
    let permission = checked.display;

    if (permission === "prompt" || permission === "prompt-with-rationale") {
      const requested = await LocalNotifications.requestPermissions();
      permission = requested.display;
    }

    return permission;
  } catch {
    return null;
  }
}
