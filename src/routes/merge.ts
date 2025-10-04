import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { encodeMetadataHeader } from "../models/mergeResult";
import { MergeRequestValidationError } from "../models/mergeRequest";

const summarizePayload = (payload: unknown) => {
  if (Array.isArray(payload)) {
    const first = payload[0];
    return {
      payloadType: "array",
      cards: payload.length,
      firstId:
        typeof first === "object" && first && "id" in first
          ? (first as { id?: unknown }).id
          : undefined,
    };
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const cards = Array.isArray(record.cards) ? record.cards : [];
    const first = cards[0];
    const hiddenImage = typeof record.hiddenImage === "string";

    const hiddenImageValue = hiddenImage
      ? String(record.hiddenImage)
      : undefined;
    const commaIndex = hiddenImageValue?.indexOf(",") ?? -1;
    const descriptor =
      hiddenImageValue && commaIndex > 5
        ? hiddenImageValue.slice(5, commaIndex)
        : undefined;
    const [hiddenImageMime, hiddenImageEncoding] = descriptor
      ? descriptor.split(";")
      : [undefined, undefined];

    return {
      payloadType: "object",
      keys: Object.keys(record).slice(0, 10),
      cards: cards.length,
      firstId:
        typeof first === "object" && first && "id" in first
          ? (first as { id?: unknown }).id
          : undefined,
      hiddenImage,
      hiddenImageLength: hiddenImageValue?.length,
      hiddenImageMime,
      hiddenImageEncoding,
      hiddenImagePreview: hiddenImageValue?.slice(0, 120),
    };
  }

  return {
    payloadType: typeof payload,
  };
};
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
    const payloadSummary = summarizePayload(payload);

    requestLogger?.info("merge.received", {
      payloadBytes,
      ...payloadSummary,
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
        if (requestLogger) {
          const issueSummaries = error.issues.map((issue) =>
            summarizeIssue(issue),
          );

          requestLogger.debug("merge.validation_issue_details", {
            payloadBytes,
            issues: issueSummaries,
            cardsPreview: summarizeCards(payload),
          });

          requestLogger.warn("merge.validation_failed", {
            payloadBytes,
            issues: error.issues.length,
          });
        }
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

const summarizeIssue = (issue: unknown) => {
  if (!issue || typeof issue !== "object") {
    return { code: "unknown", message: "Non-object issue", raw: issue };
  }

  const record = issue as Record<string, unknown> & {
    code?: string;
    message?: string;
    path?: unknown;
    unionErrors?: unknown;
  };

  const code = typeof record.code === "string" ? record.code : "unknown";
  const message =
    typeof record.message === "string" ? record.message : undefined;
  const path = Array.isArray(record.path) ? record.path : undefined;
  let unionIssues: unknown;

  if (code === "invalid_union" && Array.isArray(record.unionErrors)) {
    unionIssues = record.unionErrors.map((unionError) => {
      if (!unionError || typeof unionError !== "object") {
        return unionError;
      }

      const unionRecord = unionError as { issues?: unknown };
      if (!Array.isArray(unionRecord.issues)) {
        return unionError;
      }

      return unionRecord.issues.map((unionIssue) => {
        if (!unionIssue || typeof unionIssue !== "object") {
          return unionIssue;
        }

        const entry = unionIssue as Record<string, unknown>;
        return {
          code: typeof entry.code === "string" ? entry.code : "unknown",
          message:
            typeof entry.message === "string" ? entry.message : undefined,
          path: Array.isArray(entry.path) ? entry.path : undefined,
        };
      });
    });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(JSON.stringify(issue));
  } catch {
    raw = String(issue);
  }

  return {
    code,
    message,
    path,
    unionIssues,
    raw,
  };
};

const summarizeCards = (payload: unknown) => {
  if (Array.isArray(payload)) {
    return payload.slice(0, 3);
  }

  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { cards?: unknown }).cards)
  ) {
    return ((payload as { cards: unknown[] }).cards ?? []).slice(0, 3);
  }

  return undefined;
};
