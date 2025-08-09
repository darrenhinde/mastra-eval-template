### Planned Functions and Interfaces (TypeScript)

High-level function contracts and where they live in the Mastra template. These are design-time signatures; implementation comes later.

#### Ingestion (Tools)
Location: `src/mastra/tools/ingestion/`

```ts
export type ParsedDocument = { docId: string; text: string; metadata: Record<string, unknown> };

export async function detectMime(inputPathOrUrl: string): Promise<string>;
export async function parseDocument(inputPathOrUrl: string, mime: string): Promise<ParsedDocument>;
export function cleanText(rawText: string): string;

export type Chunk = {
  id: string;
  docId: string;
  text: string;
  metadata: {
    source: string; author?: string; date?: string; section?: string; keywords?: string[]; tokens: number; seq: number;
  };
};

export type ChunkingOptions = { strategy: 'paragraph' | 'sentence' | 'section' | 'token'; overlapRatio?: number; maxTokens?: number };
export function splitIntoChunks(doc: ParsedDocument, options: ChunkingOptions): Chunk[];

export function extractMetadataHybrid(text: string): {
  author?: string; date?: string; section?: string; keywords?: string[]; title?: string; summary?: string; entities?: string[];
};
```

#### Embedding & Storage (Tools)
Location: `src/mastra/tools/vectorstore/`

```ts
export type EmbeddingRecord = {
  id: string; docId: string; vector: number[]; text: string; section?: string; date?: string; source: string; keywords?: string[]; tokens: number; seq: number;
};

export async function getLanceDb(): Promise<import('@lancedb/vectordb').Connection>;
export async function getOrCreateTable(name: string): Promise<import('@lancedb/vectordb').Table>;

export async function embedChunks(chunks: Chunk[]): Promise<Array<EmbeddingRecord>>;
export async function upsertEmbeddings(tableName: string, records: EmbeddingRecord[]): Promise<void>;
```

#### Retrieval (Tools + Workflow)
Location: `src/mastra/tools/retrieval/`, `src/mastra/workflows/`

```ts
export type RetrievalFilters = { section?: string[]; dateAfter?: string; dateBefore?: string; docId?: string[] };
export type RetrievedChunk = EmbeddingRecord & { score: number };

export async function retrieve(query: string, filters?: RetrievalFilters, k?: number): Promise<RetrievedChunk[]>;
export function assembleContext(results: RetrievedChunk[], tokenBudget: number): string;
export async function rerank(query: string, results: RetrievedChunk[]): Promise<RetrievedChunk[]>; // optional phase 5
```

#### Multi-tenancy & Routing (Tools)
Location: `src/mastra/tools/routing/`, `src/mastra/tools/tenancy/`

```ts
export type TenantContext = { tenantId: string; sourceIds: string[] };
export function resolveTenant(userId: string): TenantContext; // app-level ACL mapping
export function listUserSources(tenantId: string): string[]; // configured sources per tenant

export type RoutingDecision = { tables: string[]; filters?: RetrievalFilters };
export function routeQueryMultiplex(query: string, tenant: TenantContext): RoutingDecision; // baseline
export async function routeQueryLLM(query: string, tenant: TenantContext): Promise<RoutingDecision>; // phase 4

export async function retrieveMultiplex(query: string, decisions: RoutingDecision, k: number): Promise<RetrievedChunk[]>;
export function applyAcl(userId: string, results: RetrievedChunk[]): RetrievedChunk[];

export function tableNameFor(tenantId: string, sourceId: string): string; // e.g., chunks__tenant_{t}__src_{s}
export async function ensureIndexesForTenantSource(tenantId: string, sourceId: string): Promise<void>;
```

#### Generation (Agent)
Location: `src/mastra/agents/`

```ts
export async function generateAnswer(userQuery: string, context: string): Promise<{ answer: string; citations: string[] }>;
```

#### Evaluation & Guardrails (Tools + Workflow)
Location: `src/mastra/tools/eval/`, `src/mastra/workflows/`

```ts
export type EvalRun = { id: string; timestamp: string; dataset: string; recallAt5: number; faithfulness: number; mrr?: number };
export async function evaluateRetrieval(datasetPath: string): Promise<EvalRun>;
export async function evaluateGeneration(datasetPath: string): Promise<EvalRun>;
export async function storeEvalRun(run: EvalRun): Promise<void>; // LanceDB table: eval_runs

export type GuardrailResult = { safe: boolean; reasons?: string[] };
export function checkToxicity(text: string): GuardrailResult;
export function checkPII(text: string): GuardrailResult;
export function detectPromptInjection(text: string): GuardrailResult;
```

References: Mastra template structure (agents/tools/workflows), LanceDB JS, OpenAI embeddings.

---

### Behavioral Contracts and Examples

#### Ingestion
- `detectMime(path)`: Should use file signature or extension; Should not rely solely on extension when signatures available.
- `parseDocument(path, mime)`: Should return full text; Should not strip tables unless preserving via Markdown is impossible.
- Example (Good): PDF with headers/footers → cleaned body text only
- Example (Bad): HTML parser includes nav/footer boilerplate

#### Chunking
- `splitIntoChunks(doc, { strategy: 'paragraph', overlapRatio: 0.1 })`: Should produce stable `id` and sequential `seq`; Should not exceed token budget per chunk.
- Example (Good): 2k-word doc → ~15–40 chunks, 10% overlap
- Example (Bad): chunks varying wildly 10–2000 tokens

