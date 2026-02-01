type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

const levelPriority: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

const defaultLevel: LogLevel = "warn";

const throttleCounters = new Map<string, number>();

const consoleFnByLevel: Record<LogLevel, (...args: unknown[]) => void> = {
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug ?? console.log,
  trace: console.trace ?? console.log,
};

type ThrottleOptions = {
  key?: string;
  every?: number;
};

export function getLogLevel(): number {
  const envValue = (
    typeof process !== "undefined" ? process.env.SCHEDULER_LOG_LEVEL : undefined
  )?.toLowerCase() as LogLevel | undefined;
  if (envValue && envValue in levelPriority) {
    return levelPriority[envValue];
  }

  return levelPriority[defaultLevel];
}

export function log(
  level: LogLevel,
  message: string,
  data?: unknown,
  opts: ThrottleOptions = {}
): void {
  const levelValue = levelPriority[level];
  if (levelValue > getLogLevel()) {
    return;
  }

  const every = Math.max(1, opts.every ?? 100);

  if (opts.key) {
    const key = opts.key;
    const count = (throttleCounters.get(key) ?? 0) + 1;
    throttleCounters.set(key, count);
    if (count !== 1 && count % every !== 0) {
      return;
    }
  }

  const consoleFn = consoleFnByLevel[level];
  if (data === undefined) {
    consoleFn(message);
  } else {
    consoleFn(message, data);
  }
}

export type { LogLevel, ThrottleOptions };
