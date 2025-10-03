import { Blob } from "node:buffer";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

const toAsyncIterable = (body: unknown): AsyncIterable<Uint8Array> | null => {
  if (!body) {
    return null;
  }

  if (isAsyncIterable(body)) {
    return body;
  }

  if (body instanceof Readable) {
    return body as unknown as AsyncIterable<Uint8Array>;
  }

  if (isWebReadableStream(body)) {
    const reader = body.getReader();

    return {
      async *[Symbol.asyncIterator]() {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            reader.releaseLock();
            return;
          }

          if (value) {
            yield value;
          }
        }
      },
    };
  }

  return null;
};

export const readStream = async (
  body: unknown,
  limit = Number.POSITIVE_INFINITY,
): Promise<Buffer> => {
  if (!body) {
    throw new Error("Empty body received from stream");
  }

  if (body instanceof Buffer) {
    if (body.byteLength > limit) {
      throw new Error("Stream exceeded configured limit");
    }

    return body;
  }

  if (body instanceof Uint8Array) {
    if (body.byteLength > limit) {
      throw new Error("Stream exceeded configured limit");
    }

    return Buffer.from(body);
  }

  if (typeof (body as Blob)?.arrayBuffer === "function") {
    const arrayBuffer = await (body as Blob).arrayBuffer();
    if (arrayBuffer.byteLength > limit) {
      throw new Error("Stream exceeded configured limit");
    }

    return Buffer.from(arrayBuffer);
  }

  const iterable = toAsyncIterable(body);

  if (!iterable) {
    throw new Error("Unsupported body type received from stream");
  }

  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of iterable) {
    const buf = Buffer.from(chunk);
    total += buf.byteLength;

    if (total > limit) {
      throw new Error("Stream exceeded configured limit");
    }

    chunks.push(buf);
  }

  return Buffer.concat(chunks, total);
};

export const toBuffer = async (
  body: unknown,
  limit?: number,
): Promise<Buffer> => readStream(body, limit);

const isAsyncIterable = (
  value: unknown,
): value is AsyncIterable<Uint8Array> => {
  if (!value) {
    return false;
  }

  return (
    typeof (value as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] ===
    "function"
  );
};

const isWebReadableStream = (
  value: unknown,
): value is WebReadableStream<Uint8Array> => {
  if (!value) {
    return false;
  }

  return (
    typeof (value as WebReadableStream<Uint8Array>).getReader === "function"
  );
};
