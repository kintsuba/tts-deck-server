import sharp, { type Color } from "sharp";
import { getMergeOutputFormat } from "../config";
import type { ProvidedImage } from "./imageProvider";
import { GRID_COLUMNS, GRID_ROWS } from "../models/mergeRequest";
import { CARD_WIDTH, CARD_HEIGHT } from "../models/cardDimensions";

const OUTPUT_FORMAT = getMergeOutputFormat();
export interface CompositeResult {
  buffer: Buffer;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  format: "png" | "jpeg";
}

export interface GridDimensions {
  rows: number;
  columns: number;
}

const DEFAULT_GRID: GridDimensions = {
  rows: GRID_ROWS,
  columns: GRID_COLUMNS,
};

export const composeGrid = async (
  images: readonly (ProvidedImage | undefined)[],
  grid: GridDimensions = DEFAULT_GRID
): Promise<CompositeResult> => {
  if (!images.some((image) => image)) {
    throw new Error("At least one image is required to compose grid");
  }

  const tileWidth = CARD_WIDTH;
  const tileHeight = CARD_HEIGHT;

  const background =
    OUTPUT_FORMAT === "png"
      ? { r: 0, g: 0, b: 0, alpha: 0 }
      : { r: 0, g: 0, b: 0, alpha: 1 };

  const totalCells = grid.rows * grid.columns;
  const channels = OUTPUT_FORMAT === "png" ? 4 : 3;

  const blankTile = await sharp({
    create: {
      width: tileWidth,
      height: tileHeight,
      channels,
      background: background as Color,
    },
  })
    .toFormat(OUTPUT_FORMAT)
    .toBuffer();

  const preparedBuffers: Buffer[] = Array.from(
    { length: totalCells },
    () => blankTile,
  );

  for (let index = 0; index < Math.min(images.length, totalCells); index++) {
    const image = images[index];

    if (!image) {
      continue;
    }

    let pipeline = sharp(image.data).resize(tileWidth, tileHeight, {
      fit: "contain",
      background,
    });

    if (OUTPUT_FORMAT === "jpeg") {
      pipeline = pipeline.flatten({ background });
    }

    const prepared = await pipeline.toFormat(OUTPUT_FORMAT).toBuffer();
    preparedBuffers[index] = prepared;
  }

  const composites = preparedBuffers.map((buffer, index) => {
      const x = index % grid.columns;
      const y = Math.floor(index / grid.columns);

      return {
        input: buffer,
        top: y * tileHeight,
        left: x * tileWidth,
      };
    });

  const outputWidth = tileWidth * grid.columns;
  const outputHeight = tileHeight * grid.rows;

  const canvas = sharp({
    create: {
      width: outputWidth,
      height: outputHeight,
      channels,
      background: background as Color,
    },
  });

  const composed = canvas.composite(composites);

  if (OUTPUT_FORMAT === "png") {
    composed.png({ compressionLevel: 9 });
  } else {
    composed.jpeg({ quality: 90, chromaSubsampling: "4:4:4" });
  }

  const buffer = await composed.toBuffer();

  return {
    buffer,
    width: outputWidth,
    height: outputHeight,
    tileWidth,
    tileHeight,
    format: OUTPUT_FORMAT,
  };
};
