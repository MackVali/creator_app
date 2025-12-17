import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function safeDateTimeFormat(
  locale: string | undefined,
  tz: string | null | undefined,
  options: any
) {
  if (!tz) {
    throw new Error("TZ_NULL_SENTINEL");
  }
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: tz });
}
