import test from "node:test";
import assert from "node:assert/strict";
import { parseMergeRequest } from "../mergeRequest";

const CARD_ID = "f711ca08-6025-41ac-bf64-d8d6172bab6d";

const createPayload = (hiddenImage: string) => ({
  cards: [
    {
      id: CARD_ID,
      imageUri: "https://example.com/card.png",
    },
  ],
  hiddenImage,
});

test("parseMergeRequest accepts hiddenImage with whitespace in base64 payload", () => {
  const source = Buffer.from("hidden-image-data");
  const base64 = source.toString("base64");
  const base64WithWhitespace = `${base64.slice(0, 8)}\n${base64.slice(8)}`;

  const payload = createPayload(
    `data:image/png;base64,${base64WithWhitespace}`,
  );
  const result = parseMergeRequest(payload);

  assert.ok(result.hiddenImage, "hiddenImage should be parsed");
  assert.equal(result.hiddenImage?.contentType, "image/png");
  assert.deepEqual(result.hiddenImage?.data, source);
});

test("parseMergeRequest accepts hiddenImage with base64url characters and jpg mime", () => {
  const source = Buffer.from("another-hidden-image");
  const base64 = source.toString("base64");
  const base64Url = base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  const payload = createPayload(`data:image/jpg;base64,${base64Url}`);
  const result = parseMergeRequest(payload);

  assert.ok(result.hiddenImage, "hiddenImage should be parsed");
  assert.equal(result.hiddenImage?.contentType, "image/jpeg");
  assert.deepEqual(result.hiddenImage?.data, source);
});
