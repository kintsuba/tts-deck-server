import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CACHE_PREFIX,
  DEFAULT_FETCH_CONCURRENCY,
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_MERGE_OUTPUT_FORMAT,
  DEFAULT_PORT,
  getCachePrefix,
  getFetchConcurrency,
  getFetchTimeoutMs,
  getMaxImageBytes,
  getMergeOutputFormat,
  getPort,
  getRequiredConfigValue,
  resetConfigCache,
} from "../../config";

type AsyncOrSync<T> = T | Promise<T>;

const withEnv = async <T>(
  values: Record<string, string | undefined>,
  fn: () => AsyncOrSync<T>,
): Promise<T> => {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  resetConfigCache();

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    resetConfigCache();
  }
};

test("getPort falls back to default", async () => {
  await withEnv({ PORT: undefined }, () => {
    assert.equal(getPort(), DEFAULT_PORT);
  });
});

test("getPort parses explicit value", async () => {
  await withEnv({ PORT: "8080" }, () => {
    assert.equal(getPort(), 8080);
  });
});

test("getFetchConcurrency enforces positive integers", async () => {
  await withEnv({ FETCH_CONCURRENCY: "0" }, () => {
    assert.throws(() => getFetchConcurrency(), /FETCH_CONCURRENCY/);
  });

  await withEnv({ FETCH_CONCURRENCY: "3" }, () => {
    assert.equal(getFetchConcurrency(), 3);
  });

  await withEnv({ FETCH_CONCURRENCY: undefined }, () => {
    assert.equal(getFetchConcurrency(), DEFAULT_FETCH_CONCURRENCY);
  });
});

test("getFetchTimeoutMs enforces numeric input", async () => {
  await withEnv({ FETCH_TIMEOUT_MS: undefined }, () => {
    assert.equal(getFetchTimeoutMs(), DEFAULT_FETCH_TIMEOUT_MS);
  });

  await withEnv({ FETCH_TIMEOUT_MS: "2500" }, () => {
    assert.equal(getFetchTimeoutMs(), 2500);
  });

  await withEnv({ FETCH_TIMEOUT_MS: "not-a-number" }, () => {
    assert.throws(() => getFetchTimeoutMs());
  });
});

test("getMaxImageBytes validates size", async () => {
  await withEnv({ MAX_IMAGE_BYTES: undefined }, () => {
    assert.equal(getMaxImageBytes(), DEFAULT_MAX_IMAGE_BYTES);
  });

  await withEnv({ MAX_IMAGE_BYTES: "5242880" }, () => {
    assert.equal(getMaxImageBytes(), 5 * 1024 * 1024);
  });

  await withEnv({ MAX_IMAGE_BYTES: "-1" }, () => {
    assert.throws(() => getMaxImageBytes());
  });
});

test("getCachePrefix trims values", async () => {
  await withEnv({ CACHE_PREFIX: undefined }, () => {
    assert.equal(getCachePrefix(), DEFAULT_CACHE_PREFIX);
  });

  await withEnv({ CACHE_PREFIX: "  custom/cache" }, () => {
    assert.equal(getCachePrefix(), "custom/cache");
  });
});

test("getMergeOutputFormat normalizes common inputs", async () => {
  await withEnv({ MERGE_OUTPUT_FORMAT: undefined }, () => {
    assert.equal(getMergeOutputFormat(), DEFAULT_MERGE_OUTPUT_FORMAT);
  });

  await withEnv({ MERGE_OUTPUT_FORMAT: "jpeg" }, () => {
    assert.equal(getMergeOutputFormat(), "jpeg");
  });

  await withEnv({ MERGE_OUTPUT_FORMAT: "JPG" }, () => {
    assert.equal(getMergeOutputFormat(), "jpeg");
  });
});

test("getRequiredConfigValue rejects empty values", async () => {
  await withEnv({ AWS_S3_BUCKET_NAME: "   " }, () => {
    assert.throws(() => getRequiredConfigValue("AWS_S3_BUCKET_NAME"));
  });

  await withEnv({ AWS_S3_BUCKET_NAME: "deck-cache" }, () => {
    assert.equal(getRequiredConfigValue("AWS_S3_BUCKET_NAME"), "deck-cache");
  });
});
