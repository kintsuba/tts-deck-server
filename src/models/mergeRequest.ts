import { z } from "zod";

export const GRID_COLUMNS = 10;
export const GRID_ROWS = 7;
export const MAX_CARDS = GRID_COLUMNS * GRID_ROWS;
export const MAX_VISIBLE_CARDS = MAX_CARDS - 1;

const ALLOWED_HIDDEN_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
]);
const BASE64_DATA_PATTERN = /^[0-9A-Za-z+/=]*$/;

export interface HiddenImage {
  data: Buffer;
  contentType: "image/png" | "image/jpeg";
}

export const mergeCardDescriptorSchema = z.object({
  id: z.uuid({ message: "Each card id must be a valid UUID" }),
  imageUri: z.url({ message: "imageUri must be a valid URL" }),
});

const mergeCardArraySchema = z
  .array(mergeCardDescriptorSchema)
  .min(1, "At least one card image must be provided")
  .max(
    MAX_VISIBLE_CARDS,
    `A maximum of ${MAX_VISIBLE_CARDS} card images are supported; the final slot is reserved for the hidden image`
  );

const hiddenImageSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value.length === 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "hiddenImage must be a base64 encoded data URI (image/png or image/jpeg)",
        path: ["hiddenImage"],
      });
      return z.NEVER;
    }

    if (!value.startsWith("data:")) {
      ctx.addIssue({
        code: "custom",
        message:
          "hiddenImage must be a base64 encoded data URI (image/png or image/jpeg)",
        path: ["hiddenImage"],
      });
      return z.NEVER;
    }

    const commaIndex = value.indexOf(",");

    if (commaIndex === -1) {
      ctx.addIssue({
        code: "custom",
        message:
          "hiddenImage must be a base64 encoded data URI (image/png or image/jpeg)",
        path: ["hiddenImage"],
      });
      return z.NEVER;
    }

    const header = value.slice(5, commaIndex);
    const dataSection = value.slice(commaIndex + 1);

    const headerParts = header.split(";").map((part) => part.trim());
    const mime = headerParts.shift()?.toLowerCase();

    if (!mime || !ALLOWED_HIDDEN_IMAGE_MIME_TYPES.has(mime)) {
      ctx.addIssue({
        code: "custom",
        message:
          "hiddenImage must declare a supported image mime type (image/png or image/jpeg)",
        path: ["hiddenImage"],
      });
      return z.NEVER;
    }

    const hasBase64Flag = headerParts.some(
      (part) => part.toLowerCase() === "base64"
    );

    if (!hasBase64Flag) {
      ctx.addIssue({
        code: "custom",
        message: "hiddenImage must include base64 encoding", // more precise
        path: ["hiddenImage"],
      });
      return z.NEVER;
    }

    const encoded = dataSection;

    try {
      const sanitized = encoded.replace(/\s+/g, "");
      if (sanitized.length === 0) {
        throw new Error("empty");
      }

      const normalizedBase64 = sanitized.replace(/-/g, "+").replace(/_/g, "/");

      if (!BASE64_DATA_PATTERN.test(normalizedBase64)) {
        throw new Error("invalid_chars");
      }

      const paddingRemainder = normalizedBase64.length % 4;
      const paddedBase64 =
        paddingRemainder === 0
          ? normalizedBase64
          : normalizedBase64 + "=".repeat(4 - paddingRemainder);

      const data = Buffer.from(paddedBase64, "base64");

      if (data.byteLength === 0) {
        throw new Error("empty");
      }

      const normalizedFormat = mime === "image/png" ? "png" : "jpeg";
      const contentType =
        `image/${normalizedFormat}` as HiddenImage["contentType"];

      return {
        data,
        contentType,
      } satisfies HiddenImage;
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "hiddenImage must contain valid base64 image data",
        path: ["hiddenImage"],
      });
      return z.NEVER;
    }
  });

const structuredMergeRequestSchema = z.object({
  cards: mergeCardArraySchema,
  hiddenImage: hiddenImageSchema.optional(),
});

export const mergeRequestSchema = z.union([
  mergeCardArraySchema,
  structuredMergeRequestSchema,
]);

export interface MergeCardDescriptor {
  id: string;
  imageUri: string;
  index: number;
}

export interface MergeRequest {
  cards: MergeCardDescriptor[];
  grid: {
    rows: number;
    columns: number;
  };
  submittedAt: Date;
  hiddenImage?: HiddenImage;
}

export class MergeRequestValidationError extends Error {
  constructor(readonly issues: z.ZodError["issues"]) {
    super("Merge request validation failed");
    this.name = "MergeRequestValidationError";
  }
}

const normalizeDescriptors = (
  descriptors: ReadonlyArray<{ id: string; imageUri: string }>
): MergeCardDescriptor[] =>
  descriptors.map((descriptor, index) => ({
    id: descriptor.id,
    imageUri: descriptor.imageUri,
    index,
  }));

export const parseMergeRequest = (payload: unknown): MergeRequest => {
  const result = mergeRequestSchema.safeParse(payload);

  if (!result.success) {
    throw new MergeRequestValidationError(result.error.issues);
  }

  const { cards, hiddenImage } = Array.isArray(result.data)
    ? { cards: result.data, hiddenImage: undefined }
    : result.data;

  const normalized = normalizeDescriptors(cards);

  const base: Omit<MergeRequest, "hiddenImage"> = {
    cards: normalized,
    grid: {
      rows: GRID_ROWS,
      columns: GRID_COLUMNS,
    },
    submittedAt: new Date(),
  };

  return hiddenImage ? { ...base, hiddenImage } : base;
};
