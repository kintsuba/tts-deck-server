import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { installFetchMock, applyTestEnv } from "../../test/setup";
import {
  getPutCommands,
  mockCachedImageMissing,
  resetS3Mock,
} from "../../test/utils/s3Mock";
import { loadConfig } from "../../config";

const TEST_BUCKET = "tts-deck-cache-test";

const createTestImage = async (seed: number) => {
  const palette = [seed % 255, (seed * 7) % 255, (seed * 13) % 255];

  return sharp({
    create: {
      width: 125 + (seed % 5),
      height: 175 + (seed % 5),
      channels: 4,
      background: { r: palette[0], g: palette[1], b: palette[2], alpha: 1 },
    },
  })
    .png()
    .toBuffer();
};

test("POST /merge merges a full deck with fresh downloads", async () => {
  applyTestEnv();
  const config = loadConfig();
  resetS3Mock();
  const fetchMock = installFetchMock();

  const cards: Array<{ id: string; imageUri: string }> = [];

  for (let index = 0; index < 69; index += 1) {
    const id = randomUUID();
    const imageUri = `https://cdn.example.com/cards/${index}.png`;
    cards.push({ id, imageUri });

    const buffer = await createTestImage(index);
    fetchMock.enqueueBuffer(buffer, {
      headers: {
        "content-type": "image/png",
        "content-length": String(buffer.byteLength),
      },
    });

    mockCachedImageMissing(`cache/${id}`, { bucket: TEST_BUCKET });
  }

  const hiddenBuffer = await createTestImage(999);
  const hiddenImage = `data:image/png;base64,${hiddenBuffer.toString("base64")}`;

  const payload = {
    cards,
    hiddenImage,
  };

  const { getApp } = await import("../../server");
  const app = getApp(config);

  try {
    const response = await app.request("/merge", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "image/png");
    assert.equal(
      response.headers.get("X-Merge-Metadata-Encoding"),
      "base64url",
    );

    const metadataHeader = response.headers.get("X-Merge-Metadata");
    assert.ok(metadataHeader, "metadata header should be present");
    const metadata = JSON.parse(
      Buffer.from(metadataHeader, "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    assert.equal(metadata.totalRequested, 70);
    assert.deepEqual(metadata.cached, []);
    const downloaded = new Set(metadata.downloaded as string[]);
    assert.equal(downloaded.size, 70);
    assert.ok(downloaded.has("hidden-image"));
    assert.equal((metadata.grid as { rows: number }).rows, 7);
    assert.equal((metadata.grid as { columns: number }).columns, 10);
    assert.equal(typeof (metadata.tile as { width: number }).width, "number");
    assert.equal(typeof metadata.durationMs, "number");
    assert.ok((metadata.durationMs as number) > 0);
    assert.deepEqual(metadata.failures, []);

    const putCommands = getPutCommands();
    assert.equal(putCommands.length, 69);
    for (const command of putCommands) {
      assert.equal(command.Bucket, TEST_BUCKET);
      assert.ok(command.Key?.startsWith("cache/"));
    }
  } finally {
    fetchMock.restore();
  }
});
