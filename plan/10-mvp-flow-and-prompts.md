### MVP Flow Details and Prompt Skeleton

#### End-to-End MVP Flow
1) `ingest-workflow`
   - read docs → detect MIME → parse → clean → chunk → extract regex metadata → emit `Chunk[]`
2) `embed + upsert`
   - batch embed → upsert to LanceDB with scalar + ANN indexes
3) `retrieve`
   - embed query → `.where(filters)` → cosine search k=20 → assemble context (≤ 4k tokens)
4) `generate`
   - Mastra Agent runs prompt skeleton → produce ≤ 300 tokens with citations

#### Prompt Skeleton (planning)

```
SYSTEM:
You are a domain assistant. Cite sources by chunk_id.

CONTEXT:
{assembled_context}

USER:
{user_query}

ASSISTANT:
Provide a concise, grounded answer (≤ 300 tokens). Include citations as (§{chunk_id}).
```

References: Mastra agent configuration and environment management per provided template structure.

---

### Prompt Rules
- Do: Cite sources as (§chunk_id)
- Do: Keep ≤ 300 tokens; answer directly
- Don't: Expose chain-of-thought; no speculative claims without context support

### Examples

- Good Answer
  - "The refund policy allows returns within 30 days for unused items (§chunk-0012, §chunk-0015)."

- Bad Answer
  - "I think the company maybe refunds after 90 days because other companies do." (no citations; speculation)

### What Not To Do
- Do not fabricate citations or chunk ids
- Do not exceed token budget with boilerplate

---

### Token Budgeting Procedure (Planning)
- Reserve 100–150 tokens for the answer
- Allocate remaining to context; sort results by score desc and pack greedily
- If tie, prefer recent `date` and distinct `docId` to increase coverage

### Scoring Thresholds
- If average of top-3 scores < 0.2 → use safe fallback
- If no results above 0.1 → ask clarifying question or return fallback

### Context Assembly Example (Illustrative)

```
§chunk-0012: "Returns are accepted within 30 days..."
§chunk-0015: "Refunds processed to the original payment method..."
```

### Prompt Anti-patterns
- Avoid meta instructions that disclose system rules
- Avoid telling the model to think step-by-step in the final output

---

### Routing Prompts (Later Phases)
Purpose: classify relevant sources/domains and derive structured filters. Keep it as a classification prompt, not chain-of-thought.

Sketch:
```
SYSTEM: You are a routing classifier. Given a user query and a catalog of sources/domains, select the relevant ones and propose optional filters.
INPUT:
- Query: {query}
- Candidate Sources: {sources}
- Domains: {domains}
OUTPUT (JSON): { "sources": ["s1","s2"], "domains": ["faq"], "filters": { "region": "US" } }
```

Notes
- Enforce a strict JSON schema to avoid parsing errors
- Calibrate decisions against human judgments before enabling in production


