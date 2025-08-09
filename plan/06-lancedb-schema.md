### LanceDB Schema and Operations (JS)

Planned design for the LanceDB interface using `@lancedb/vectordb`.

#### Table: `chunks`
- Primary key: `id` (chunk id)
- Vector column: `vector` (HNSW index)
- Scalar columns: `docId`, `section`, `date`, `source`, `keywords`, `tokens`, `seq`, `text`

Indexes:
- ANN index on `vector` (metric: cosine)
- Scalar indexes on `docId`, `date`, `section`

Record shape aligns with `EmbeddingRecord` in the plan.

#### Operations (pseudocode)

```ts
// connect/create
const db = await lancedb.connect(pathToDb);
const table = await db.createTable('chunks', schemaOrRecords, { mode: 'create_if_missing' });

// insert/upsert
await table.insert(records);

// search with optional filter
const results = await table
  .search(queryVector)
  .where(sqlFilter)     // e.g., "date > '2024-01-01' AND section IN ('intro','faq')"
  .metric('cosine')
  .limit(20)
  .toArray();
```

#### Notes
- Store `text` alongside `vector` for inspection and fallback
- Use `.where()` for hybrid metadata filtering
- Calibrate `k` and token budget jointly

Reference: Use @LanceDB JS for interfaces (per instruction).

---

### Suggested Schema Details (DDL-like, illustrative)

```
id: string (primary key)
docId: string (indexed)
vector: float32[] (HNSW, metric=cosine)
text: string
section: string (indexed)
date: string (indexed, ISO)
source: string
keywords: string[]
tokens: int
seq: int
provider: string         // e.g., 'ollama' | 'openai'
model: string            // e.g., 'nomic-embed-text' | 'text-embedding-3-small'
embeddingDim: int        // e.g., 768 or 1536
```

### Example Queries and Tests

- Good: `.where("date >= '2024-01-01' AND section IN ('faq','policy')")` returns recent FAQ chunks
- Bad: `.where('date >= 2024')` (invalid predicate) or filtering on missing/unified fields across sources

### Do/Don't
- Do: Keep `text` small enough for inspection, not entire documents when redundant
- Don't: Store duplicate rows for identical chunk ids; upsert instead of blind insert

---

### Embedding Dimension and Indexing
- Ensure vector length matches embedding model (e.g., OpenAI text-embedding-3-small → 1536)
- ANN HNSW recommended for `vector` with `cosine` metric
- Reindex when changing model/dimension; keep a `model` field for provenance

### Maintenance & Hygiene
- Idempotent upserts by `id` (chunk id)
- Periodic vacuum/compaction (if supported) to keep storage efficient
- Back up LanceDB directory before schema migrations

### Upsert Semantics
- If `id` exists, replace entire record (vector + metadata)
- Avoid partial updates that desync text and vector

---

### Multi-tenant Storage Patterns

Approach A (Big Pile): single `chunks` table with columns `tenantId`, `sourceId`, `domainKey`.
- Pros: simple
- Cons: recall loss with heavy filtering; ACL mistakes are riskier

Approach B (Recommended): table per tenant-source
- Table name: `chunks__tenant_{tenantId}__src_{sourceId}`
- Optional `domainKey` column for early-phase; promote high-signal domains to their own tables later
- Pros: isolation, better recall, independent updates, cleaner ACL

Routing Metadata
- Maintain registry mapping `tenantId` → `sourceIds` and table names
- Store `model` and `embeddingDim` fields for provenance

Updates & Deletes
- Upsert by `id` for updates; delete by `docId` on re-ingest; ensure secondary index by `docId`


