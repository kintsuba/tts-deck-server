import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { applyTestEnv } from "../../test/setup";
import {
  getPutCommands,
  mockCachedImage,
  resetS3Mock,
} from "../../test/utils/s3Mock";
import { loadConfig } from "../../config";

const TEST_BUCKET = "tts-deck-cache-test";

const createSolidImage = async (color: {
  r: number;
  g: number;
  b: number;
}): Promise<Buffer> =>
  sharp({
    create: {
      width: 120,
      height: 200,
      channels: 4,
      background: { ...color, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

test("POST /merge appends hidden image to the composition", async () => {
  applyTestEnv();
  const config = loadConfig();
  resetS3Mock();

  const cards: Array<{ id: string; imageUri: string }> = [];

  for (const index of [0, 1]) {
    const id = randomUUID();
    const imageUri = `https://cdn.example.com/cards/${index}.png`;
    cards.push({ id, imageUri });

    const buffer = await createSolidImage({
      r: (index + 1) * 50,
      g: (index + 1) * 40,
      b: (index + 1) * 30,
    });

    mockCachedImage(`cache/${id}`, buffer, "image/png", {
      bucket: TEST_BUCKET,
    });
  }

  const hiddenImageBuffer = await sharp({
    create: {
      width: 80,
      height: 80,
      channels: 4,
      background: { r: 5, g: 180, b: 90, alpha: 1 },
    },
  })
    .jpeg()
    .toBuffer();

  const hiddenImage = `data:image/jpeg;base64,${hiddenImageBuffer.toString("base64")}`;

  const { getApp } = await import("../../server");
  const app = getApp(config);

  const response = await app.request("/merge", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ cards, hiddenImage }),
  });

  assert.equal(response.status, 200);
  const metadataHeader = response.headers.get("X-Merge-Metadata");
  assert.ok(metadataHeader, "metadata header should be present");

  const metadata = JSON.parse(
    Buffer.from(metadataHeader, "base64url").toString("utf8")
  ) as {
    totalRequested: number;
    downloaded: string[];
    cached: string[];
  };

  assert.equal(metadata.totalRequested, 3);
  assert.deepEqual(metadata.cached.sort(), cards.map((card) => card.id).sort());
  assert.ok(metadata.downloaded.includes("hidden-image"));
  assert.equal(
    metadata.downloaded.filter((id) => id !== "hidden-image").length,
    0
  );

  const putCommands = getPutCommands();
  assert.equal(putCommands.length, 0);
});
