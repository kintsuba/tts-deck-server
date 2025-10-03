import { createHash } from "node:crypto";

export const CACHE_METADATA_KEYS = {
  SOURCE_URL: "merge-source-url",
  CHECKSUM: "merge-checksum",
  CACHED_AT: "merge-cached-at",
} as const;

export type CacheMetadata = Record<string, string | undefined>;

export interface CachedAsset {
  id: string;
  data: Buffer;
  contentType: string;
  bytes: number;
  checksum: string;
  cachedAt: Date;
  sourceUrl: string;
}

export const computeChecksum = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");

const resolveMetadataValue = (metadata: CacheMetadata, key: string) =>
  metadata[key] ?? metadata[key.toLowerCase()];

export const fromCacheStorage = (
  id: string,
  data: Buffer,
  contentType: string,
  metadata: CacheMetadata = {},
  lastModified?: Date,
): CachedAsset => {
  const checksum =
    resolveMetadataValue(metadata, CACHE_METADATA_KEYS.CHECKSUM) ??
    computeChecksum(data);
  const cachedAtValue = resolveMetadataValue(
    metadata,
    CACHE_METADATA_KEYS.CACHED_AT,
  );
  const cachedAt = cachedAtValue
    ? new Date(cachedAtValue)
    : (lastModified ?? new Date());
  const sourceUrl =
    resolveMetadataValue(metadata, CACHE_METADATA_KEYS.SOURCE_URL) ??
    "cache://unknown";

  return {
    id,
    data,
    contentType,
    bytes: data.byteLength,
    checksum,
    cachedAt,
    sourceUrl,
  };
};

export interface FetchedImage {
  buffer: Buffer;
  bytes: number;
  contentType: string;
  url: string;
}

export const fromFetchedImage = (
  id: string,
  image: FetchedImage,
): CachedAsset => ({
  id,
  data: image.buffer,
  contentType: image.contentType,
  bytes: image.bytes,
  checksum: computeChecksum(image.buffer),
  cachedAt: new Date(),
  sourceUrl: image.url,
});

export const toCacheMetadata = (
  asset: CachedAsset,
): Record<string, string> => ({
  [CACHE_METADATA_KEYS.SOURCE_URL]: asset.sourceUrl,
  [CACHE_METADATA_KEYS.CHECKSUM]: asset.checksum,
  [CACHE_METADATA_KEYS.CACHED_AT]: asset.cachedAt.toISOString(),
});
