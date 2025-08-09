### Incremental Build Phases

This plan structures delivery into safe, testable increments. Each phase has exit criteria.

#### Phase 0 — Scaffold
- Initialize template per Mastra structure
- Add `.env.example`, `tsconfig.json`, ESM `package.json`
- Wire minimal `rag-agent`, `ingest-workflow`, `retrieve-workflow`

Exit: repo builds; smoke test scripts run.

#### Phase 1 — Ingest
- Implement connectors (PDF, Markdown)
- MIME detection, parsing/cleaning, paragraph chunking
- Basic regex metadata

Exit: `Chunk[]` emitted with metadata; small document set ingested.

#### Phase 2 — Vectorize (+ Synthetic Data Option)
- OpenAI embeddings; batch with backoff
- Write to LanceDB; create indexes
- Optional: generate synthetic Q/A pairs from corpus snippets to bootstrap evaluation

Exit: LanceDB populated; basic retrieval sanity checks pass.

#### Phase 3 — Basic Q&A
- `retrieve(query, filters)` API; assemble context ≤ budget
- Mastra Agent prompt; `/ask` script returns answer with citations
- Add query result checks (empty results, low scores → fallback messaging)

Exit: Manual test suite of 10 questions passes; citations valid.

#### Phase 4 — Metadata & Multi-search
- Improve metadata extraction (LLM-based title/summary/entities)
- Add multi-search: hybrid filters, field-boosting, recency bias

Exit: Retrieval metrics improve on offline set; filters documented.

#### Phase 5 — Rerankers
- Integrate cross-encoder reranker (e.g., bge-reranker-base via JS inference or API)
- Calibrate k before/after rerank; add ablation toggles

Exit: Measurable MRR/Recall gains vs. baseline.

#### Phase 6 — Retrieval Refinements
- Semantic-aware chunking (section-level; heading-aware)
- Overlap tuning; query-intent pre-filtering

Exit: Token efficiency and answer faithfulness improve.

#### Phase 7 — New Data Sources
- Add DOCX, HTML, simple DB/API connector via Mastra workflow step
- Normalize metadata across sources

Exit: Heterogeneous sources ingest cleanly; eval remains green.

---

### Definition of Done and Tests per Phase

- Phase 1 DoD
  - Do: PDFs/MDs convert into `Chunk[]` with `docId`, `seq`, `tokens`
  - Test (Good): 10-page PDF → ~20–60 chunks; sections preserved in metadata
  - Test (Bad): Single 10k-token chunk produced; empty `docId` or `seq`

- Phase 2 DoD
  - Do: LanceDB table with ANN index; all chunks embedded and upserted
  - Test (Good): random spot search returns semantically similar neighbors
  - Test (Bad): many identical vectors (embedding failure) or missing ANN index

- Phase 3 DoD
  - Do: `/ask` answers ≤ 300 tokens with valid citations
  - Test (Good): low-score queries trigger safe fallback
  - Test (Bad): hallucinated facts or fabricated citations

- Phase 4 DoD
  - Do: LLM metadata enriches retrieval; multi-search filters documented
  - Test (Good): recency filter changes top-k ordering as expected
  - Test (Bad): filters ignored or produce empty results when data exists

- Phase 5 DoD
  - Do: reranker measurably improves MRR/Recall
  - Test (Good): A/B shows +5–10% relative MRR
  - Test (Bad): reranker degrades latency without quality gain

- Phase 6 DoD
  - Do: heading-aware chunking reduces context bloat
  - Test (Good): fewer off-topic chunks in assembled context
  - Test (Bad): overlap too small → context fragmentation/semantic bleed

- Phase 7 DoD
  - Do: new connectors with normalized metadata
  - Test (Good): DOCX/HTML ingest with consistent `section`/`date`
  - Test (Bad): inconsistent field names break filters

---

### Backlog Tasks by Phase (Illustrative)

- Phase 1
  - MIME detection utility; PDF/MD parsers; cleaner; paragraph chunker; regex metadata
- Phase 2
  - Embedding client with backoff; LanceDB client; upsert + index ensure; optional synthetic Q/A generator
- Phase 3
  - Retrieval function; context assembler with token estimator; agent prompt; CLI `ask`
- Phase 3a (Routing — Multiplex)
  - Implement `routeQuery` (baseline multiplexer); query per table and merge results with source tags
  - ACL check pre-routing; ensure no cross-tenant leakage
- Phase 4
  - LLM metadata extractor; multi-search filters; LLM routing to relevant tables/domains
- Phase 5
  - Cross-encoder integration; A/B toggle; latency budget adjustments
- Phase 6
  - Heading-aware chunker; overlap tuning; query-intent pre-filtering; denormalization by high-signal keys (e.g., region/docType)
- Phase 7
  - DOCX/HTML connectors; basic DB/API connector via workflow step

### Risks & Mitigations
- Parser fragility → multiple parsers per type + fallbacks
- Provider outages → provider abstraction and retry/circuit breaker
- Index drift → "ensure index" step at startup; health checks
- Evaluation overfitting → hold-out set and periodic rotation
 - ACL mistakes → ACL checks placed before any retrieval; tests for cross-tenant leakage


