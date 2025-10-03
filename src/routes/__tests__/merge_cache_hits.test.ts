import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { installFetchMock, applyTestEnv } from "../../test/setup";
import {
  getPutCommands,
  mockCachedImage,
  mockCachedImageMissing,
  resetS3Mock,
} from "../../test/utils/s3Mock";
import { loadConfig } from "../../config";

const TEST_BUCKET = "tts-deck-cache-test";

const config = loadConfig();

const createTestImage = async (seed: number) => {
  return sharp({
    create: {
      width: 120,
      height: 170,
      channels: 4,
      background: {
        r: seed % 255,
        g: (seed * 5) % 255,
        b: (seed * 11) % 255,
        alpha: 1,
      },
    },
  })
    .png()
    .toBuffer();
};

test("POST /merge reuses cached entries without refetching", async () => {
  applyTestEnv();
  resetS3Mock();
  const fetchMock = installFetchMock();

  const payload: Array<{ id: string; imageUri: string }> = [];
  const cachedIds = new Set<string>();
  const downloadIds: string[] = [];

  for (let index = 0; index < 70; index += 1) {
    const id = randomUUID();
    const imageUri = `https://cdn.example.com/cards/${index}.png`;
    payload.push({ id, imageUri });

    if (index % 2 === 0) {
      const buffer = await createTestImage(index);
      mockCachedImage(`cache/${id}`, buffer, "image/png", {
        bucket: TEST_BUCKET,
      });
      cachedIds.add(id);
    } else {
      const buffer = await createTestImage(index);
      fetchMock.enqueueBuffer(buffer, {
        headers: {
          "content-type": "image/png",
          "content-length": String(buffer.byteLength),
        },
      });
      mockCachedImageMissing(`cache/${id}`, { bucket: TEST_BUCKET });
      downloadIds.push(id);
    }
  }

  const { getApp } = await import("../../server");
  const app = getApp(config);

  try {
    const response = await app.request("/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    assert.equal(response.status, 200);
    const metadataHeader = response.headers.get("X-Merge-Metadata");
    assert.ok(metadataHeader);
    const metadata = JSON.parse(
      Buffer.from(metadataHeader, "base64url").toString("utf8")
    ) as Record<string, unknown>;

    assert.equal(metadata.totalRequested, 70);
    assert.deepEqual(metadata.failures, []);
    assert.equal(typeof metadata.durationMs, "number");
    assert.ok((metadata.durationMs as number) > 0);

    const cached = new Set(metadata.cached as string[]);
    assert.equal(cached.size, cachedIds.size);
    cachedIds.forEach((id) => assert.ok(cached.has(id)));

    const downloaded = new Set(metadata.downloaded as string[]);
    assert.equal(downloaded.size, downloadIds.length);
    downloadIds.forEach((id) => assert.ok(downloaded.has(id)));

    assert.equal(fetchMock.calls.length, downloadIds.length);

    const putCommands = getPutCommands();
    assert.equal(putCommands.length, downloadIds.length);
  } finally {
    fetchMock.restore();
  }
});
