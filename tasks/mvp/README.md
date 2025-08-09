### MVP Tasks (5 Steps)

Tags: MVP, Mastra Template, LanceDB, Embeddings Adapter, Model Registry (Aliases+Fallback)

This folder tracks the actionable tasks to build the MVP per the planning docs. Each task includes references (with @), deliverables, error handling, and good/bad tests.

References:
- @plan/02-mvp.md (MVP scope/acceptance)
- @plan/01-architecture.md (ASCII maps, lanes)
- @plan/07-mastra-template-mapping.md (structure/env/scripts)
- @plan/05-functions-and-interfaces.md (contracts)
- @plan/11-embedding-providers.md (adapters, dims, env)
- @plan/12-model-registry.md (getModel, aliases, fallback)
- @plan/00-mastra-master-reference.md (patterns, best practices)
- @Mastra AI (Template Structure, Agents/Tools/Workflows)
- @LanceDB JS (VectorDB interfaces)

Tasks:
- 1) `task-01-setup-and-scaffold.md` — scaffold project and environment
- 2) `task-02-ingestion-pipeline.md` — implement ingestion tools/workflow
- 3) `task-03-embeddings-and-lancedb.md` — embed chunks and upsert to LanceDB
- 4) `task-04-retrieval-and-assembly.md` — retrieval and context assembly
- 5) `task-05-agent-and-ask.md` — Mastra agent and /ask CLI

Note: MVP is intentionally single-tenant, single-source; routing/ACL come later (see @plan/01-architecture.md and @plan/04-phases.md).

### Task Dependencies

```
Task 01 (Setup) 
    ↓
Task 02 (Ingestion) 
    ↓
Task 03 (Embeddings/LanceDB) 
    ↓
Task 04 (Retrieval) 
    ↓
Task 05 (Agent/Ask)
```

**Parallel Work Opportunities:**
- Tasks 02 & 03 can be developed in parallel after Task 01
- Task 04 can begin once Task 03 storage interface is defined

### Integration Test Requirements

**End-to-End Flow Test:**
1. Ingest 3 PDFs + 2 MD files (known content)
2. Verify LanceDB contains expected chunk count
3. Query with known answer → verify citations match expected chunks
4. Test edge cases: empty results, malformed queries

**Provider Switching Test:**
1. Start with Ollama embeddings
2. Switch to OpenAI embeddings
3. Verify dimension handling and table management

**Error Recovery Test:**
1. Simulate provider failures during ingestion
2. Verify graceful degradation and retry behavior
3. Test partial batch processing recovery

Prerequisites (if using local embeddings):
- Install Ollama (>= 0.1.26) and pull the model: `ollama pull nomic-embed-text`

MVP Scope Confirmation:
- No routing/ACL, no rerankers, no advanced metadata extractors
- Single LanceDB table `chunks`, paragraph chunking only
- Modular embeddings via env (Ollama or OpenAI)
- Agent model via `getModel()` (alias or explicit); alias config optional

Optional LLM alias setup:
- Define `MODEL_ALIASES` in `src/mastra/config/models.ts` to set ordered failover (e.g., default → Google then OpenAI)


