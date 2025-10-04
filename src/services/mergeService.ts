import { performance } from "node:perf_hooks";
import sharp from "sharp";
import type { ZodError } from "zod";
import { getFetchConcurrency } from "../config";
import {
  parseMergeRequest,
  type MergeRequest,
  type HiddenImage,
  MergeRequestValidationError,
} from "../models/mergeRequest";
import type { MergeResult } from "../models/mergeResult";
import { composeGrid } from "./imageComposer";
import {
  getImage,
  ImageProvisionError,
  type ProvidedImage,
} from "./imageProvider";
import { mapConcurrently } from "../utils/promise";
import { metrics } from "../utils/metrics";
import { CARD_WIDTH, CARD_HEIGHT } from "../models/cardDimensions";
import { computeChecksum } from "../models/cachedAsset";

const FETCH_CONCURRENCY = getFetchConcurrency();

const HIDDEN_IMAGE_ID = "hidden-image";
const HIDDEN_IMAGE_SOURCE_URL = "inline://hidden-image";
const RESIZE_BACKGROUND = { r: 0, g: 0, b: 0, alpha: 0 } as const;
const hiddenImageIssue: ZodError["issues"][number] = {
  code: "custom",
  message: "hiddenImage must decode to a valid PNG or JPEG image",
  path: ["hiddenImage"],
};

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

  const totalCells = request.grid.rows * request.grid.columns;
  const hiddenImageIndex = totalCells - 1;

  if (request.cards.length > hiddenImageIndex) {
    throw new MergeRequestValidationError([
      {
        code: "custom",
        message: `cards must contain ${hiddenImageIndex} items or fewer to reserve the final slot for the hidden image`,
        path: ["cards"],
      },
    ]);
  }

  const imagesBySlot: (ProvidedImage | undefined)[] =
    Array.from({ length: totalCells });

  images.forEach((image, index) => {
    const slotIndex = request.cards[index]?.index ?? index;
    imagesBySlot[slotIndex] = image;
  });

  let hiddenImage: ProvidedImage | undefined;

  if (request.hiddenImage) {
    hiddenImage = await provideHiddenImage(request.hiddenImage);
    imagesBySlot[hiddenImageIndex] = hiddenImage;
  }

  const imageList: ProvidedImage[] = hiddenImage
    ? [...images, hiddenImage]
    : [...images];

  const cachedIds = imageList
    .filter((image) => image.wasCached)
    .map((image) => image.id);
  const downloadedIds = imageList
    .filter((image) => !image.wasCached)
    .map((image) => image.id);

  metrics.counter("merge.cache.hits", cachedIds.length, {
    total: imageList.length,
  });
  metrics.counter("merge.cache.misses", downloadedIds.length, {
    total: imageList.length,
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
  const composition = await composeGrid(imagesBySlot, request.grid);
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
      totalRequested: imageList.length,
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

const provideHiddenImage = async (
  hiddenImage: HiddenImage,
): Promise<ProvidedImage> => {
  try {
    let pipeline = sharp(hiddenImage.data).resize(CARD_WIDTH, CARD_HEIGHT, {
      fit: "contain",
      background: RESIZE_BACKGROUND,
    });

    if (hiddenImage.contentType === "image/jpeg") {
      pipeline = pipeline.flatten({ background: RESIZE_BACKGROUND });
    }

    const format = hiddenImage.contentType.endsWith("jpeg") ? "jpeg" : "png";
    const buffer = await pipeline.toFormat(format).toBuffer();

    return {
      id: HIDDEN_IMAGE_ID,
      data: buffer,
      contentType: hiddenImage.contentType,
      bytes: buffer.byteLength,
      checksum: computeChecksum(buffer),
      cachedAt: new Date(),
      sourceUrl: HIDDEN_IMAGE_SOURCE_URL,
      wasCached: false,
    };
  } catch (error) {
    console.error("[mergeService] hidden image processing failed", {
      name: (error as Error)?.name,
      message: (error as Error)?.message,
    });
    throw new MergeRequestValidationError([hiddenImageIssue]);
  }
};
