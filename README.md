# TTS Deck Server

REST API that merges up to 70 Tabletop Simulator card images into a single deck sheet. The service caches card art in Railway Object Storage (S3-compatible) to avoid redundant downloads and returns the merged image ready for TTS import.

## Requirements

- Node.js 18+
- Access to a Railway project with Object Storage enabled (S3-compatible credentials)

## Environment Variables

Copy `.env.example` to `.env` and fill the following values (Railway automatically injects the corresponding `AWS_*` variables when Object Storage is enabled):

| Variable                | Description                                                        |
| ----------------------- | ------------------------------------------------------------------ |
| `PORT`                  | HTTP port (Railway injects `PORT`)                                 |
| `AWS_ENDPOINT_URL`      | Optional override for the S3-compatible endpoint (e.g. LocalStack) |
| `AWS_DEFAULT_REGION`    | AWS region for the bucket                                          |
| `AWS_S3_BUCKET_NAME`    | Bucket name                                                        |
| `AWS_ACCESS_KEY_ID`     | Access key for the bucket                                          |
| `AWS_SECRET_ACCESS_KEY` | Secret key paired with the access key                              |
| `MERGE_OUTPUT_FORMAT`   | `png` (default) or `jpeg`                                          |
| `CACHE_PREFIX`          | Key prefix inside the bucket (default `cache/`)                    |
| `MAX_IMAGE_BYTES`       | Max size allowed per source image (bytes)                          |
| `FETCH_TIMEOUT_MS`      | Timeout per image download (milliseconds)                          |
| `FETCH_CONCURRENCY`     | Number of concurrent image downloads/cache lookups                 |

## Running Locally

```bash
pnpm install
pnpm dev
```

POST JSON payloads to `http://localhost:3000/merge` in the following format:

```json
[
  { "id": "<uuid>", "imageUri": "https://example.com/card-1.png" },
  { "id": "<uuid>", "imageUri": "https://example.com/card-2.png" }
]
```

Responses stream the merged image. Metadata about cache hits/misses and image dimensions is embedded in the `X-Merge-Metadata` header (base64url-encoded JSON).

Health checks are available at `GET /healthz`.

## Response Metadata

The `X-Merge-Metadata` header encodes JSON describing each merge operation:

```json
{
  "totalRequested": 70,
  "cached": ["..."],
  "downloaded": ["..."],
  "grid": { "rows": 7, "columns": 10 },
  "tile": { "width": 512, "height": 512 },
  "output": {
    "width": 5120,
    "height": 3584,
    "format": "png",
    "contentType": "image/png"
  },
  "durationMs": 124.9,
  "failures": []
}
```

`durationMs` reflects the server-side merge duration (exclusive of network transfer). `failures` lists any card IDs that could not be fetched or cached.

## Error Responses

When image retrieval fails the service returns structured JSON:

```json
{
  "message": "Failed to fetch image: https://cdn.example.com/card.png (Network timeout)",
  "source": "image_fetch",
  "code": "merge.image_fetch_failed"
}
```

- `source` indicates which subsystem failed (`image_fetch` or `image_cache`).
- `code` is machine-readable for alerting/telemetry.
- Validation errors return HTTP 422 with `code: "merge.request_invalid"` and flattened Zod issue details.

## Testing

```bash
pnpm test
```

## Building

```bash
pnpm run build
pnpm start   # serves the compiled dist/index.js
```

## Tooling & Benchmarks

- `pnpm run lint` — type-check the project with `tsc --noEmit`.
- `pnpm run benchmark:merge [iterations] [cardCount]` — run the synthetic merge benchmark (defaults: 3 iterations, 70 cards).

## Deploying to Railway

1. Enable Object Storage for the Railway project and note the generated credentials.
2. From the project directory run `railway up` (or deploy through the Railway dashboard).
3. Configure the service with the environment variables listed above (Railway will already inject `AWS_*`, `BUCKET_NAME`, and `PORT`).
4. Set the start command to `pnpm run build && pnpm start` so TypeScript compiles before booting the server.

The `/merge` endpoint will be exposed on the Railway-assigned domain once the deploy is complete.
