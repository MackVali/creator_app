import { fromZonedTime } from "date-fns-tz";

export const ILAV_CHECK_IN_NOTIFICATION_TYPE = "ilav_checkin";
export const ILAV_CHECK_IN_QUERY_PARAM = "ilav_checkin";

export const ILAV_CHECK_IN_TIMES = {
  morning: { hour: 8, minute: 0 },
  midday: { hour: 13, minute: 0 },
  night: { hour: 21, minute: 30 },
} as const;

export type IlavCheckInType = keyof typeof ILAV_CHECK_IN_TIMES;

export const ILAV_CHECK_IN_TYPES: IlavCheckInType[] = [
  "morning",
  "midday",
  "night",
];

export function isIlavCheckInType(value: unknown): value is IlavCheckInType {
  return (
    typeof value === "string" &&
    ILAV_CHECK_IN_TYPES.includes(value as IlavCheckInType)
  );
}

export function ilavCheckInNotificationDate({
  creatorDayDate,
  type,
  timeZone,
}: {
  creatorDayDate: string;
  type: IlavCheckInType;
  timeZone: string;
}) {
  const time = ILAV_CHECK_IN_TIMES[type];
  const local = `${creatorDayDate} ${String(time.hour).padStart(2, "0")}:${String(
    time.minute
  ).padStart(2, "0")}:00`;
  return fromZonedTime(local, timeZone);
}

