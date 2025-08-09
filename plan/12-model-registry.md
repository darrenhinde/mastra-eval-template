### Central Model Registry (LLM) — `getModel(spec?: string, options?: ModelOptions)`

Goal
- Provide a single entry point `model(alias)` to select an LLM across providers (OpenAI, Anthropic, Google, Ollama) for use in Mastra Agents. Keeps provider config centralized and swappable.

References
- @Mastra AI (Agents use provider models, e.g., `openai('gpt-4')`)
- @plan/07-mastra-template-mapping.md (structure & env)
- @plan/10-mvp-flow-and-prompts.md (agent usage)

Location
- `src/mastra/tools/models/registry.ts`

Environment
- `LLM_PROVIDER`: `openai` | `anthropic` | `google` | `ollama`
- `LLM_MODEL`: e.g., `gpt-4o-mini` | `claude-3-haiku` | `gemini-1.5-pro` | `llama2`
- `OLLAMA_BASE_URL`: for local LLMs (default `http://localhost:11434`)

Interface (Design)
```ts
export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'ollama';

export type ModelOptions = {
  // Common sampling controls (mapped per provider)
  temperature?: number;       // e.g., 0.0–2.0 (provider-specific bounds)
  maxOutputTokens?: number;   // a.k.a. maxTokens
  topP?: number;              // nucleus sampling
  topK?: number;              // some providers support
  presencePenalty?: number;   // OpenAI
  frequencyPenalty?: number;  // OpenAI

  // Provider-specific extras (ignored if unsupported)
  responseFormat?: 'text' | 'json_object';  // OpenAI
  safetySettings?: Record<string, unknown>; // Google
  systemPrompt?: string;                    // default system prefix
};

// Filter configured providers that are actually operational (env present)
export type ModelConfig = { provider: ModelProvider; models: string[] };
export function getOperationalModels(): ModelConfig[];

// Returns a provider-specific model handle compatible with Mastra Agent config
// spec accepts forms: 'provider:model', 'model' (resolved from operational sets), or undefined (default selection)
export function getModel(spec?: string, options?: ModelOptions): unknown;
```

Behavior
- Static provider-model catalog in file (type-safe union for providers). Example default list:
  - google: ['gemini-1.5-flash-latest','gemini-1.5-pro-latest']
  - openai: ['gpt-4o-mini','gpt-4o']
  - ollama: ['llama3.2']
  - anthropic: ['claude-3-sonnet-20240229','claude-3-opus-20240229']
- `getOperationalModels()` filters by env presence per provider (API keys or `OLLAMA_BASE_URL`).
- `getModel('provider:model', { temperature: 0.0 })` parses and selects explicitly.
- `getModel('model')` resolves by searching operational configs for that model name.
- `getModel()` (no args): prefer Google 'gemini-1.5-flash-latest' if operational, else first operational provider+model.
- Unsupported options are ignored with warn logs. Options merge onto provider-specific model init where available.

Error Handling
- Unknown alias → throw clear error including available aliases
- Provider misconfiguration (missing API key or OLLAMA_BASE_URL) → actionable error
- Unsupported provider → error with link to provider docs
- Invalid option values (e.g., temperature out of bounds) → validation error with provider-specific range

Good Tests
- With OPENAI and GOOGLE keys set, `getModel()` returns Google 'gemini-1.5-flash-latest' by default
- `getModel('openai:gpt-4o-mini', { temperature: 0.2 })` returns OpenAI handle and applies options
- `getModel('llama3.2')` resolves to Ollama when `OLLAMA_BASE_URL` is set

Bad Tests
- Calling `getModel('unknown')` → precise error listing operational providers/models
- Missing OpenAI key but specifying `openai:gpt-4o-mini` → error instructing to set `OPENAI_API_KEY`
- `getModel(undefined, { temperature: -1 })` → validation error with allowed range

