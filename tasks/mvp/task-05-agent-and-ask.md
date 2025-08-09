### Task 05 — Mastra Agent and /ask CLI

Objective
- Wire a Mastra Agent using OpenAI, consume retrieval/context, and output an answer ≤ 300 tokens with citations (§chunk_id), per @plan/10-mvp-flow-and-prompts.md.

References
- @plan/10-mvp-flow-and-prompts.md (prompt skeleton, token budgeting)
- @plan/02-mvp.md (MVP acceptance criteria)
- @plan/12-model-registry.md (getModel, alias, options, fallback)
- @plan/01-architecture.md (MVP ASCII map)
- @Mastra AI (Agent creation, provider config)

Deliverables
- `src/mastra/agents/rag-agent.ts` (agent config with OpenAI)
- `scripts/ask.ts` CLI: embeds query → retrieve → assemble → agent.generate → print answer + citations
 - `src/mastra/tools/models/registry.ts` implementing `model(alias)` and `registerModel`
 - `src/mastra/config/models.ts` exporting `MODEL_ALIASES` (ordered fallback chains)

Checklist
1. Implement prompt skeleton (system/context/user)
2. Enforce ≤ 300 tokens; trim boilerplate
3. Verify citations present and refer to `chunk_id`
4. Add guardrails (basic toxicity/PII check) before final print
5. Provide clear CLI errors for missing env keys
 6. Use `getModel()` resolver with alias support and fallback chains (default from env; override via CLI `--model` supporting `provider:model` or alias; pass `ModelOptions`)
 7. Wrap the provider handle with retry + fallback behavior (429/5xx/timeouts)

Expected Errors & Handling
- SafetyViolation: return sanitized response; suggest narrowing query
- ContextOverflow (should not occur): re-assemble with tighter budget

Good Test (Must Pass)
- Ask: "What is the refund policy?" → answer with (§chunk-XXXX) citations, concise and grounded
 - Switch model alias to `llama2` via registry; agent still produces valid answer
 - Force simulated 429 on primary target; system falls back to secondary and returns an answer
 - Pass `--model-options '{"temperature":0.0,"maxOutputTokens":200}'` and verify shorter, deterministic output
 - Verify answer never reveals chain-of-thought; includes at least one valid citation when context non-empty

Bad Test (Must Fail Gracefully)
- Ask an off-topic question → fallback response: "No sufficiently grounded information found" (no fabricated citations)
 - Use an unknown alias → precise error showing known aliases
 - Alias resolves to non-operational providers → startup error listing missing envs
 - Safety violation flagged by guardrails → sanitized/declined response with rationale


