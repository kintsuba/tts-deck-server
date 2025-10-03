import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, resetConfigCache } from "../../config";

const CANONICAL_KEYS = [
  "AWS_ENDPOINT_URL",
  "AWS_DEFAULT_REGION",
  "AWS_S3_BUCKET_NAME",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
];

test("loadConfig reads canonical AWS environment variables", () => {
  const originalEnv = { ...process.env };

  try {
    for (const key of CANONICAL_KEYS) {
      delete process.env[key];
    }

    process.env.AWS_ENDPOINT_URL = "https://example-endpoint";
    process.env.AWS_DEFAULT_REGION = "us-west-2";
    process.env.AWS_S3_BUCKET_NAME = "example-bucket";
    process.env.AWS_ACCESS_KEY_ID = "example-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "example-secret";

    resetConfigCache();
    const config = loadConfig();

    assert.equal(config.AWS_ENDPOINT_URL, "https://example-endpoint");
    assert.equal(config.AWS_DEFAULT_REGION, "us-west-2");
    assert.equal(config.AWS_S3_BUCKET_NAME, "example-bucket");
    assert.equal(config.AWS_ACCESS_KEY_ID, "example-access-key");
    assert.equal(config.AWS_SECRET_ACCESS_KEY, "example-secret");
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!Object.prototype.hasOwnProperty.call(originalEnv, key)) {
        delete process.env[key];
      }
    }

    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    resetConfigCache();
  }
});
