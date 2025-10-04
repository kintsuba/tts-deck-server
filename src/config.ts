import { config as loadEnv } from "dotenv";

loadEnv({ quiet: true });

export type Env = Record<string, string | undefined>;

export interface AppConfig {
  PORT: string | undefined;
  AWS_ENDPOINT_URL: string | undefined;
  AWS_DEFAULT_REGION: string | undefined;
  AWS_S3_BUCKET_NAME: string | undefined;
  AWS_ACCESS_KEY_ID: string | undefined;
  AWS_SECRET_ACCESS_KEY: string | undefined;
  MERGE_OUTPUT_FORMAT: string | undefined;
  CACHE_PREFIX: string | undefined;
  MAX_IMAGE_BYTES: string | undefined;
  FETCH_TIMEOUT_MS: string | undefined;
  FETCH_CONCURRENCY: string | undefined;
}

const deriveEnv = (raw: Env): AppConfig => ({
  PORT: raw.PORT,
  AWS_ENDPOINT_URL: raw.AWS_ENDPOINT_URL,
  AWS_DEFAULT_REGION: raw.AWS_DEFAULT_REGION,
  AWS_S3_BUCKET_NAME: raw.AWS_S3_BUCKET_NAME,
  AWS_ACCESS_KEY_ID: raw.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: raw.AWS_SECRET_ACCESS_KEY,
  MERGE_OUTPUT_FORMAT: raw.MERGE_OUTPUT_FORMAT,
  CACHE_PREFIX: raw.CACHE_PREFIX,
  MAX_IMAGE_BYTES: raw.MAX_IMAGE_BYTES,
  FETCH_TIMEOUT_MS: raw.FETCH_TIMEOUT_MS,
  FETCH_CONCURRENCY: raw.FETCH_CONCURRENCY,
});

let cachedConfig: AppConfig | null = null;

export const loadConfig = (env: Env = process.env): AppConfig => {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = deriveEnv(env);
  return cachedConfig;
};

export const resetConfigCache = () => {
  cachedConfig = null;
};

const NUMBER_PATTERN = /^-?\d+$/;

const parseIntegerEnv = (
  raw: string | undefined,
  field: string,
  fallback: number,
  { min = 0 }: { min?: number } = {},
): number => {
  if (raw === undefined) {
    return fallback;
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    throw new Error(`${field} must not be empty`);
  }

  if (!NUMBER_PATTERN.test(trimmed)) {
    throw new Error(`${field} must be an integer, received "${raw}"`);
  }

  const value = Number.parseInt(trimmed, 10);

  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be a finite integer, received "${raw}"`);
  }

  if (value < min) {
    throw new Error(`${field} must be >= ${min}, received ${value}`);
  }

  return value;
};

export const DEFAULT_PORT = 3000;
export const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
export const DEFAULT_FETCH_CONCURRENCY = 5;
export const DEFAULT_CACHE_PREFIX = "cache/";

export const getRequiredConfigValue = <K extends keyof AppConfig>(
  key: K,
  config: AppConfig = loadConfig(),
  message?: string,
): string => {
  const value = config[key];

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  const label = String(key);
  throw new Error(message ?? `${label} is required`);
};

export const getPort = (config: AppConfig = loadConfig()): number =>
  parseIntegerEnv(config.PORT, "PORT", DEFAULT_PORT, { min: 0 });

export const getMaxImageBytes = (config: AppConfig = loadConfig()): number =>
  parseIntegerEnv(
    config.MAX_IMAGE_BYTES,
    "MAX_IMAGE_BYTES",
    DEFAULT_MAX_IMAGE_BYTES,
    { min: 1 },
  );

export const getFetchTimeoutMs = (config: AppConfig = loadConfig()): number =>
  parseIntegerEnv(
    config.FETCH_TIMEOUT_MS,
    "FETCH_TIMEOUT_MS",
    DEFAULT_FETCH_TIMEOUT_MS,
    { min: 1 },
  );

export const getFetchConcurrency = (config: AppConfig = loadConfig()): number =>
  parseIntegerEnv(
    config.FETCH_CONCURRENCY,
    "FETCH_CONCURRENCY",
    DEFAULT_FETCH_CONCURRENCY,
    { min: 1 },
  );

export const getCachePrefix = (config: AppConfig = loadConfig()): string => {
  const value = config.CACHE_PREFIX?.trim();
  return value && value.length > 0 ? value : DEFAULT_CACHE_PREFIX;
};

export type MergeOutputFormat = "png" | "jpeg";

export const DEFAULT_MERGE_OUTPUT_FORMAT: MergeOutputFormat = "png";

export const getMergeOutputFormat = (
  config: AppConfig = loadConfig(),
): MergeOutputFormat => {
  const value = config.MERGE_OUTPUT_FORMAT?.trim().toLowerCase();

  if (value === "jpeg" || value === "png") {
    return value;
  }

  if (value === "jpg") {
    return "jpeg";
  }

  return DEFAULT_MERGE_OUTPUT_FORMAT;
};
