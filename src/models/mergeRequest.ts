import { z } from "zod";

export const GRID_COLUMNS = 10;
export const GRID_ROWS = 7;
export const MAX_CARDS = GRID_COLUMNS * GRID_ROWS;

export const mergeCardDescriptorSchema = z.object({
  id: z.uuid({ message: "Each card id must be a valid UUID" }),
  imageUri: z.url({ message: "imageUri must be a valid URL" }),
});

export const mergeRequestSchema = z
  .array(mergeCardDescriptorSchema)
  .min(1, "At least one card image must be provided")
  .max(
    MAX_CARDS,
    `A maximum of ${MAX_CARDS} images are supported for TTS import`,
  );

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
}

export class MergeRequestValidationError extends Error {
  constructor(readonly issues: z.ZodError["issues"]) {
    super("Merge request validation failed");
    this.name = "MergeRequestValidationError";
  }
}

export const parseMergeRequest = (payload: unknown): MergeRequest => {
  const result = mergeRequestSchema.safeParse(payload);

  if (!result.success) {
    throw new MergeRequestValidationError(result.error.issues);
  }

  const normalized = result.data.map((descriptor, index) => ({
    id: descriptor.id,
    imageUri: descriptor.imageUri,
    index,
  }));

  return {
    cards: normalized,
    grid: {
      rows: GRID_ROWS,
      columns: GRID_COLUMNS,
    },
    submittedAt: new Date(),
  };
};
