### Embedding Providers (Modular): Ollama nomic-embed-text and OpenAI

Goal
- Make embeddings provider-agnostic with a clean adapter. Default to local Ollama `nomic-embed-text`; support OpenAI `text-embedding-3-small` as an alternative.

References
- @Mastra AI (Tools organization; provider config via env)
- @LanceDB JS (vector storage; index per dimension)
- @plan/06-lancedb-schema.md (schema, provenance fields)
- @plan/05-functions-and-interfaces.md (embedding contracts)

Provider Facts
- Ollama `nomic-embed-text` (v1.5): returns 768-dimension vectors by default via Ollama embeddings API. Context ~2k. Local-only generation; requires Ollama 0.1.26+ and `ollama pull nomic-embed-text`.
- OpenAI `text-embedding-3-small`: returns 1536-dimension vectors. Hosted inference.
- Important: Store and enforce one consistent dimension per LanceDB table. Changing models/dimensions requires a new table or re-embedding + reindex.

Env Configuration
- `EMBEDDING_PROVIDER`: `ollama` | `openai`
- `EMBEDDING_MODEL`: `nomic-embed-text` | `text-embedding-3-small` (or other)
- `EMBEDDING_DIM`: expected vector length (e.g., `768` for `nomic-embed-text`, `1536` for OpenAI small). Used for validation; if omitted, auto-detect on first call and persist in config.
- `OLLAMA_BASE_URL`: default `http://localhost:11434` (for local embeddings)

Interface (Design)
```ts
export type EmbeddingAdapter = {
  name: string;                                 // provider identifier
  model: string;                                // model identifier
  expectedDim?: number;                         // optional static dimension
  embedBatch(texts: string[]): Promise<number[][]>; // returns array of vectors
};

export async function getEmbeddingAdapterFromEnv(): Promise<EmbeddingAdapter>;
```

Behavior
- Adapter returns vectors and we validate their length. If any vector dimension mismatches `EMBEDDING_DIM` (when set), abort with a configuration error.
- First successful embed can set `embeddingDim` in runtime config when not provided.
- Persist `provider`, `model`, and `embeddingDim` in LanceDB rows for provenance.

LanceDB Schema Additions
- Add columns: `provider` (string), `model` (string), `embeddingDim` (int) in `chunks` table (see @plan/06-lancedb-schema.md). Update indexes unaffected.

Error Handling
- Provider Unavailable (Ollama not running / OpenAI auth failure): retry with backoff (5 attempts), then fail with actionable message.
- Invalid Dimension: if runtime dimension != expected → stop and instruct to set correct `EMBEDDING_DIM` or re-index.
- Rate Limits (OpenAI): exponential backoff with jitter.

Good Tests
- With `EMBEDDING_PROVIDER=ollama` and `EMBEDDING_MODEL=nomic-embed-text`, embedding length is 768 and records include `{ provider:'ollama', model:'nomic-embed-text', embeddingDim:768 }`.
- Switching to OpenAI updates config and creates/uses a separate table expecting 1536-dim vectors.

Bad Tests
- Start with 768-dim table, switch to 1536-dim without reindex → ingestion stops with clear "dimension mismatch" error.
- Ollama not running → embedding step retries then fails with "Ollama unavailable at OLLAMA_BASE_URL".

Operational Notes
- Prefer local `nomic-embed-text` for privacy/cost; OpenAI as fallback or alternative.
- If considering Matryoshka-style dimensionality reductions, only adopt if the runtime API supports it; otherwise assume fixed 768 (Ollama) / fixed 1536 (OpenAI small).


