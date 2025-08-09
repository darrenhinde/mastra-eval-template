### Task 01 — Setup and Scaffold (MVP)

Objective
- Create the Mastra template skeleton and development environment to support MVP per @plan/07-mastra-template-mapping.md and @Mastra AI template guidelines.

References
- @plan/02-mvp.md (MVP scope/constraints)
- @plan/01-architecture.md (MVP ASCII map)
- @plan/07-mastra-template-mapping.md (structure, env, scripts)
- @plan/00-mastra-master-reference.md (setup patterns)
- @Mastra AI (Template Structure, TS config, README requirements)

Deliverables
- `src/mastra/` with `agents/`, `tools/`, `workflows/`, `index.ts` (empty placeholders ok)
- `.env.example` with `OPENAI_API_KEY`, `LANCEDB_PATH`
- `tsconfig.json` matching the provided config
- `package.json` scripts: `dev`, `ingest`, `ask`, `eval`
 - Add embedding env vars: `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIM`, `OLLAMA_BASE_URL`
 - Add LLM env vars: `LLM_ALIAS_DEFAULT`, `LLM_DEFAULT_MODEL`

Checklist
1. Add TypeScript config per @Mastra AI
2. Create directory structure per @plan/07-mastra-template-mapping.md
3. Add `.env.example` keys (OPENAI_API_KEY, LANCEDB_PATH, EMBEDDING_PROVIDER, EMBEDDING_MODEL, EMBEDDING_DIM, OLLAMA_BASE_URL)
4. Add scripts (no implementation yet)
5. Verify Node 18+, ESM mode (`"type": "module"`)

Expected Errors & Handling
- Missing Node 18+: document requirement and `nvm` usage
- Missing `.env`: scripts print actionable message

Good Test (Must Pass)
- Run `npm run dev` (stub) without crashing; required folders/files exist
 - `.env.example` contains all embedding and LLM vars; lint script confirms presence

Bad Test (Must Fail Gracefully)
- Remove `.env` and run `npm run ask` → clear error: "Missing env keys: OPENAI_API_KEY, LANCEDB_PATH"
 - Missing Ollama when EMBEDDING_PROVIDER=ollama → clear message to install/launch Ollama and pull `nomic-embed-text`


