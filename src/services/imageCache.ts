import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { PutObjectCommandInput } from '@aws-sdk/client-s3';
import { loadConfig } from '../config';
import { s3Client } from '../lib/s3Client';
import { toBuffer } from '../utils/stream';
import { fromCacheStorage, toCacheMetadata, type CachedAsset } from '../models/cachedAsset';

const config = loadConfig();

const CACHE_PREFIX = config.CACHE_PREFIX ?? 'cache/';
const MAX_IMAGE_BYTES = config.MAX_IMAGE_BYTES !== undefined ? Number(config.MAX_IMAGE_BYTES) : 10 * 1024 * 1024;
const BUCKET = config.AWS_S3_BUCKET_NAME ?? (() => {
  throw new Error('AWS_S3_BUCKET_NAME is required');
})();

const keyFor = (id: string) => `${CACHE_PREFIX}${id}`;

export const getCachedImage = async (id: string): Promise<CachedAsset | null> => {
  const key = keyFor(id);

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
      }),
    );

    const data = await toBuffer(response.Body, MAX_IMAGE_BYTES);
    const contentType = response.ContentType ?? 'application/octet-stream';
    const metadata = response.Metadata ?? {};

    return fromCacheStorage(id, data, contentType, metadata, response.LastModified);
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }

    throw error;
  }
};

export const putCachedImage = async (
  asset: CachedAsset,
  options: Partial<Pick<PutObjectCommandInput, 'CacheControl'>> = {},
) => {
  const key = keyFor(asset.id);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: asset.data,
      ContentType: asset.contentType,
      Metadata: toCacheMetadata(asset),
      ContentLength: asset.bytes,
      CacheControl: options.CacheControl ?? 'public, max-age=7776000, immutable',
    }),
  );
};

const isNotFound = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const awsError = error as { name?: string; $metadata?: { httpStatusCode?: number } };

  return awsError.name === 'NoSuchKey' || awsError.$metadata?.httpStatusCode === 404;
};
