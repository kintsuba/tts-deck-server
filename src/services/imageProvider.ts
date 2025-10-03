import { loadConfig } from "../config";
import { fromFetchedImage, type CachedAsset } from "../models/cachedAsset";
import { ImageFetchError, fetchImage } from "./imageFetcher";
import { getCachedImage, putCachedImage } from "./imageCache";

const config = loadConfig();
const MAX_IMAGE_BYTES =
  config.MAX_IMAGE_BYTES !== undefined
    ? Number(config.MAX_IMAGE_BYTES)
    : 10 * 1024 * 1024;

export interface ImageDescriptor {
  id: string;
  imageUri: string;
}

export interface ProvidedImage extends CachedAsset {
  wasCached: boolean;
}

interface ImageProvisionErrorOptions {
  cause?: unknown;
  status?: number;
  code?: string;
}

export class ImageProvisionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, options: ImageProvisionErrorOptions = {}) {
    super(message, options);
    this.name = "ImageProvisionError";
    this.status = options.status ?? 502;
    this.code = options.code ?? "merge.image_provision_failed";
  }
}

const ensureWithinSize = (asset: CachedAsset) => {
  if (asset.bytes > MAX_IMAGE_BYTES) {
    throw new ImageProvisionError(
      `Image ${asset.id} exceeds maximum allowed size (${asset.bytes} > ${MAX_IMAGE_BYTES})`,
      { status: 413, code: "merge.image_too_large" },
    );
  }
};

export const getImage = async (
  descriptor: ImageDescriptor,
): Promise<ProvidedImage> => {
  try {
    const cached = await getCachedImage(descriptor.id);

    if (cached) {
      ensureWithinSize(cached);
      return {
        ...cached,
        sourceUrl:
          cached.sourceUrl === "cache://unknown"
            ? descriptor.imageUri
            : cached.sourceUrl,
        wasCached: true,
      };
    }

    const remote = await fetchImage(descriptor.imageUri);
    const asset = fromFetchedImage(descriptor.id, remote);
    ensureWithinSize(asset);

    try {
      await putCachedImage(asset);
    } catch (cause) {
      throw new ImageProvisionError(
        `Failed to persist image ${descriptor.id} in cache`,
        { cause, code: "merge.image_cache_failed" },
      );
    }

    return {
      ...asset,
      wasCached: false,
    };
  } catch (cause) {
    if (cause instanceof ImageProvisionError) {
      throw cause;
    }

    if (cause instanceof ImageFetchError) {
      throw new ImageProvisionError(cause.message, {
        cause,
        status: cause.status ?? 502,
        code: "merge.image_fetch_failed",
      });
    }

    throw new ImageProvisionError(
      `Failed to resolve image ${descriptor.id} from ${descriptor.imageUri}`,
      { cause, code: "merge.image_provision_failed" },
    );
  }
};
