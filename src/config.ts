import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv({ quiet: true });

type Env = Record<string, string | undefined>;

const envSchema = z
  .object({
    PORT: z.coerce.number().int().nonnegative().default(3000),
    AWS_ENDPOINT_URL: z.string().url().optional(),
    AWS_REGION: z.string().min(1, 'AWS_REGION is required'),
    AWS_S3_BUCKET: z.string().min(1, 'AWS_S3_BUCKET is required'),
    AWS_ACCESS_KEY_ID: z.string().min(1, 'AWS_ACCESS_KEY_ID is required'),
    AWS_SECRET_ACCESS_KEY: z
      .string()
      .min(1, 'AWS_SECRET_ACCESS_KEY is required'),
    MERGE_OUTPUT_FORMAT: z
      .enum(['png', 'jpeg'])
      .default('png'),
    CACHE_PREFIX: z.string().default('cache/'),
    MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
    FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    FETCH_CONCURRENCY: z.coerce.number().int().positive().max(16).default(5),
  })
  .transform((value) => ({
    ...value,
    mergeOutputMime: value.MERGE_OUTPUT_FORMAT === 'png' ? 'image/png' : 'image/jpeg',
  }));

const deriveEnv = (raw: Env): Env => ({
  PORT: raw.PORT,
  AWS_ENDPOINT_URL:
    raw.AWS_ENDPOINT_URL ??
    raw.AWS_ENDPOINT ??
    raw.S3_ENDPOINT ??
    raw.AWS_S3_ENDPOINT ??
    raw.RAILWAY_S3_ENDPOINT,
  AWS_REGION: raw.AWS_REGION ?? raw.RAILWAY_S3_REGION ?? raw.S3_REGION,
  AWS_S3_BUCKET:
    raw.AWS_S3_BUCKET ??
    raw.S3_BUCKET ??
    raw.AWS_BUCKET ??
    raw.BUCKET_NAME ??
    raw.RAILWAY_S3_BUCKET,
  AWS_ACCESS_KEY_ID:
    raw.AWS_ACCESS_KEY_ID ??
    raw.RAILWAY_S3_ACCESS_KEY ??
    raw.S3_ACCESS_KEY ??
    raw.ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY:
    raw.AWS_SECRET_ACCESS_KEY ??
    raw.RAILWAY_S3_SECRET_KEY ??
    raw.S3_SECRET_KEY ??
    raw.SECRET_ACCESS_KEY,
  MERGE_OUTPUT_FORMAT: raw.MERGE_OUTPUT_FORMAT,
  CACHE_PREFIX: raw.CACHE_PREFIX,
  MAX_IMAGE_BYTES: raw.MAX_IMAGE_BYTES,
  FETCH_TIMEOUT_MS: raw.FETCH_TIMEOUT_MS,
  FETCH_CONCURRENCY: raw.FETCH_CONCURRENCY,
});

export type AppConfig = z.infer<typeof envSchema> & { mergeOutputMime: string };

let cachedConfig: AppConfig | null = null;

export const loadConfig = (env: Env = process.env): AppConfig => {
  if (cachedConfig) {
    return cachedConfig;
  }

  const derived = deriveEnv(env);
  cachedConfig = envSchema.parse(derived);
  return cachedConfig;
};

export const resetConfigCache = () => {
  cachedConfig = null;
};