Notes
- Keep this separate from embedding adapters. LLM generation (Agent) and embeddings can use different providers.
- For MVP, support OpenAI as default; Ollama optional for `llama2`.

Implementation Sketch
- Statically import provider factories (OpenAI, Anthropic, Google, Ollama) for type-safety
- Implement `getOperationalModels()` filtering env vars by provider
- Implement `getModel()` resolution logic per rough concept; support 'provider:model' and plain 'model'
- Option mapping layer: map `ModelOptions` to provider init methods (ignore unsupported)

---

### Alias Management and Fallback Policy

Config Location
- `src/mastra/config/models.ts` (type-safe) exports `MODEL_ALIASES` with compile-time guarantees (see Type Safety below)

Environment Overrides
- `LLM_ALIAS_DEFAULT` (e.g., `default` | `llama2`)
- `LLM_DEFAULT_MODEL` (optional hard override; `provider:model`)

Fallback Behavior
- Resolve alias to an ordered list; pick the first operational target
- At runtime, wrap the selected model with retry + circuit breaker + fallback:
  - On rate limit (429), timeout, or 5xx: exponential backoff (max 3) → try next target in alias list
  - Circuit break a failing target for a cool-down window (e.g., 60s)
  - Log provider/model used for each response (telemetry)

Wrappers
- Use `wrapLanguageModel` from `ai` to implement retry/fallback wrapper that delegates to provider handles

Good Tests
- With both Google and OpenAI operational, `getModel()` selects Google by default; simulate 429 → falls back to OpenAI and succeeds
- `getModel('llama2')` uses Ollama when available; if `OLLAMA_BASE_URL` missing, clear error

Bad Tests
- Alias maps to only non-operational providers → startup error listing missing envs
- Circuit breaker blocks flapping provider; requests route to stable fallback

---

### Type Safety (Providers, Models, and Aliases)

Goal: Prevent invalid pairs like `openai:gemini-1.5-flash-latest` at compile time.

```ts
// 1) Providers
export type ModelProvider = 'openai' | 'google' | 'anthropic' | 'ollama';

// 2) Per-provider model unions using literal arrays
export const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o'] as const;
export type OpenAIModel = (typeof OPENAI_MODELS)[number];

export const GOOGLE_MODELS = ['gemini-1.5-flash-latest', 'gemini-1.5-pro-latest'] as const;
export type GoogleModel = (typeof GOOGLE_MODELS)[number];

export const ANTHROPIC_MODELS = ['claude-3-sonnet-20240229', 'claude-3-opus-20240229'] as const;
export type AnthropicModel = (typeof ANTHROPIC_MODELS)[number];

export const OLLAMA_MODELS = ['llama3.2'] as const;
export type OllamaModel = (typeof OLLAMA_MODELS)[number];

// 3) Provider → Model mapping
export type ProviderModelMap = {
  openai: OpenAIModel;
  google: GoogleModel;
  anthropic: AnthropicModel;
  ollama: OllamaModel;
};

// 4) Template-literal union for 'provider:model' pairs
export type ProviderModelPair = {
  [P in keyof ProviderModelMap]: `${P}:${ProviderModelMap[P]}`
}[keyof ProviderModelMap];

// 5) Aliases must reference valid provider:model pairs (enforced by TS)
export type ModelAliases = Record<string, ProviderModelPair[]>;

export const MODEL_ALIASES: ModelAliases = {
  default: ['google:gemini-1.5-flash-latest', 'openai:gpt-4o-mini'],
  llama2: ['ollama:llama3.2'],
};

// Example of an invalid alias (WILL NOT COMPILE):
// export const BROKEN_ALIASES: ModelAliases = {
//   bad: ['openai:gemini-1.5-flash-latest'], // ❌ google model under openai
// };
```

Runtime Validation
- `getOperationalModels()` filters by env (e.g., `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `OLLAMA_BASE_URL`).
- `getModel(spec)` will reject non-operational selections with actionable errors, even if they type-check.


