import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  openNotificationPayload,
  readCapacitorNotificationPayload,
} from "@/lib/notifications/openNotification";

let registrationInFlight: Promise<void> | null = null;
let listenersRegistered = false;

type RegisterCreatorPushOptions = {
  userId: string;
};

export async function registerCreatorPushNotifications({
  userId,
}: RegisterCreatorPushOptions): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  if (!Capacitor.isNativePlatform()) {
    return;
  }

  if (!Capacitor.isPluginAvailable("PushNotifications")) {
    console.warn("PushNotifications plugin is not available on this platform.");
    return;
  }

  if (registrationInFlight) {
    return registrationInFlight;
  }

  registrationInFlight = registerPushToken(userId).finally(() => {
    registrationInFlight = null;
  });

  return registrationInFlight;
}

async function registerPushToken(userId: string): Promise<void> {
  const supabase = getSupabaseBrowser?.();

  if (!supabase) {
    console.warn("Supabase browser client is unavailable for push registration.");
    return;
  }

  if (!listenersRegistered) {
    await PushNotifications.addListener("registration", async (token) => {
      const now = new Date().toISOString();

      const { error } = await supabase.from("push_tokens").upsert(
        {
          user_id: userId,
          token: token.value,
          platform: Capacitor.getPlatform(),
          token_type: "fcm",
          enabled: true,
          last_seen_at: now,
          updated_at: now,
        },
        {
          onConflict: "user_id,token",
        },
      );

      if (error) {
        console.error("Unable to save push token", error);
        return;
      }

    });

    await PushNotifications.addListener("registrationError", (error) => {
      console.error("Push registration failed", error);
    });

    await PushNotifications.addListener("pushNotificationReceived", (notification) => {
      console.info("Push notification received", notification);
    });

    await PushNotifications.addListener("pushNotificationActionPerformed", (notification) => {
      console.info("Push notification opened", notification);
      openNotificationPayload(readCapacitorNotificationPayload(notification));
    });

    if (Capacitor.isPluginAvailable("LocalNotifications")) {
      await LocalNotifications.addListener(
        "localNotificationActionPerformed",
        (notification) => {
          console.info("Local notification opened", notification);
          openNotificationPayload(readCapacitorNotificationPayload(notification));
        },
      );
    }

    listenersRegistered = true;
  }

  const permission = await PushNotifications.checkPermissions();

  let receivePermission = permission.receive;

  if (receivePermission === "prompt" || receivePermission === "prompt-with-rationale") {
    const requested = await PushNotifications.requestPermissions();
    receivePermission = requested.receive;
  }

  if (receivePermission !== "granted") {
    console.warn("Push notification permission was not granted.");
    return;
  }

  await PushNotifications.register();
}
