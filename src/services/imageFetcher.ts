import got, {
  CancelError,
  RequestError,
  TimeoutError,
  type Response,
} from "got";
import { loadConfig } from "../config";

const config = loadConfig();
const FETCH_TIMEOUT_MS =
  config.FETCH_TIMEOUT_MS !== undefined
    ? Number(config.FETCH_TIMEOUT_MS)
    : 15_000;
const MAX_IMAGE_BYTES =
  config.MAX_IMAGE_BYTES !== undefined
    ? Number(config.MAX_IMAGE_BYTES)
    : 10 * 1024 * 1024;

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

export interface FetchImageResult {
  buffer: Buffer;
  bytes: number;
  contentType: string;
  url: string;
}

export class ImageFetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ImageFetchError";
  }
}

export const fetchImage = async (uri: string): Promise<FetchImageResult> => {
  let url: URL;

  try {
    url = new URL(uri);
  } catch (cause) {
    throw new ImageFetchError(`Invalid imageUri provided: ${uri}`, undefined, {
      cause,
    });
  }

  if (!SUPPORTED_PROTOCOLS.has(url.protocol)) {
    throw new ImageFetchError(
      `Unsupported protocol for imageUri: ${url.protocol}`,
    );
  }

  const request = got.get(url.toString(), {
    timeout: { request: FETCH_TIMEOUT_MS },
    followRedirect: true,
    throwHttpErrors: false,
    retry: { limit: 0 },
    responseType: "buffer",
  });

  let canceledBytes: number | undefined;
  request.on("downloadProgress", ({ transferred }) => {
    if (transferred > MAX_IMAGE_BYTES && canceledBytes === undefined) {
      canceledBytes = transferred;
      request.cancel();
    }
  });
  let response: Response<Buffer>;
  let buffer: Buffer;

  try {
    console.debug("[imageFetcher] fetching", {
      url: url.toString(),
      timeoutMs: FETCH_TIMEOUT_MS,
    });
    response = await request;
    buffer = response.rawBody ?? response.body;
    console.debug("[imageFetcher] fetched", {
      url: response.url ?? url.toString(),
      statusCode: response.statusCode,
      bytes: buffer?.byteLength,
      contentType: response.headers["content-type"],
    });
  } catch (cause) {
    if (canceledBytes !== undefined) {
      console.warn("[imageFetcher] download canceled after exceeding limit", {
        url: url.toString(),
        transferred: canceledBytes,
        limit: MAX_IMAGE_BYTES,
      });
      throw new ImageFetchError(
        `Image at ${url} exceeds maximum allowed size (${canceledBytes} > ${MAX_IMAGE_BYTES})`,
        undefined,
        { cause },
      );
    }

    if (cause instanceof TimeoutError) {
      console.warn("[imageFetcher] timed out", {
        url: url.toString(),
        timeoutMs: FETCH_TIMEOUT_MS,
      });
      throw new ImageFetchError(`Timed out fetching image: ${url}`, 408, {
        cause,
      });
    }

    if (cause instanceof CancelError) {
      console.warn("[imageFetcher] request canceled", {
        url: url.toString(),
      });
      throw new ImageFetchError(`Request canceled while fetching image: ${url}`, undefined, {
        cause,
      });
    }

    if (cause instanceof RequestError) {
      const reason = cause.message ? ` (${cause.message})` : "";
      console.warn("[imageFetcher] request error", {
        url: url.toString(),
        code: cause.code,
        message: cause.message,
      });
      throw new ImageFetchError(
        `Failed to fetch image: ${url}${reason}`,
        undefined,
        { cause },
      );
    }

    console.error("[imageFetcher] unexpected error", {
      url: url.toString(),
      name: (cause as Error)?.name,
      message: (cause as Error)?.message,
    });
    throw new ImageFetchError(`Failed to fetch image: ${url}`, undefined, {
      cause,
    });
  }

  if (!response) {
    throw new ImageFetchError(`Missing response when fetching image: ${url}`);
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    console.warn("[imageFetcher] non-success status", {
      url: response.url ?? url.toString(),
      statusCode: response.statusCode,
    });
    throw new ImageFetchError(
      `Remote server responded with ${response.statusCode} for ${url}`,
      response.statusCode,
    );
  }

  const contentTypeHeader = response.headers["content-type"];
  const contentTypeRaw = Array.isArray(contentTypeHeader)
    ? contentTypeHeader[0]
    : contentTypeHeader;
  const contentType = contentTypeRaw?.split(";")[0]?.trim() ?? "";

  if (!contentType || !contentType.startsWith("image/")) {
    throw new ImageFetchError(
      `Unsupported content-type for ${url}: ${contentTypeRaw ?? "unknown"}`,
    );
  }

  const lengthHeader = response.headers["content-length"];

  if (lengthHeader) {
    const lengthValue = Array.isArray(lengthHeader) ? lengthHeader[0] : lengthHeader;
    const bytes = Number.parseInt(lengthValue ?? "", 10);

    if (Number.isFinite(bytes) && bytes > MAX_IMAGE_BYTES) {
      throw new ImageFetchError(
        `Image at ${url} exceeds maximum allowed size (${bytes} > ${MAX_IMAGE_BYTES})`,
      );
    }
  }

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new ImageFetchError(
      `Image at ${url} exceeds maximum allowed size (${buffer.byteLength} > ${MAX_IMAGE_BYTES})`,
    );
  }

  return {
    buffer,
    bytes: buffer.byteLength,
    contentType,
    url: response.url ?? url.toString(),
  };
};
