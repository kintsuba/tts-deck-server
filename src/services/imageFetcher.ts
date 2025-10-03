import { loadConfig } from '../config';
import { readStream } from '../utils/stream';

const config = loadConfig();

const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);

export interface FetchImageResult {
  buffer: Buffer;
  bytes: number;
  contentType: string;
  url: string;
}

export class ImageFetchError extends Error {
  constructor(message: string, readonly status?: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ImageFetchError';
  }
}

export const fetchImage = async (uri: string): Promise<FetchImageResult> => {
  let url: URL;

  try {
    url = new URL(uri);
  } catch (cause) {
    throw new ImageFetchError(`Invalid imageUri provided: ${uri}`, undefined, { cause });
  }

  if (!SUPPORTED_PROTOCOLS.has(url.protocol)) {
    throw new ImageFetchError(`Unsupported protocol for imageUri: ${url.protocol}`);
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), config.FETCH_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
  } catch (cause) {
    if ((cause as Error)?.name === 'AbortError') {
      throw new ImageFetchError(`Timed out fetching image: ${url}`, 408, { cause });
    }

    const reason = (cause as Error)?.message ? ` (${(cause as Error).message})` : '';
    throw new ImageFetchError(`Failed to fetch image: ${url}${reason}`, undefined, { cause });
  } finally {
    globalThis.clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new ImageFetchError(
      `Remote server responded with ${response.status} for ${url}`,
      response.status,
    );
  }

  const contentTypeRaw = response.headers.get('content-type');
  const contentType = contentTypeRaw?.split(';')[0]?.trim() ?? '';

  if (!contentType || !contentType.startsWith('image/')) {
    throw new ImageFetchError(`Unsupported content-type for ${url}: ${contentTypeRaw ?? 'unknown'}`);
  }

  const lengthHeader = response.headers.get('content-length');

  if (lengthHeader) {
    const bytes = Number.parseInt(lengthHeader, 10);

    if (Number.isFinite(bytes) && bytes > config.MAX_IMAGE_BYTES) {
      throw new ImageFetchError(
        `Image at ${url} exceeds maximum allowed size (${bytes} > ${config.MAX_IMAGE_BYTES})`,
      );
    }
  }

  const bodySource = response.body ?? new Uint8Array(await response.arrayBuffer());

  const buffer = await readStream(bodySource, config.MAX_IMAGE_BYTES);

  return {
    buffer,
    bytes: buffer.byteLength,
    contentType,
    url: url.toString(),
  };
};
