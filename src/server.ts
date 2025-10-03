import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { registerMergeRoute } from "./routes/merge";
import { logger } from "./utils/logger";
import { s3Client } from "./lib/s3Client";
import { AppConfig } from "./config";

export const getApp = (config: AppConfig) => {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const requestId = randomUUID();
    const startedAt = performance.now();
    const requestLogger = logger.child({
      requestId,
      method: c.req.method,
      path: c.req.path,
    });

    c.set("logger", requestLogger);
    c.set("requestId", requestId);

    try {
      await next();
      const durationMs = performance.now() - startedAt;
      const metrics =
        (c.get("mergeMetrics") as Record<string, unknown> | undefined) ?? {};
      const status = (c.res?.status ?? c.get("responseStatus")) as
        | number
        | undefined;
      requestLogger.info("request.completed", {
        durationMs,
        status,
        ...metrics,
      });
    } catch (error) {
      const durationMs = performance.now() - startedAt;
      requestLogger.error("request.failed", error, {
        durationMs,
      });
      throw error;
    }
  });

  registerMergeRoute(app);
  app.get("/healthz", async (c) => {
    const diagnostics: Record<string, unknown> = {
      s3: { ok: true },
      sharp: { ok: true },
    };
    let ok = true;

    try {
      await s3Client.send(
        new HeadBucketCommand({ Bucket: config.AWS_S3_BUCKET })
      );
    } catch (error) {
      ok = false;
      diagnostics.s3 = {
        ok: false,
        error: (error as Error).message,
      };
    }

    try {
      await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();
    } catch (error) {
      ok = false;
      diagnostics.sharp = {
        ok: false,
        error: (error as Error).message,
      };
    }

    if (ok) {
      return c.json({ status: "ok" });
    }

    return c.json({ status: "unhealthy", diagnostics }, 503);
  });

  app.notFound((c) => c.json({ message: "Not Found" }, 404));

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      const candidate = err.status ?? 500;
      const status = (
        candidate >= 100 && candidate <= 599 ? candidate : 500
      ) as ContentfulStatusCode;
      const message = err.message || "Unhandled error";

      return c.json(
        {
          message,
          detail: err.cause ?? null,
        },
        status
      );
    }

    console.error("Unexpected error", err);

    return c.json({ message: "Internal Server Error" }, 500);
  });

  return app;
};
