### Evaluation, Guardrails, and Telemetry

#### Offline Evaluation
- Dataset: small curated Q/A pairs; optionally synthetic from corpus (phase 2)
- Metrics: Retrieval Recall@K, MRR; Generation Faithfulness, Answer Relevancy
- Storage: LanceDB table `eval_runs` for trend analysis
- CLI: `npm run eval` to compute metrics and write a run record
- CI: Block merges if Recall@5 < 0.8 or Faithfulness < 0.9

#### Online Telemetry
- Metrics: latency, hit-rate, LLM token/cost, fallback percentage
- Logging strategy: structured logs; optional Prometheus/Grafana integration

### Production Monitoring

**Metrics Collection:**
```typescript
export interface RAGMetrics {
  ingestion: {
    documentsProcessed: number;
    chunksCreated: number;
    failureRate: number;
    avgProcessingTime: number;
  };
  retrieval: {
    queriesProcessed: number;
    avgLatency: number;
    emptyResultRate: number;
    avgRelevanceScore: number;
  };
  generation: {
    responsesGenerated: number;
    avgTokensUsed: number;
    citationRate: number;
    guardrailViolations: number;
  };
}
```

**Telemetry Hooks:**
- Structured logging with correlation IDs
- Performance timing for each pipeline stage
- Cost tracking (API calls, token usage)
- Quality metrics (citation accuracy, relevance scores)

#### Guardrails (IOGuards)
- Checks: toxicity, PII patterns, prompt-injection heuristics
- Placement: pre-generation (sanitize user input) and post-generation (redact)
- Behavior: if unsafe → respond with safe fallback or ask for clarification

#### Ablations & Toggles
- Flags to disable/enable reranking, multi-search filters, and overlap settings for quick experiments

References: Plan specification; Mastra template structure (tools/workflows), LanceDB for eval storage.

---

### Metric Definitions
- Recall@K: fraction of queries where at least one gold chunk appears in top-K
- MRR: mean reciprocal rank of first correct item
- Faithfulness: proportion of answers supported by retrieved context
- Answer Relevancy: semantic relevance vs gold answer

### Dataset Format (illustrative JSONL)
```
{ "query": "What is the refund policy?", "gold_chunk_ids": ["chunk-0012","chunk-0015"], "gold_answer": "..." }
```

### Good/Bad Eval Cases
- Good: Top-5 includes at least one gold chunk; answer cites it and matches gold semantics
- Bad: No gold chunk in top-10; answer fabricates policy without citations

### CI Gate Shape
- `npm run eval` outputs JSON summary and non-zero exit when thresholds fail
- Store `EvalRun` in LanceDB `eval_runs` with timestamp, dataset id, metrics

---

### IOGuards Placement (Pipeline)
- Pre-processing: sanitize user query (prompt-injection patterns, PII)
- Post-retrieval: check retrieved text for toxicity/PII before generation
- Post-generation: re-check output; redact/decline if unsafe

### Implementation Outline
- Functions: `checkToxicity`, `checkPII`, `detectPromptInjection`
- Behavior: return `{ safe: boolean, reasons?: string[] }`; if `safe=false`, choose fallback path

### Handling False Positives/Negatives
- Provide an override flag for dev/testing
- Log reason codes; sample flagged cases for review

### Evaluation CLI (Planning)
```sh
npm run eval -- --dataset ./eval/dataset.jsonl --metrics recall@mrr,faithfulness
```

---

### Routing Evaluation (Later Phases)
- Datasets include multi-source questions with gold source/domain labels
- Compare multiplex vs LLM routing on Recall@K, MRR, latency
- Per-tenant metrics to ensure no regression for any tenant cohort

### Selectivity Instrumentation
- Log estimated selectivity for filters and effective corpus size per query
- Correlate selectivity with recall to inform denormalization decisions


