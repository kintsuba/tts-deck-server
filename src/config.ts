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
