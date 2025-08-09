### Checklists and Milestones

#### Phase 0 — Scaffold
- [ ] Repo initialized with ESM, strict TS
- [ ] `src/mastra/` structure created (agents/tools/workflows/index)
- [ ] `.env.example` created and documented
- [ ] `OPENAI_API_KEY` read in dev

#### Phase 1 — Ingest
- [ ] MIME detect + parsers for PDF/MD
- [ ] Clean + chunk (paragraph baseline, 10% overlap)
- [ ] Regex metadata extraction
- [ ] Emits `Chunk[]` with `docId`, `seq`, `tokens`

#### Phase 2 — Vectorize
- [ ] OpenAI embeddings with batch + backoff
- [ ] LanceDB table `chunks` created with ANN index
- [ ] Upsert records with metadata
- [ ] Optional synthetic Q/A generated for eval seed

#### Phase 3 — Basic Q&A
- [ ] `retrieve(query, filters)` returns scored chunks
- [ ] Context assembly respects token budget
- [ ] Agent answers ≤ 300 tokens with citations
- [ ] 10 manual questions pass sanity checks

#### Phase 4 — Metadata & Multi-search
- [ ] LLM metadata extractor (title/summary/entities)
- [ ] Multi-search with field filters + recency bias

#### Phase 5 — Rerankers
- [ ] Cross-encoder reranker integrated
- [ ] Gains verified vs baseline

#### Phase 6 — Retrieval Refinements
- [ ] Heading-aware/semantic chunking
- [ ] Overlap/query-intent tuning

#### Phase 7 — New Sources
- [ ] DOCX, HTML, DB/API connectors via workflow
- [ ] Unified metadata normalization

#### Evaluation/CI
- [ ] `npm run eval` computes metrics
- [ ] CI blocks on thresholds

---

### Acceptance Test Examples

- Retrieval (Good): Query for a specific policy clause returns related chunks with score > 0.3
- Retrieval (Bad): Results dominated by unrelated sections (e.g., About Us page)

- Generation (Good): Answer ≤ 300 tokens; includes (§chunk-XXXX) citations; no chain-of-thought
- Generation (Bad): Long narrative; missing citations; reveals scratchpad

---

### Business Logic Gates (Before Release)
- Answers contain at least one valid citation for non-empty contexts
- Low-confidence answers (avg top-3 < 0.2) must use fallback template
- Filters honored; explain when filter relaxation is applied
- Guardrails enforced end-to-end; unsafe outputs blocked

### Rollback Plan
- Revert to previous LanceDB snapshot (directory backup)
- Toggle reranker/multi-search off if quality or latency regresses

---

### Multi-tenant and Routing Checklist (Later Phases)
- [ ] No cross-tenant leakage under any routing strategy
- [ ] ACL check precedes any vector search
- [ ] Table naming convention applied consistently
- [ ] Routing falls back to multiplex on LLM error
- [ ] Per-tenant dashboards for recall/latency


