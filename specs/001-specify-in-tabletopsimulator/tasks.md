# Tasks: TTS Bulk Card Image Merge API

**Input**: Design documents from `/specs/001-specify-in-tabletopsimulator/`
**Prerequisites**: plan.md (required); research.md, data-model.md, contracts/ (not yet provided)

## Phase 3.1: Setup

- [x] T001 Create `.env.example` at repository root listing `PORT`, `AWS_DEFAULT_REGION`, `AWS_S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL`, `MERGE_OUTPUT_FORMAT`, `CACHE_PREFIX`, `MAX_IMAGE_BYTES`, `FETCH_TIMEOUT_MS`, and `FETCH_CONCURRENCY` with safe local defaults plus inline comments describing expected values.
- [x] T002 Update `package.json`/`package-lock.json` to add the dev dependency `aws-sdk-client-mock` (latest 3.x) and a `lint` script that runs `tsc --noEmit`; run `npm install` so the lockfile reflects the new dependency.
- [x] T003 Scaffold integration-test utilities by creating `src/test/setup.ts` (reset `loadConfig` cache, seed default env vars, and export helpers for mocking fetch responses) and `src/test/utils/s3Mock.ts` (wrap `aws-sdk-client-mock` for S3 get/put expectations) so downstream tests can bootstrap deterministic environments.

## Phase 3.2: Tests First (TDD)

- [x] T004 [P] Add `src/routes/__tests__/merge_full_deck.test.ts` using `node:test` that exercises `POST /merge` with 70 synthetic card descriptors, stubs fetch to return distinct image buffers, asserts a 200 response, verifies `X-Merge-Metadata` decodes to `totalRequested: 70`, `cached: []`, and `downloaded` containing all IDs, and checks the mock S3 client recorded a put per UUID.
- [x] T005 [P] Add `src/routes/__tests__/merge_cache_hits.test.ts` covering the cached-path scenario: pre-seed S3 mock responses so half the UUIDs hit the cache, assert the handler returns 200, metadata `cached` lists the reused IDs, `downloaded` omits them, and fetch was not invoked for cached entries.
- [x] T006 [P] Add `src/routes/__tests__/merge_error_handling.test.ts` validating error propagation when a remote image fails (e.g., fetch rejects); assert the route responds with JSON `{ source: "image_fetch", message: ... }`, uses an HTTP 502-compatible status, and does not emit a merged payload.

- [x] T007 [P] Implement `src/models/mergeRequest.ts` defining the `MergeCardDescriptor`/`MergeRequest` types, a Zod schema enforcing 1-70 entries with UUID validation, and a `parseMergeRequest(payload)` helper that normalizes descriptors and exposes target grid dimensions (7×10) for downstream services.
- [x] T008 [P] Implement `src/models/cachedAsset.ts` capturing cache metadata (`id`, `contentType`, `bytes`, `checksum`, `cachedAt`, `sourceUrl`) and provide constructors to translate S3 `GetObjectCommand`/fetch results into the shared domain shape.
- [x] T009 [P] Implement `src/models/mergeResult.ts` that models the merge output (`buffer`, `contentType`, `grid`, `tile`, `cached`, `downloaded`, `durationMs`, `failures`) and includes helpers to encode/decode the metadata header expected by clients.
- [x] T010 Refactor `src/services/imageProvider.ts` to consume the new models: return enriched `ProvidedImage` objects with cache hit/miss flags, capture content length validation against `MAX_IMAGE_BYTES`, and throw `ImageProvisionError` with actionable messages and status codes.
- [x] T011 Create `src/services/mergeService.ts` orchestrating the merge flow (parse request, fetch images with configured concurrency, call imageComposer, assemble `MergeResult`, and surface failure metadata); ensure it records processing duration and preserves submission order.
- [x] T012 Enhance `src/services/imageComposer.ts` to accept explicit grid dimensions, pad partial decks with transparent tiles, and surface tile dimensions/format required by `MergeResult`.

## Phase 3.4: Integration

- [x] T013 Update `src/routes/merge.ts` to delegate to `parseMergeRequest` and `mergeService`, respond with the binary buffer plus `X-Merge-Metadata`/`X-Merge-Metadata-Encoding` headers, and convert thrown domain errors into JSON responses that satisfy FR-004 and FR-007.
- [x] T014 Introduce structured logging via `src/utils/logger.ts` and register request-scoped middleware in `src/server.ts` that annotates logs with a request ID, payload size, cache hit counts, and total duration.
- [x] T015 Add a lightweight metrics emitter in `src/utils/metrics.ts` and instrument `mergeService` to emit counters (cache hits/misses, download failures) and timers (fetch latency, composition latency) for observability.
- [x] T016 Strengthen `/healthz` in `src/server.ts` to perform a lightweight S3 check (HEAD or GetObject on a sentinel key) and Sharp self-test, returning HTTP 503 with diagnostic JSON when dependencies are unavailable.

## Phase 3.5: Polish

- [x] T017 [P] Create `src/services/imageComposer.test.ts` with unit tests covering tile dimension calculation, padding behaviour for <70 cards, and output format differences (PNG vs JPEG).
- [x] T018 [P] Add `scripts/benchmarks/merge-benchmark.ts` generating synthetic images via Sharp to measure end-to-end merge latency/throughput; register an npm script `benchmark:merge` and document CLI usage inline.
- [x] T019 [P] Expand `README.md` with `/merge` request/response examples, metadata header format, cache semantics, error handling guidance, `.env.example` reference, and notes on the new lint/benchmark scripts.

## Dependencies

- T002 requires T001 so the example env vars are authoritative before documenting tooling.
- T003 depends on T002 to access `aws-sdk-client-mock`.
- T004–T006 depend on T003 and must fail before T007+ implementations begin.
- T010 depends on T007 and T008; T011 depends on T007–T010; T012 depends on T007 and T009.
- T013 depends on T010–T012; T014 depends on T013; T015 depends on T011; T016 depends on T014 and mocked S3 helpers from T003.
- T017 depends on T012; T018 depends on T013 (route ready) and Sharp enhancements; T019 depends on all prior tasks to document accurate behaviour.

## Parallel Execution Example

```
# After T003, drive the TDD cycle for the three integration specs in parallel:
npx specify run --task T004
npx specify run --task T005
npx specify run --task T006

# Once tests are red, build the independent model layers together:
npx specify run --task T007
npx specify run --task T008
npx specify run --task T009

# Polish tasks can run together at the end:
npx specify run --task T017
npx specify run --task T018
npx specify run --task T019
```
