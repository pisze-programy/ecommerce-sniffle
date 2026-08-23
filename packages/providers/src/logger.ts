export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Readonly<Record<string, string | number | boolean | null>>;

export interface LogRecord {
  readonly level: LogLevel;
  readonly message: string;
  readonly context: LogContext;
  readonly timestamp: string;
}

export type LogSink = (record: LogRecord) => void;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function formatRecord(record: LogRecord): string {
  return JSON.stringify(record);
}

export function createLogger(sink: LogSink, minLevel: LogLevel = "debug"): Logger {
  const threshold = LEVEL_ORDER[minLevel];

  function emit(level: LogLevel, message: string, context: LogContext): void {
    if (LEVEL_ORDER[level] < threshold) {
      return;
    }
    const record: LogRecord = {
      level,
      message,
      context,
      timestamp: new Date().toISOString(),
    };
    sink(record);
  }

  return {
    debug(message: string, context: LogContext = {}): void {
      emit("debug", message, context);
    },
    info(message: string, context: LogContext = {}): void {
      emit("info", message, context);
    },
    warn(message: string, context: LogContext = {}): void {
      emit("warn", message, context);
    },
    error(message: string, context: LogContext = {}): void {
      emit("error", message, context);
    },
  };
}

export const consoleSink: LogSink = (record: LogRecord): void => {
  const line = formatRecord(record);
  if (record.level === "error") {
    console.error(line);
    return;
  }
  if (record.level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
};
