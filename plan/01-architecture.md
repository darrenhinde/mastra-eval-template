### Mastra RAG Architecture (LanceDB, JS)

This document defines the high-level system architecture for a modular Retrieval-Augmented Generation (RAG) template using Mastra and LanceDB (JS). It aligns with the provided Mastra template structure requirements (see “Mastra template structure” documentation provided in this workspace).

- **Primary goal**: Ingest documents, create embeddings, store vectors + metadata in LanceDB, retrieve relevant chunks, and generate grounded answers using a Mastra Agent.
- **Key lanes**: Ingestion → Embedding & Storage → Query Processing → Generation → Evaluation & Feedback.
- **Storage**: `@lancedb/vectordb` for vectors + rich metadata. Cosine similarity by default.
- **LLM/Embeddings**: OpenAI models by default (configurable per environment variables).

#### Components
- **Mastra Agents** (`src/mastra/agents/`)
  - `rag-agent`: orchestrates retrieval → prompt → generation.
- **Mastra Tools** (`src/mastra/tools/`)
  - Ingestion tools: parsers, chunkers, metadata extractors
  - Vector store tools: LanceDB client setup, insert, search utilities
  - Evaluation tools: offline metrics, guardrails checks
- **Mastra Workflows** (`src/mastra/workflows/`)
  - `ingest-workflow`: one-shot ETL for sources
  - `retrieve-workflow`: query → vectorize → search → rerank → assemble context
  - `evaluate-workflow`: batch evaluation (recall, faithfulness, etc.)
- **Main config** (`src/mastra/index.ts`)
  - Exposes agent(s), tools, and workflow registrations

#### Data Contracts

Types are planning references to enforce consistency across lanes (implementation later):

```ts
// Chunk created during ingestion and used throughout the pipeline
export type Chunk = {
  id: string;           // stable unique id per chunk
  docId: string;        // parent document id
  text: string;         // chunk content
  metadata: {
    source: string;     // file path/url/db id
    author?: string;
    date?: string;      // ISO date
    section?: string;   // heading/section label
    keywords?: string[];
    tokens: number;     // token estimate used for budgeting
    seq: number;        // order within doc
  };
};

// Embedding record written to LanceDB
export type EmbeddingRecord = {
  id: string;             // = chunk.id
  docId: string;
  vector: number[];       // embedding vector
  text: string;           // original chunk text (for fallback/inspection)
  section?: string;
  date?: string;
  source: string;
  keywords?: string[];
  tokens: number;
  seq: number;
  score?: number;         // search-time annotation
};
```

#### Lane Responsibilities
- **Ingestion**: detect MIME; parse; clean; normalize; chunk (paragraph/sentence/section/token fallback); extract metadata; produce `Chunk[]`.
- **Embedding & Storage**: batch-embed chunks (OpenAI text-embedding-3-small by default); insert into LanceDB with scalar indexes for `docId`, `date`, `section`.
- **Query Processing**: query analysis; optional metadata pre-filter; ANN search (cosine, k=20); optional cross-encoder rerank; context assembly ≤ token budget.
- **Generation**: Mastra Agent composes system + context + user prompts; produces answer with citations by `chunk_id`.
- **Evaluation & Feedback**: offline RAG metrics (recall@k, faithfulness); store eval runs; guardrails; telemetry.

#### Technology Notes
- **Mastra template structure**: All Mastra code under `src/mastra/` with agents, tools, workflows, main config. TypeScript strict mode, ESM, Node 18+ (source: “Mastra template structure” provided).
- **LanceDB JS**: Use `@lancedb/vectordb` for columnar storage, ANN (HNSW), and SQL-like filters (per instruction to use @LanceDB JS).
- **LLM Provider**: OpenAI/Anthropic/Google supported via Mastra agent configuration; default to OpenAI. API keys from `.env` (source: “Mastra template structure” provided).

#### Milestone (Architecture)
- Documented lanes, data contracts, Mastra component mapping, and LanceDB usage model.

---

### Template Guidelines Compliance

- Installation: `npx create-mastra@latest --template template-name` (per guidelines)
- Setup Steps: `cd`, `cp .env.example .env`, set API keys, `npm install`, `npm run dev`
- Structure: all Mastra code under `src/mastra/` with `agents/`, `tools/`, `workflows/`, and `index.ts`
- TypeScript: strict TS config exactly as specified in guidelines
- Compatibility: single project, framework-free, ESM, Node 18+
- README: include overview/setup/env vars/usage/customization

### Responsibilities Map (High Level)

- `src/mastra/agents/rag-agent.ts`
  - Input: `{userQuery: string, filters?: RetrievalFilters}`
  - Uses: retrieval tool → context assembly → LLM prompt
  - Output: `{answer: string, citations: string[]}`

- `src/mastra/workflows/ingest-workflow.ts`
  - Input: `{pathsOrUrls: string[], chunking: ChunkingOptions}`
  - Uses: detectMime → parse → clean → chunk → extractMetadata → embed → upsert
  - Output: `{countInserted: number}`

- `src/mastra/workflows/retrieve-workflow.ts`
  - Input: `{query: string, filters?: RetrievalFilters, k?: number}`
  - Uses: embed query → LanceDB search → optional rerank → assemble context
  - Output: `{results: RetrievedChunk[], context: string}`

- `src/mastra/workflows/evaluate-workflow.ts`
  - Input: dataset path or inline dataset
  - Uses: retrieval/generation eval → store run in LanceDB
  - Output: metrics summary and run id

