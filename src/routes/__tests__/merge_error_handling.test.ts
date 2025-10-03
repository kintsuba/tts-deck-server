import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { installFetchMock, applyTestEnv } from '../../test/setup';
import { mockCachedImageMissing, resetS3Mock } from '../../test/utils/s3Mock';

const TEST_BUCKET = 'tts-deck-cache-test';

test('POST /merge surfaces image fetch errors with actionable payload', async () => {
  applyTestEnv();
  resetS3Mock();
  const fetchMock = installFetchMock();

  const id = randomUUID();
  const payload = [
    {
      id,
      imageUri: 'https://cdn.example.com/cards/failure.png',
    },
  ];

  fetchMock.enqueueError(() => new Error('Network timeout'));
  mockCachedImageMissing(`cache/${id}`, { bucket: TEST_BUCKET });

  const { getApp } = await import('../../server');
  const app = getApp();

  try {
    const response = await app.request('/merge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(response.status, 502);
    assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('X-Merge-Metadata'), null);

    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.source, 'image_fetch');
    assert.equal(body.code, 'merge.image_fetch_failed');
    assert.match(String(body.message), /Network timeout/);
  } finally {
    fetchMock.restore();
  }
});
