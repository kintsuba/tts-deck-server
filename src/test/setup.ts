import { randomUUID } from 'node:crypto';
import { loadConfig, resetConfigCache } from '../config';

type FetchResponder = () => Response | Promise<Response>;

type FetchErrorFactory = () => unknown;

export const DEFAULT_ENV = {
  PORT: '3000',
  AWS_ENDPOINT_URL: 'http://127.0.0.1:4566',
  AWS_DEFAULT_REGION: 'us-east-1',
  AWS_S3_BUCKET_NAME: 'tts-deck-cache-test',
  AWS_ACCESS_KEY_ID: 'local-access-key',
  AWS_SECRET_ACCESS_KEY: 'local-secret-key',
  MERGE_OUTPUT_FORMAT: 'png',
  CACHE_PREFIX: 'cache/',
  MAX_IMAGE_BYTES: String(10 * 1024 * 1024),
  FETCH_TIMEOUT_MS: '15000',
  FETCH_CONCURRENCY: '5',
};

type EnvOverrides = Partial<Record<keyof typeof DEFAULT_ENV, string>>;

const DEFAULT_FETCH_HEADERS = {
  'content-type': 'image/png',
};

export const applyTestEnv = (overrides: EnvOverrides = {}) => {
  const merged = { ...DEFAULT_ENV, ...overrides };

  Object.keys(DEFAULT_ENV).forEach((key) => {
    delete process.env[key];
  });

  for (const [key, value] of Object.entries(merged)) {
    process.env[key] = value;
  }

  resetConfigCache();
  return merged;
};

export const loadTestConfig = (overrides: EnvOverrides = {}) => {
  const env = applyTestEnv(overrides);
  return loadConfig(env);
};

export const withRequestId = () => randomUUID();

export interface FetchMockController {
  readonly calls: Array<{ url: string; init?: RequestInit | undefined }>;
  enqueueResponse: (factory: FetchResponder) => void;
  enqueueJson: (payload: unknown, init?: ResponseInit) => void;
  enqueueBuffer: (data: Buffer | Uint8Array, init?: ResponseInit) => void;
  enqueueError: (factory: FetchErrorFactory) => void;
  restore: () => void;
}

export const installFetchMock = (): FetchMockController => {
  const originalFetch = globalThis.fetch;
  const queue: Array<
    | { kind: 'response'; factory: FetchResponder }
    | { kind: 'error'; factory: FetchErrorFactory }
  > = [];
  const calls: Array<{ url: string; init?: RequestInit | undefined }> = [];

  const controller: FetchMockController = {
    calls,
    enqueueResponse: (factory) => {
      queue.push({ kind: 'response', factory });
    },
    enqueueJson: (payload, init = {}) => {
      queue.push({
        kind: 'response',
        factory: () =>
          new Response(JSON.stringify(payload), {
            status: init.status ?? 200,
            headers: init.headers ?? { 'content-type': 'application/json' },
          }),
      });
    },
    enqueueBuffer: (data, init = {}) => {
      const headers = new Headers(init.headers ?? DEFAULT_FETCH_HEADERS);
      if (!headers.has('content-length')) {
        headers.set('content-length', String(data.byteLength));
      }

      queue.push({
        kind: 'response',
        factory: () =>
          new Response(data, {
            status: init.status ?? 200,
            headers,
          }),
      });
    },
    enqueueError: (factory) => {
      queue.push({ kind: 'error', factory });
    },
    restore: () => {
      globalThis.fetch = originalFetch;
      queue.length = 0;
      calls.length = 0;
    },
  };

  globalThis.fetch = (async (...rawArgs: Parameters<typeof globalThis.fetch>) => {
    const [input, init] = rawArgs;
    if (queue.length === 0) {
      throw new Error('Fetch mock queue is empty');
    }

    const next = queue.shift()!;

    const url = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });

    if (next.kind === 'response') {
      const result = next.factory();
      return result instanceof Promise ? await result : result;
    }

    throw next.factory();
  }) as typeof fetch;

  return controller;
};
