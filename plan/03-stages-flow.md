### End-to-End Stages Flow

Five tightly coupled lanes with milestones. This flow is the canonical reference for behavior.

#### 1) Data Ingestion
- Detect MIME → route parser (PDF/DOCX/MD/HTML)
- Clean: strip boilerplate; normalize Unicode; preserve tables where possible
- Chunking strategies: paragraph → sentence → section → token-size fallback; 10% overlap baseline
- Metadata extraction: regex (dates, emails) + LLM extractor for title/summary/entities (later phase)
- Output: `Chunk[]`

Milestone: All sources produce `Chunk` objects with populated `metadata`.

#### 2) Embedding & Storage
- Batch embeddings (size ~256) with retry/backoff
- Persist vectors + metadata in LanceDB (@lancedb/vectordb)
- Create scalar indexes for `docId`, `date`, `section`; ANN index (HNSW) for `vector`

Milestone: LanceDB table `chunks` with indexed columns: `vector`, `section`, `date`, `docId`.

#### 3) Query Processing
- Query analysis: intent/entities (optional; spaCy-js or equivalent)
- Pre-filter: SQL-like `.where()` using metadata (recency, section)
- Vector search: cosine, top k=20
- Optional rerank: cross-encoder (later phase)
- Context assembly: aggregate until ≤ token budget (~4k tokens baseline)

Milestone: `retrieve(query, filters): Chunk[]` returns ordered context with scores.

#### 4) Generation (Mastra Agent)
- Prompt skeleton (system/context/user)
- Generate concise answer ≤ 300 tokens; attach markdown citations (§{chunk_id})

Milestone: `/ask` returns grounded answer with citations.

#### 5) Evaluation & Feedback
- Offline benchmarks: Recall@K, MRR, Faithfulness, Answer Relevancy
- Online telemetry: latency, hit-rate, cost, fallback percentage
- Guardrails: toxicity, PII, prompt injection

Milestone: CI `npm run eval` blocks on thresholds (e.g., Recall@5 ≥ 0.8, Faithfulness ≥ 0.9).

References: Mastra template structure (provided), LanceDB JS (per instruction).

---

### Function Hooks Per Stage

- Ingestion: `detectMime` → `parseDocument` → `cleanText` → `splitIntoChunks` → `extractMetadataHybrid`
- Embedding & Storage: `embedChunks` → `getOrCreateTable` → `upsertEmbeddings`
- Query: `retrieve(query, filters)` → `assembleContext(results, budget)` → optional `rerank`
- Generation: `generateAnswer(userQuery, context)`
- Evaluation: `evaluateRetrieval`, `evaluateGeneration`, `storeEvalRun`

### Stage Tests
- Good: Pre-filter by `section='FAQ'` narrows search set and improves scores; citations map to real chunk ids in LanceDB
- Bad: No `.where()` filter applied even when filters provided; retrieved chunks exceed token budget due to missing assembly budgeting

---

### Stage-Level Inputs/Outputs

- Ingestion
  - Input: paths/URLs
  - Output: `Chunk[]`
- Embedding & Storage
  - Input: `Chunk[]`
  - Output: `EmbeddingRecord[]` written to LanceDB
- Query
  - Input: user query string, filters
  - Output: `RetrievedChunk[]` + assembled context string
- Generation
  - Input: user query, context
  - Output: answer string + citations
- Evaluation
  - Input: dataset JSONL path
  - Output: metrics + stored run record

### Timeouts & Retries
- Provider calls: 30s timeout; max 5 retries with exponential backoff
- LanceDB operations: 15s timeout; retries on transient errors

### Edge Cases
- Very short queries (≤ 2 tokens): ask for clarification
- Queries with conflicting filters: explain and suggest relaxing one filter
- Documents with no detectable sections: default section to `body`

---

### Routing Stage (Pre-Retrieval, Later Phases)

- Inputs: `query`, `tenantId`, candidate `sources`, and `domain catalog`
- Outputs: selected tables to query, optional structured filters

Strategies:
- Simple multiplex: query all candidate tables; merge top-k by score
- LLM routing: classify relevant sources/domains and produce filters; then query only those tables

Selectivity Instrumentation:
- Track fraction of the corpus addressed by a filter; avoid heavy filtering on large tables
- Prefer routing to smaller, denormalized tables for higher recall


