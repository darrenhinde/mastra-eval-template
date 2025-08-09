### MVP Scope and Acceptance Criteria

The first executable milestone focuses on ingesting a small set of PDFs/Markdown, embedding chunks, storing them in LanceDB, and providing a basic retrieval API. Generation is included with a minimal prompt. Evaluation is manual smoke-testing.

#### Scope (MVP)
- Sources: PDF and Markdown only
- Parsing: `pdf-parse` or `pdf-extract-ts` for PDF, `remark` for Markdown
- Chunking: paragraph splitter with small overlap; token fallback
- Embeddings: modular via adapter — default Ollama `nomic-embed-text` (768-dim) or OpenAI `text-embedding-3-small` (1536-dim); choose via env
- Storage: LanceDB table `chunks`
- Retrieval: vector search (cosine) k=20; simple context assembly
- Generation: single Mastra Agent with system + context + user prompt, answer ≤ 300 tokens with citations (chunk ids); model selected via `getModel()` (alias or explicit)

#### Acceptance Criteria
- `ingest-workflow` runs on a folder of documents and creates LanceDB records
- `retrieve(query, filters?)` returns ordered chunks with scores
- `/ask` (CLI or simple script) returns grounded answer with citations
- Docs: how to run, env vars, and sample

#### Template Compliance
- Commands: `npx create-mastra@latest --template template-name`, `cp .env.example .env`, `npm install`, `npm run dev`
- Structure: code under `src/mastra/` (agents/tools/workflows/index.ts)
- TS: strict config from guidelines; ESM; Node 18+

#### Functions Required (MVP)
- Ingestion: `detectMime`, `parseDocument`, `cleanText`, `splitIntoChunks`, `extractMetadataHybrid`
- Embedding/Storage: `embedChunks`, `getOrCreateTable`, `upsertEmbeddings`
- Retrieval/Answer: `retrieve`, `assembleContext`, `generateAnswer`

#### Example Happy Path (Good Test)
1) Place 5 PDFs + 5 MD in `./data`
2) Run ingest workflow → 120 chunks upserted
3) Call `/ask "What is the refund policy?"` → concise answer with citations (§chunk-0012, §chunk-0015)

#### Example Failure Path (Bad Test)
- Query: "Tell me anything about the universe" on a corpus about company policy
- Expectation: Answer acknowledges lack of relevant context and avoids hallucination; returns safe fallback and no fabricated citations

---

### User Stories
- As an operator, I can ingest a folder of PDFs/MD and see how many chunks were stored
- As a user, I can ask a question and receive a concise, grounded answer with citations
- As a maintainer, I can inspect LanceDB records for text/metadata correctness

### Definition of Ready
- `.env` configured with `LANCEDB_PATH` and either:
  - `EMBEDDING_PROVIDER=ollama` with `OLLAMA_BASE_URL` (and model pulled), or
  - `EMBEDDING_PROVIDER=openai` with `OPENAI_API_KEY`
- Optional LLM: `LLM_ALIAS_DEFAULT` or `LLM_DEFAULT_MODEL` for agent selection
- Sample documents placed under `./data`
- Scripts available: `ingest`, `ask`, `eval` (stubs acceptable for MVP)

### Error Matrix & Fallbacks (MVP)
- Missing env var → fail fast with actionable message listing required keys
- Parsing error → skip file and continue; summarize at end
- Empty results → return polite fallback and suggest filters/keywords
- Rate limit (429) → automatic retry with backoff; abort after max attempts

### Smoke Test Scripts (illustrative)

```sh
# Ingest sample corpus
npm run ingest -- --path ./data --strategy paragraph --overlap 0.1

# Ask a question
npm run ask -- --query "What is the refund policy?" --filter section=FAQ

# Inspect DB (manual)
# Open a small utility script or REPL to query LanceDB and verify rows
```

### Rollback & Cleanup
- To re-run clean: clear LanceDB path folder and re-ingest
- Use idempotent upsert by `id` to avoid duplicates when re-ingesting

### MVP KPIs (Sign-off)
- Ingestion success rate ≥ 95% for supported MIME types
- Top-20 Recall on a tiny handcrafted eval set ≥ 0.7
- Answer faithfulness (manual) ≥ 0.9; zero hallucinated citations in 10 questions

---

### MVP Constraints (Intentionally Simple)
- Single-tenant, single-source or homogeneous corpus
- No ACL; no LLM routing; no multiplex; one LanceDB table `chunks`
- Only paragraph chunking; no reranker; minimal filters

### Forward-Compatibility Hooks (without implementing yet)
- Config shape includes `tenantId` and `sourceId` for future
- Retrieval API accepts an optional `tenantId` and `sources` list (ignored in MVP)
- Table naming helper prepared for denormalized layout later

### MVP Negative Tests (to assert non-goals)
- Attempt to query as a different tenant id: system rejects because multi-tenancy not enabled in MVP
- Provide multiple sources: system warns and proceeds with default single table only

#### Manual Test Plan
- Seed 5–10 small documents
- Ask 10 queries; verify answers cite correct chunks
- Spot-check LanceDB rows: metadata correctness, vector present

#### Risks & Mitigations
- API rate limits → batch size & backoff
- Token overflows → conservative token budgeting in context assembly
- Parser failures → MIME routing + fallback to plain text