#### Embeddings/Storage
- `embedChunks(chunks)`: Should batch with backoff; Should not retry infinitely on provider errors.
- `upsertEmbeddings(table, records)`: Should ensure ANN index exists; Should not drop text/metadata needed for filters and citations.

#### Retrieval
- `retrieve(query, filters, k)`: Should pre-filter when filters present; Should not return more than `k` results.
- `assembleContext(results, budget)`: Should stop before token overflow; Should not include low-score outliers if high-score coverage fits budget.

#### Routing
- `routeQueryMultiplex`: Should include only tables accessible to tenant; Should not down-select incorrectly in MVP
- `routeQueryLLM`: Should produce a subset of tables and structured filters; Should not select tables failing ACL

#### Tenancy
- `applyAcl`: Should filter out any results from unauthorized tables; Should not mutate scores

#### Generation
- `generateAnswer(query, context)`: Should cite `chunk_id` in final; Should not reveal chain-of-thought.

#### Evaluation
- `evaluateRetrieval(dataset)`: Should compute Recall@K consistently; Should not mix train/test examples.

### Minimal Usage Sketches

```ts
// ingestion
const mime = await detectMime('/docs/a.pdf');
const parsed = await parseDocument('/docs/a.pdf', mime);
const chunks = splitIntoChunks(parsed, { strategy: 'paragraph', overlapRatio: 0.1 });

// embeddings + storage
const records = await embedChunks(chunks);
await upsertEmbeddings('chunks', records);

// retrieval + generation
const retrieved = await retrieve('refund policy', { section: ['FAQ'] }, 20);
const context = assembleContext(retrieved, 4000);
const { answer, citations } = await generateAnswer('What is the refund policy?', context);
```

Multiplex routing usage (later phase):

```ts
const tenant = resolveTenant(currentUserId);
const decision = routeQueryMultiplex('refund policy', tenant);
const results = await retrieveMultiplex('refund policy', decision, 20);
```

---

### Error Types and Validation (Design)

```ts
import { z } from 'zod';

export const ChunkSchema = z.object({
  id: z.string().min(1),
  docId: z.string().min(1),
  text: z.string().min(1),
  metadata: z.object({
    source: z.string().min(1),
    author: z.string().optional(),
    date: z.string().optional(),
    section: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    tokens: z.number().int().nonnegative(),
    seq: z.number().int().nonnegative(),
  }),
});

export const EmbeddingRecordSchema = ChunkSchema.extend({
  vector: z.array(z.number()).min(1),
});

export enum IngestionErrorCode { ParserError = 'ParserError', ChunkingError = 'ChunkingError', MetadataError = 'MetadataError' }
export enum EmbeddingErrorCode { RateLimited = 'RateLimited', ProviderError = 'ProviderError', InvalidEmbedding = 'InvalidEmbedding' }
export enum StoreErrorCode { ConnectionError = 'ConnectionError', UpsertConflict = 'UpsertConflict', MissingIndex = 'MissingIndex' }
export enum RetrievalErrorCode { EmptyResults = 'EmptyResults', FilterMismatch = 'FilterMismatch' }
export enum GenerationErrorCode { SafetyViolation = 'SafetyViolation', ContextOverflow = 'ContextOverflow' }
```

### Function Contracts (Behavior)

- `detectMime(path)`
  - Inputs: file path/URL
  - Output: MIME string (`application/pdf`, `text/markdown`, `text/html`)
  - Errors: none fatal; unknown → `application/octet-stream`

- `parseDocument(path, mime)`
  - Behavior: select parser by MIME; ensure text length > 0
  - Errors: `ParserError` with cause; continue pipeline by skipping doc

- `splitIntoChunks(doc, options)`
  - Behavior: stable `id` generation (hash docId+offset); enforce token caps; maintain 10% overlap default
  - Errors: `ChunkingError` if empty after cleaning

- `embedChunks(chunks)`
  - Behavior: batch with backoff; attach vectors; preserve original metadata
  - Errors: `RateLimited` (retry), `InvalidEmbedding` (drop record)

- `upsertEmbeddings(table, records)`
  - Behavior: create table if missing; ensure ANN/scalar indexes; upsert by `id`
  - Errors: `ConnectionError`, `UpsertConflict`, `MissingIndex`

- `retrieve(query, filters, k)`
  - Behavior: embed query; apply `.where` for filters; limit k; sort by score desc
  - Errors: `EmptyResults`, `FilterMismatch`

- `routeQueryMultiplex(query, tenant)`
  - Behavior: map tenant sources → table names; return all tables
  - Errors: none; if zero sources, return empty `tables`

- `routeQueryLLM(query, tenant)`
  - Behavior: call agent/tool to classify relevant sources/domains; return subset tables + filters
  - Errors: classification failure → fallback to multiplex

- `assembleContext(results, budget)`
  - Behavior: greedy pack by score until budget; include `§chunk_id` markers for traceability
  - Errors: none; always returns ≤ budget

- `generateAnswer(userQuery, context)`
  - Behavior: apply prompt skeleton; ensure citations present; console-log token usage (for dev)
  - Errors: `SafetyViolation` (guardrails), `ContextOverflow` (should not happen if assembly correct)

### Rate Limits and Timeouts
- Provider: 30s timeout; 5 retries exponential backoff
- LanceDB: 15s timeout; 3 retries for transient errors


