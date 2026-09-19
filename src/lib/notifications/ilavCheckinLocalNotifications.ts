import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { IlavCheckInType } from "@/lib/ai/ilavCheckins";

export const ILAV_CHECKIN_NOTIFICATION_TYPE = "ilav_checkin";

const CHECK_INS: Array<{
  id: number;
  type: IlavCheckInType;
  hour: number;
  minute: number;
  body: string;
}> = [
  { id: 1_864_001_001, type: "morning", hour: 8, minute: 0, body: "Morning. Let's look at the day." },
  { id: 1_864_001_002, type: "midday", hour: 13, minute: 0, body: "How we looking so far?" },
  { id: 1_864_001_003, type: "night", hour: 21, minute: 30, body: "Alright. What actually happened today?" },
];

export async function syncIlavCheckInLocalNotifications() {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;
  if (!Capacitor.isPluginAvailable("LocalNotifications")) return;

  let permission = await LocalNotifications.checkPermissions();
  if (permission.display === "prompt" || permission.display === "prompt-with-rationale") {
    permission = await LocalNotifications.requestPermissions();
  }
  if (permission.display !== "granted") return;

  await LocalNotifications.cancel({
    notifications: CHECK_INS.map((item) => ({ id: item.id })),
  }).catch(() => undefined);

  await LocalNotifications.schedule({
    notifications: CHECK_INS.map((item) => ({
      id: item.id,
      title: "Ilav",
      body: item.body,
      schedule: {
        on: { hour: item.hour, minute: item.minute },
        allowWhileIdle: true,
      },
      extra: {
        type: ILAV_CHECKIN_NOTIFICATION_TYPE,
        checkInType: item.type,
      },
    })),
  });
}
