### Task 04 — Retrieval and Context Assembly

Objective
- Implement MVP retrieval: embed query, search LanceDB `chunks` (cosine), pre-filter via `.where`, assemble context under token budget per @plan/03-stages-flow.md.

References
- @plan/03-stages-flow.md (Query Processing lane)
- @plan/05-functions-and-interfaces.md (retrieve, assembleContext)
- @plan/02-mvp.md (Acceptance criteria)
- @plan/01-architecture.md (MVP ASCII map)
- @plan/00-mastra-master-reference.md (vector query tool pattern)
- @LanceDB JS (search API)

Deliverables
- `src/mastra/tools/retrieval/`:
  - `retrieve.ts` (`retrieve(query, filters, k)`) with `.metric('cosine')`
  - `assemble.ts` (`assembleContext(results, tokenBudget)`) greedy pack by score

Checklist
1. Embed the user query with same model as chunks
2. Apply `.where(filter)` when filters provided
3. Limit to k=20 results by default
4. Assemble context with reserved tokens for answer (100–150)
5. Attach `score` and ensure `§chunk_id` available for citations

Expected Errors & Handling
- EmptyResults: return safe fallback guidance upstream
- FilterMismatch: relax filters optionally or surface suggestion to user

Good Test (Must Pass)
- Query "refund policy" with `section=FAQ` returns relevant chunks; context ≤ 4k tokens
 - If filters are too narrow, relaxing them (documented behavior) yields results

Bad Test (Must Fail Gracefully)
- Query irrelevant to corpus returns EmptyResults; assembly returns empty context and signals fallback
 - If `.where` clause is malformed or references missing fields, the tool surfaces a clear error and suggests valid fields


