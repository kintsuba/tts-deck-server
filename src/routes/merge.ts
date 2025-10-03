import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { encodeMetadataHeader } from "../models/mergeResult";
import { MergeRequestValidationError } from "../models/mergeRequest";
import { mergeDeck } from "../services/mergeService";
import { ImageProvisionError } from "../services/imageProvider";
import type { Logger } from "../utils/logger";

export const registerMergeRoute = (app: Hono) => {
  app.post("/merge", async (c) => {
    let payload: unknown;
    const requestLogger = c.get("logger") as Logger | undefined;

    try {
      payload = await c.req.json();
    } catch (cause) {
      throw new HTTPException(400, { message: "Invalid JSON payload", cause });
    }

    const contentLength = c.req.header("content-length");
    const headerBytes = contentLength
      ? Number.parseInt(contentLength, 10)
      : Number.NaN;
    const payloadBytes = Number.isFinite(headerBytes)
      ? headerBytes
      : Buffer.byteLength(JSON.stringify(payload ?? {}));

    c.set("payloadBytes", payloadBytes);
    requestLogger?.info("merge.received", {
      payloadBytes,
    });

    try {
      const result = await mergeDeck(payload);
      const metrics = {
        payloadBytes,
        cacheHits: result.metadata.cached.length,
        downloads: result.metadata.downloaded.length,
        totalRequested: result.metadata.totalRequested,
        mergeDurationMs: result.metadata.durationMs,
      };

      const headers = new Headers({
        "Content-Type": result.contentType,
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="tts-merge.${result.metadata.output.format}"`,
        "X-Merge-Metadata": encodeMetadataHeader(result.metadata),
        "X-Merge-Metadata-Encoding": "base64url",
      });

      c.set("mergeMetrics", metrics);
      c.set("responseStatus", 200);
      requestLogger?.info("merge.completed", metrics);

      return new Response(result.buffer, { status: 200, headers });
    } catch (error) {
      if (error instanceof MergeRequestValidationError) {
        c.set("mergeMetrics", { payloadBytes });
        c.set("responseStatus", 422);
        requestLogger?.warn("merge.validation_failed", {
          payloadBytes,
          issues: error.issues.length,
        });
        const response = c.json(
          {
            message: "Request validation failed",
            code: "merge.request_invalid",
            detail: error.issues,
          },
          422,
        );
        response.headers.set("Content-Type", "application/json; charset=utf-8");
        return response;
      }

      if (error instanceof ImageProvisionError) {
        const status = (
          error.status && error.status >= 400 && error.status <= 599
            ? error.status
            : 502
        ) as ContentfulStatusCode;
        c.set("mergeMetrics", { payloadBytes, failure: error.code });
        c.set("responseStatus", status);
        requestLogger?.error("merge.provision_failed", error, {
          payloadBytes,
          code: error.code,
        });
        const response = c.json(
          {
            message: error.message,
            source: error.code?.includes("cache")
              ? "image_cache"
              : "image_fetch",
            code: error.code,
          },
          status,
        );
        response.headers.set("Content-Type", "application/json; charset=utf-8");
        return response;
      }

      requestLogger?.error("merge.unhandled_error", error, { payloadBytes });
      throw error;
    }
  });
};
