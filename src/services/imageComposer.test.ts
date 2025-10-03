import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { applyTestEnv } from '../test/setup';
import { resetConfigCache } from '../config';
import { fromFetchedImage } from '../models/cachedAsset';
import type { ProvidedImage } from './imageProvider';

const reloadComposer = async () => {
  resetConfigCache();
  const moduleId = require.resolve('./imageComposer');
  delete require.cache[moduleId];
  return import('./imageComposer');
};

const createImage = async (
  width: number,
  height: number,
  options: { wasCached?: boolean; format?: 'png' | 'jpeg' } = {},
): Promise<ProvidedImage> => {
  const format = options.format ?? 'png';
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 50, g: 100, b: 150, alpha: 1 },
    },
  })
    .toFormat(format)
    .toBuffer();

  const asset = fromFetchedImage(randomUUID(), {
    buffer,
    bytes: buffer.byteLength,
    contentType: format === 'png' ? 'image/png' : 'image/jpeg',
    url: 'https://example.com/card.png',
  });

  return {
    ...asset,
    wasCached: options.wasCached ?? false,
  };
};

test('composeGrid computes tile size from the largest source image', async () => {
  applyTestEnv({ MERGE_OUTPUT_FORMAT: 'png' });
  const { composeGrid } = await reloadComposer();

  const images = [
    await createImage(100, 150),
    await createImage(120, 180),
    await createImage(90, 160),
  ];

  const result = await composeGrid(images, { rows: 1, columns: 3 });

  assert.equal(result.tileWidth, 120);
  assert.equal(result.tileHeight, 180);
  assert.equal(result.width, 360);
  assert.equal(result.height, 180);
});

test('composeGrid pads empty cells when fewer images are supplied', async () => {
  applyTestEnv({ MERGE_OUTPUT_FORMAT: 'png' });
  const { composeGrid } = await reloadComposer();

  const images = [await createImage(80, 120), await createImage(80, 120)];

  const result = await composeGrid(images, { rows: 2, columns: 2 });
  const metadata = await sharp(result.buffer).metadata();

  assert.equal(result.width, result.tileWidth * 2);
  assert.equal(result.height, result.tileHeight * 2);
  assert.equal(metadata.width, result.width);
  assert.equal(metadata.height, result.height);
});

test('composeGrid honours jpeg output configuration', async () => {
  applyTestEnv({ MERGE_OUTPUT_FORMAT: 'jpeg' });
  const { composeGrid } = await reloadComposer();

  const image = await createImage(90, 90, { format: 'jpeg' });

  const result = await composeGrid([image], { rows: 1, columns: 1 });
  const metadata = await sharp(result.buffer).metadata();

  assert.equal(result.format, 'jpeg');
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.hasAlpha, false);
});