### Architecture Tests (Examples)

- Good: Ingest 5 markdowns → LanceDB shows ~50–150 chunks with correct `docId` and sequential `seq`; `/ask` answers cite valid chunk ids like (§chunk-0023)
- Bad: Ingest produces large, monolithic chunks (>4k tokens) leading to truncation; `/ask` answers without any citations or with missing chunk ids

### Non-goals / Anti-patterns

- Do not couple a web framework into the template; keep it framework-free
- Do not store embeddings without associated metadata needed for filtering/citations
- Do not leak chain-of-thought in final answers

---

### Dependencies and Integrations (Mastra + LanceDB)

- Mastra core (agents, tools, workflows) per provided template guidance
- LLM provider via `@ai-sdk/openai` (or Anthropic/Google), configured in agent
- LanceDB JS: `@lancedb/vectordb` for vector + metadata storage
- Parsers (planned): `pdf-parse` or `pdf-extract-ts`, `remark` (Markdown), `cheerio` (HTML)

### Error Model and Retry Policy

- Ingestion
  - ParserError (malformed PDF/HTML) → skip file, log with `docId`, continue batch
  - ChunkingError (empty text) → drop doc with reason; ensure metrics
  - MetadataError (regex/LLM failures) → proceed with partial metadata; do not block
- Embeddings
  - EmbeddingProviderError (429/5xx): exponential backoff with jitter; max 5 attempts; circuit break for sustained failures
  - InvalidEmbedding (NaN/zero vector): drop record; log anomaly counter
- Vector Store (LanceDB)
  - ConnectionError/PathInvalid → fail fast; require valid `LANCEDB_PATH`
  - UpsertConflict → ensure deterministic `id` and use upsert semantics
  - MissingIndex → create ANN/scalar indexes before first query
- Retrieval
  - EmptyResults → respond with safe fallback and optional clarification prompt
  - FilterMismatch (user filters yield zero rows) → relax filters progressively (recency last)
- Generation
  - SafetyViolation (toxicity/PII/prompt injection) → refuse or sanitize with rationale
  - ContextOverflow → trim to token budget with highest scores only

Retry policy: exponential backoff base 500ms, factor 2, jitter 0–250ms, max 5 attempts. Timeouts: provider calls 30s, LanceDB ops 15s.

### Observability and Operations

- Structured logging: ingestion counts, failures by cause, embedding latency, search hit-rate, answer length, token usage
- Metrics: p50/p95 latency for retrieve and generate, cost per query, rerank toggle impact
- Tracing (optional): correlation id per request and `docId`

### Security & Compliance

- Secrets from `.env` only; never hard-code keys
- PII regex checks; do not store user queries that include sensitive data beyond transient logs (configurable retention)
- Content moderation toggle before generation output

### Business Logic Rules

- Always include citations (§chunk_id) in answers
- If top-3 average score < 0.2 → return fallback: "No sufficiently grounded information found"
- Prefer recent `date` when scores tie within 0.02
- Respect filters; if none found, explain filter impact and suggest adjustments
- Do not reveal chain-of-thought; keep answers ≤ 300 tokens

### Capacity & Performance

- Batch embedding up to 256 chunks; adapt for rate-limit errors
- Target retrieval latency ≤ 300ms for k=20 on local LanceDB; end-to-end ≤ 2s excluding cold start

### Assumptions

- Documents are static within a run; re-ingestion uses idempotent upsert by `id`
- Embedding dimension matches provider (e.g., OpenAI text-embedding-3-small: 1536)

### Example Flow with Failure Injection

1) Ingest 20 docs; 2 malformed PDFs fail ParserError → logged and skipped
2) Embedding rate-limited (429) → backoff and resume; total attempts < 5
3) Retrieval with `section='faq'` returns 0 rows → relax section filter → results found
4) Generation detects PII in context → redacts and answers safely with citations

---

### Multi-tenancy and Data Organization (RAG Insight Applied)

Two principal organization strategies:

- Big Pile (single table/index): simplest; acceptable for single homogeneous corpus with no ACL. Cons: filtering reduces recall; ACL relies on app-side filters and is riskier.
- Denormalized (recommended for multi-tenant/multi-source): separate indices/tables by tenant, source, or domain key (e.g., `region`, `docType`). Pros: isolation, better recall (less filtering), independent updates; requires routing.

Recommended baseline for future phases:

- Use LanceDB tables per tenant-source: `chunks__tenant_{tenantId}__src_{sourceId}`
- For domain segmentation within a source (e.g., legal "court_decisions" vs "briefs"), either use separate tables or maintain a `domainKey` column and promote later to a separate table if needed
- Keep ACL in application layer (Mastra tools/workflows), never in LanceDB auth

Query routing strategies:

- Multiplex (Phase 3a): send query to all applicable tables; merge top-k; optional rerank downstream
- LLM routing (Phase 4): classify relevant sources/domains from a catalog and route only to those tables; can also emit structured filters

Business rules and safeguards:

- Avoid post-filtering on a large, mixed table; prefer pre-routed search to dedicated tables
- If multiplex results disagree or are low-confidence, prefer recent or tenant-owned sources
- Do not surface results from a table the user is not authorized to access; ACL check before search

Tests:

- Good: Tenant A query never returns Tenant B chunks; routing to 2 tables yields higher recall vs single pile with heavy filters
- Bad: Post-filtering removes all top results leading to empty context despite relevant data in a denormalized table


