import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { getSupabaseBrowser } from "@/lib/supabase";

let registrationInFlight: Promise<void> | null = null;
let listenersRegistered = false;

type RegisterCreatorPushOptions = {
  userId: string;
};

export async function registerCreatorPushNotifications({
  userId,
}: RegisterCreatorPushOptions): Promise<void> {
  console.info("[push] registerCreatorPushNotifications called", { userId });

  if (typeof window === "undefined") {
    console.info("[push] skipped: window undefined");
    return;
  }

  if (!Capacitor.isNativePlatform()) {
    console.info("[push] skipped: not native platform", Capacitor.getPlatform());
    return;
  }

  if (!Capacitor.isPluginAvailable("PushNotifications")) {
    console.warn("[push] skipped: PushNotifications plugin is not available", Capacitor.getPlatform());
    return;
  }

  console.info("[push] native plugin available", Capacitor.getPlatform());

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
      console.info("[push] registration callback received token", { preview: token.value.slice(0, 24), length: token.value.length });
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
        console.error("[push] unable to save push token", error);
        return;
      }

      console.info("[push] CREATOR push token registered.");
    });

    await PushNotifications.addListener("registrationError", (error) => {
      console.error("[push] registration failed", error);
    });

    await PushNotifications.addListener("pushNotificationReceived", (notification) => {
      console.info("Push notification received", notification);
    });

    await PushNotifications.addListener("pushNotificationActionPerformed", (notification) => {
      console.info("Push notification opened", notification);
    });

    listenersRegistered = true;
  }

  const permission = await PushNotifications.checkPermissions();
  console.info("[push] current permission", permission);

  let receivePermission = permission.receive;

  if (receivePermission === "prompt" || receivePermission === "prompt-with-rationale") {
    console.info("[push] requesting permission");
    const requested = await PushNotifications.requestPermissions();
    console.info("[push] requested permission result", requested);
    receivePermission = requested.receive;
  }

  if (receivePermission !== "granted") {
    console.warn("[push] permission was not granted", receivePermission);
    return;
  }

  console.info("[push] calling PushNotifications.register()");
  await PushNotifications.register();
  console.info("[push] PushNotifications.register() returned");
}
