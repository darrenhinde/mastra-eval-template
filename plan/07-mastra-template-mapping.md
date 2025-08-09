### Mastra Template Mapping

This section maps the RAG system to the standardized Mastra template structure provided.

#### Required Structure (source: provided "Mastra template structure")
- Mastra code in `src/mastra/`
- Agents in `src/mastra/agents/`
- Tools in `src/mastra/tools/`
- Workflows in `src/mastra/workflows/`
- Main config in `src/mastra/index.ts`
- ESM, Node 18+, strict TS

#### Planned Project Skeleton

```
src/
  mastra/
    agents/
      rag-agent.ts            // Mastra Agent configured with OpenAI (default)
    tools/
      ingestion/
        mime.ts
        parse.ts
        clean.ts
        chunk.ts
        metadata.ts
      vectorstore/
        lancedb.ts
        embed.ts
        upsert.ts
      embeddings/
        adapter.ts            // getEmbeddingAdapterFromEnv
        ollama.ts             // nomic-embed-text via Ollama REST
        openai.ts             // OpenAI embeddings
      retrieval/
        retrieve.ts
        assemble.ts
        rerank.ts              // added in phase 5
      routing/
        route-multiplex.ts     // phase 3a
        route-llm.ts           // phase 4
      tenancy/
        acl.ts                 // applyAcl, resolveTenant
      eval/
        retrieval-eval.ts
        generation-eval.ts
        guardrails.ts
      telemetry/
        metrics.ts
      models/
        registry.ts           // central LLM model(alias) registry
    config/
      models.ts               // MODEL_ALIASES and related env-driven config
    workflows/
      ingest-workflow.ts
      retrieve-workflow.ts
      evaluate-workflow.ts
    index.ts
```

#### Environment Variables (`.env.example`)
- `OPENAI_API_KEY=` (default provider)
- `ANTHROPIC_API_KEY=` (optional)
- `GOOGLE_GENERATIVE_AI_API_KEY=` (optional)
- `LANCEDB_PATH=` (path to LanceDB storage)
- `DEFAULT_TENANT_ID=` (optional for dev)
- `EMBEDDING_PROVIDER=` (e.g., `ollama` | `openai`)
- `EMBEDDING_MODEL=` (e.g., `nomic-embed-text` | `text-embedding-3-small`)
- `EMBEDDING_DIM=` (e.g., `768` | `1536`)
- `OLLAMA_BASE_URL=` (default `http://localhost:11434`)
- `LLM_ALIAS_DEFAULT=` (e.g., `default` | `llama2`)
- `LLM_DEFAULT_MODEL=` (optional hard override, e.g., `openai:gpt-4o-mini`)

#### TypeScript Config (`tsconfig.json`)
Use the standard Mastra TS config exactly as provided in the documentation snippet.

#### Compatibility
- Framework-free, single project
- Mastra-focused; no web framework boilerplate
- Mergeable and Node 18+ compatible

References: Mastra template structure (provided), LLM provider guidance (provided).

---

### Template Install/Setup (Guidelines)

```sh
npx create-mastra@latest --template template-name
cd your-project-name
cp .env.example .env
npm install
npm run dev
```

### README Requirements Mapping
- Overview: explain RAG purpose and Mastra components
- Setup: env keys (`OPENAI_API_KEY`, optional `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `LANCEDB_PATH`)
- Usage: ingest → ask examples with expected outputs
- Customization: swap providers, change chunking, enable reranking

### Quality Requirements
- Clean, commented, maintainable code; strict typing
- Error handling for external APIs (retry/backoff, informative errors)
- Zod validation for user inputs and critical configs

---

### Suggested package.json Scripts (Planning)

```
{
  "scripts": {
    "dev": "node --enable-source-maps ./scripts/dev.js",
    "ingest": "tsx ./scripts/ingest.ts",
    "ask": "tsx ./scripts/ask.ts",
    "eval": "tsx ./scripts/eval.ts",
    "route": "tsx ./scripts/route.ts"
  },
  "type": "module"
}
```

### README Outline (to implement later)
- Overview: what the template demonstrates (RAG with Mastra + LanceDB)
- Setup: `.env.example` → `.env`, install deps, run
- Usage: `npm run ingest`, `npm run ask`, expected outputs
- Multi-tenancy (later phases): `--tenant t1 --sources s1,s2`; routing examples
- Environment Variables: all required keys with links to providers
- Customization: provider swap, chunking strategies, reranking toggle


