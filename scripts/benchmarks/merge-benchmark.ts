#!/usr/bin/env tsx
/**
 * merge-benchmark.ts
 *
 * Usage: pnpm run benchmark:merge [iterations] [cardCount]
 * Defaults: iterations=3, cardCount=70
 *
 * The benchmark mocks remote fetches and S3 using in-memory buffers so that the
 * merge pipeline can be exercised end-to-end without external dependencies.
 */

import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import { applyTestEnv, installFetchMock } from '../../src/test/setup';
import { resetS3Mock, mockCachedImageMissing } from '../../src/test/utils/s3Mock';
import { resetConfigCache, loadConfig } from '../../src/config';

const iterations = Number(process.argv[2] ?? 3);
const cardCount = Number(process.argv[3] ?? 70);

const createCardPayload = async (index: number, bucket: string) => {
  const id = randomUUID();
  const uri = `https://benchmark.local/${index}.png`;
  const buffer = await sharp({
    create: {
      width: 128,
      height: 180,
      channels: 4,
      background: { r: (index * 31) % 255, g: (index * 47) % 255, b: (index * 13) % 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  return {
    descriptor: { id, imageUri: uri },
    response: {
      buffer,
      headers: {
        'content-type': 'image/png',
        'content-length': String(buffer.byteLength),
      },
    },
    cacheKey: `cache/${id}`,
    bucket,
  };
};

const runIteration = async () => {
  resetConfigCache();
  applyTestEnv();
  const config = loadConfig();
  const bucket = config.AWS_S3_BUCKET_NAME ?? (() => {
    throw new Error('AWS_S3_BUCKET_NAME is required for the benchmark');
  })();
  const { mergeDeck } = await import('../../src/services/mergeService');

  const fetchMock = installFetchMock();
  resetS3Mock();

  const payload: Array<{ id: string; imageUri: string }> = [];

  for (let index = 0; index < cardCount; index += 1) {
    const card = await createCardPayload(index, bucket);
    payload.push(card.descriptor);
    fetchMock.enqueueBuffer(card.response.buffer, { headers: card.response.headers });
    mockCachedImageMissing(card.cacheKey, { bucket: card.bucket });
  }

  const startedAt = performance.now();
  const result = await mergeDeck(payload);
  const wallDuration = performance.now() - startedAt;

  fetchMock.restore();

  return {
    wallDuration,
    mergeDuration: result.metadata.durationMs,
    cached: result.metadata.cached.length,
    downloaded: result.metadata.downloaded.length,
  };
};

const main = async () => {
  const runs = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const metrics = await runIteration();
    runs.push(metrics);
    console.log(
      `run ${iteration + 1}: wall=${metrics.wallDuration.toFixed(2)}ms, merge=${metrics.mergeDuration.toFixed(2)}ms, cached=${metrics.cached}, downloaded=${metrics.downloaded}`,
    );
  }

  const average = runs.reduce((acc, value) => acc + value.wallDuration, 0) / runs.length;
  console.log(`\naverage wall duration: ${average.toFixed(2)}ms over ${runs.length} runs (cards=${cardCount})`);
};

main().catch((error) => {
  console.error('Benchmark failed', error);
  process.exitCode = 1;
});
