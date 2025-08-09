### Task 03 — Embeddings and LanceDB Storage

Objective
- Generate embeddings for `Chunk[]` and upsert into a LanceDB table `chunks` using @LanceDB JS, per @plan/06-lancedb-schema.md. Support modular providers: Ollama `nomic-embed-text` (default) and OpenAI `text-embedding-3-small`.

References
- @plan/06-lancedb-schema.md (schema, indexes, operations)
- @plan/05-functions-and-interfaces.md (embedChunks, upsertEmbeddings)
- @plan/02-mvp.md (MVP scope: single table)
- @plan/01-architecture.md (MVP ASCII map)
- @Mastra AI (tools organization)

Deliverables
- `src/mastra/tools/vectorstore/`:
  - `embed.ts` (`embedChunks` using OpenAI text-embedding-3-small)
  - `lancedb.ts` (`getLanceDb`, `getOrCreateTable`)
  - `upsert.ts` (`upsertEmbeddings` with ANN index ensure)
- Update `ingest-workflow.ts` to call embed + upsert pipeline
 - `src/mastra/tools/embeddings/`: `adapter.ts`, `ollama.ts`, `openai.ts`; env-driven selection

Checklist
1. Batch embedding (size ~256) with exponential backoff on 429/5xx or Ollama unavailable
2. Connect/create LanceDB at `LANCEDB_PATH`
3. Ensure ANN index (HNSW) on `vector` and scalar indexes on `docId`, `date`, `section`; store `provider`, `model`, `embeddingDim`
4. Upsert by `id` to avoid duplicates
5. Validate `EmbeddingRecord` with Zod
6. Validate vector dimension equals `EMBEDDING_DIM`; if not set, detect on first embed and persist in config

Expected Errors & Handling
- RateLimited/ProviderError: retry with backoff (max 5 attempts), log failures
- Ollama not running: retry then fail with actionable message including `OLLAMA_BASE_URL`
- Dimension mismatch: abort and instruct re-indexing or set correct `EMBEDDING_DIM`
- ConnectionError/MissingIndex: fail fast with actionable error; document fix steps

Good Test (Must Pass)
- With `EMBEDDING_PROVIDER=ollama` (nomic-embed-text): vectors are 768-dim; LanceDB rows include provider/model/embeddingDim
- Switch to `EMBEDDING_PROVIDER=openai`: new table used or re-embedding performed for 1536-dim; both pass validation
 - Query a known chunk vector; nearest neighbors include itself with score ~1.0 and semantically similar chunks

Bad Test (Must Fail Gracefully)
- Simulate 429 spikes: embedding retries succeed; if exceeding attempts, pipeline reports partial success and stops
- Start with 768-dim table then change to 1536-dim without reindex: job halts with clear dimension mismatch message


