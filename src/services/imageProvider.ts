import { getMaxImageBytes } from "../config";
import { fromFetchedImage, type CachedAsset } from "../models/cachedAsset";
import { ImageFetchError, fetchImage } from "./imageFetcher";
import { getCachedImage, putCachedImage } from "./imageCache";

const MAX_IMAGE_BYTES = getMaxImageBytes();

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
  console.debug("[imageProvider] getImage start", {
    id: descriptor.id,
    imageUri: descriptor.imageUri,
  });
  try {
    const cached = await getCachedImage(descriptor.id);

    if (cached) {
      console.debug("[imageProvider] cache hit", {
        id: descriptor.id,
        bytes: cached.bytes,
        sourceUrl: cached.sourceUrl,
      });
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
    console.debug("[imageProvider] fetched remote image", {
      id: descriptor.id,
      bytes: remote.bytes,
      contentType: remote.contentType,
      resolvedUrl: remote.url,
    });
    const asset = fromFetchedImage(descriptor.id, remote);
    ensureWithinSize(asset);

    try {
      await putCachedImage(asset);
      console.debug("[imageProvider] cached remote image", {
        id: descriptor.id,
        bytes: asset.bytes,
      });
    } catch (cause) {
      console.error("[imageProvider] failed to cache image", {
        id: descriptor.id,
        message: (cause as Error)?.message,
      });
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
    console.error("[imageProvider] getImage failed", {
      id: descriptor.id,
      imageUri: descriptor.imageUri,
      name: (cause as Error)?.name,
      message: (cause as Error)?.message,
      status: (cause as ImageFetchError | ImageProvisionError)?.status,
      code: (cause as ImageProvisionError)?.code,
      causeName: (cause as { cause?: { name?: string } })?.cause?.name,
      causeMessage: (cause as { cause?: { message?: string } })?.cause?.message,
    });
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
