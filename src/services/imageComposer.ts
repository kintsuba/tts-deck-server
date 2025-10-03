import sharp, { type Color } from 'sharp';
import { loadConfig } from '../config';
import type { ProvidedImage } from './imageProvider';
import { GRID_COLUMNS, GRID_ROWS } from '../models/mergeRequest';

const config = loadConfig();

export interface CompositeResult {
  buffer: Buffer;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  format: 'png' | 'jpeg';
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
  images: readonly ProvidedImage[],
  grid: GridDimensions = DEFAULT_GRID,
): Promise<CompositeResult> => {
  if (images.length === 0) {
    throw new Error('At least one image is required to compose grid');
  }

  const metadataList = await Promise.all(
    images.map(async (image) => {
      const metadata = await sharp(image.data).metadata();

      if (!metadata.width || !metadata.height) {
        throw new Error(`Unable to determine dimensions for image ${image.id}`);
      }

      return {
        id: image.id,
        width: metadata.width,
        height: metadata.height,
      };
    }),
  );

  const tileWidth = Math.max(...metadataList.map((meta) => meta.width));
  const tileHeight = Math.max(...metadataList.map((meta) => meta.height));

  if (!Number.isFinite(tileWidth) || !Number.isFinite(tileHeight)) {
    throw new Error('Failed to resolve tile dimensions');
  }

  const background = config.MERGE_OUTPUT_FORMAT === 'png'
    ? { r: 0, g: 0, b: 0, alpha: 0 }
    : { r: 0, g: 0, b: 0, alpha: 1 };

  const preparedBuffers: Buffer[] = [];

  const totalCells = grid.rows * grid.columns;
  const channels = config.MERGE_OUTPUT_FORMAT === 'png' ? 4 : 3;

  const blankTile = await sharp({
    create: {
      width: tileWidth,
      height: tileHeight,
      channels,
      background: background as Color,
    },
  })
    .toFormat(config.MERGE_OUTPUT_FORMAT)
    .toBuffer();

  for (const image of images) {
    let pipeline = sharp(image.data).resize(tileWidth, tileHeight, {
      fit: 'contain',
      background,
    });

    if (config.MERGE_OUTPUT_FORMAT === 'jpeg') {
      pipeline = pipeline.flatten({ background });
    }

    const prepared = await pipeline
      .toFormat(config.MERGE_OUTPUT_FORMAT)
      .toBuffer();

    preparedBuffers.push(prepared);
  }

  if (preparedBuffers.length < totalCells) {
    preparedBuffers.push(...Array.from({ length: totalCells - preparedBuffers.length }, () => blankTile));
  }

  const composites = preparedBuffers.slice(0, totalCells).map((buffer, index) => {
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

  if (config.MERGE_OUTPUT_FORMAT === 'png') {
    composed.png({ compressionLevel: 9 });
  } else {
    composed.jpeg({ quality: 90, chromaSubsampling: '4:4:4' });
  }

  const buffer = await composed.toBuffer();

  return {
    buffer,
    width: outputWidth,
    height: outputHeight,
    tileWidth,
    tileHeight,
    format: config.MERGE_OUTPUT_FORMAT,
  };
};
