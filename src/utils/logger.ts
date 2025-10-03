import { inspect } from "node:util";

export type LogLevel = "info" | "warn" | "error" | "debug";

export type LogFields = Record<string, unknown>;

export interface Logger {
  child: (fields: LogFields) => Logger;
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, error?: unknown, fields?: LogFields) => void;
}

const formatError = (error: unknown) => {
  if (!error) {
    return undefined;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return typeof error === "object" ? error : inspect(error);
};

const writeLog = (level: LogLevel, message: string, fields: LogFields) => {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  };

  const serialized = JSON.stringify(entry);
  const stream = level === "error" ? process.stderr : process.stdout;
  stream.write(`${serialized}\n`);
};

const createLogger = (base: LogFields = {}): Logger => ({
  child: (fields: LogFields) => createLogger({ ...base, ...fields }),
  debug: (message, fields = {}) =>
    writeLog("debug", message, { ...base, ...fields }),
  info: (message, fields = {}) =>
    writeLog("info", message, { ...base, ...fields }),
  warn: (message, fields = {}) =>
    writeLog("warn", message, { ...base, ...fields }),
  error: (message, error, fields = {}) => {
    const errorField = formatError(error);
    const merged: LogFields = errorField
      ? { ...base, ...fields, error: errorField }
      : { ...base, ...fields };

    writeLog("error", message, merged);
  },
});

export const logger = createLogger();
