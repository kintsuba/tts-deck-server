import { performance } from "node:perf_hooks";
import { loadConfig } from "../config";
import { parseMergeRequest, type MergeRequest } from "../models/mergeRequest";
import type { MergeResult } from "../models/mergeResult";
import { composeGrid } from "./imageComposer";
import { getImage, ImageProvisionError } from "./imageProvider";
import { mapConcurrently } from "../utils/promise";
import { metrics } from "../utils/metrics";

const config = loadConfig();
const FETCH_CONCURRENCY =
  config.FETCH_CONCURRENCY !== undefined ? Number(config.FETCH_CONCURRENCY) : 5;

export const mergeDeck = async (payload: unknown): Promise<MergeResult> => {
  const request = parseMergeRequest(payload);
  return executeMerge(request);
};

export const executeMerge = async (
  request: MergeRequest,
): Promise<MergeResult> => {
  const startedAt = performance.now();

  const fetchDurations: number[] = [];
  let downloadFailures = 0;

  const images = await mapConcurrently(
    request.cards,
    FETCH_CONCURRENCY,
    async (card) => {
      const fetchStartedAt = performance.now();

      try {
        const image = await getImage({ id: card.id, imageUri: card.imageUri });
        const duration = performance.now() - fetchStartedAt;
        fetchDurations.push(duration);
        metrics.timer("merge.fetch.duration", duration, {
          outcome: image.wasCached ? "cache" : "remote",
        });
        return image;
      } catch (error) {
        const duration = performance.now() - fetchStartedAt;
        fetchDurations.push(duration);
        metrics.timer("merge.fetch.duration", duration, { outcome: "failed" });

        if (
          error instanceof ImageProvisionError &&
          error.code === "merge.image_fetch_failed"
        ) {
          downloadFailures += 1;
          metrics.counter("merge.download.failures", 1, { id: card.id });
        }

        throw error;
      }
    },
  );

  const cachedIds = images
    .filter((image) => image.wasCached)
    .map((image) => image.id);
  const downloadedIds = images
    .filter((image) => !image.wasCached)
    .map((image) => image.id);

  metrics.counter("merge.cache.hits", cachedIds.length, {
    total: request.cards.length,
  });
  metrics.counter("merge.cache.misses", downloadedIds.length, {
    total: request.cards.length,
  });

  if (downloadFailures > 0) {
    metrics.counter("merge.download.failures.total", downloadFailures);
  }

  const totalFetchDuration = fetchDurations.reduce(
    (acc, value) => acc + value,
    0,
  );
  metrics.timer("merge.fetch.total_duration", totalFetchDuration, {
    count: fetchDurations.length,
  });

  const compositionStartedAt = performance.now();
  const composition = await composeGrid(images, request.grid);
  const compositionDuration = performance.now() - compositionStartedAt;
  metrics.timer("merge.compose.duration", compositionDuration, {
    rows: request.grid.rows,
    columns: request.grid.columns,
  });

  const durationMs = performance.now() - startedAt;

  const contentType = composition.format === "png" ? "image/png" : "image/jpeg";

  return {
    buffer: composition.buffer,
    contentType,
    metadata: {
      totalRequested: request.cards.length,
      grid: request.grid,
      tile: {
        width: composition.tileWidth,
        height: composition.tileHeight,
      },
      output: {
        width: composition.width,
        height: composition.height,
        format: composition.format,
        contentType,
      },
      cached: cachedIds,
      downloaded: downloadedIds,
      durationMs,
      failures: [],
    },
  };
};
