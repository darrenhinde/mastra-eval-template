### Task 02 — Ingestion Pipeline (Parse → Clean → Chunk → Metadata)

Objective
- Implement ingestion utilities and a workflow that convert PDFs/Markdown into `Chunk[]` per @plan/01-architecture.md and @plan/05-functions-and-interfaces.md.

References
- @plan/03-stages-flow.md (Ingestion lane)
- @plan/05-functions-and-interfaces.md (function contracts)
- @plan/02-mvp.md (MVP constraints)
- @plan/01-architecture.md (MVP ASCII map)
- @plan/00-mastra-master-reference.md (RAG ingestion)
- @Mastra AI (workflows/ tools organization)

Deliverables
- `src/mastra/tools/ingestion/`:
  - `mime.ts` (`detectMime`)
  - `parse.ts` (`parseDocument` for PDF/MD)
  - `clean.ts` (`cleanText`)
  - `chunk.ts` (`splitIntoChunks` with paragraph strategy + 10% overlap)
  - `metadata.ts` (`extractMetadataHybrid` basic regex)
- `src/mastra/workflows/ingest-workflow.ts`: glue the steps and emit `Chunk[]`
 - Ensure output type includes provenance fields to be filled during embedding: `provider`, `model`, `embeddingDim` (left undefined until embedding step)

Checklist
1. Implement MIME detection
2. Add PDF and Markdown parsers
3. Normalize/clean text and preserve tables as Markdown when possible
4. Paragraph chunking with 10% overlap and token cap fallback
5. Basic regex metadata extraction (date, emails)
6. Validate `Chunk` with Zod (see @plan/05-functions-and-interfaces.md)

Expected Errors & Handling
- ParserError: skip file, log; continue batch
- ChunkingError: if cleaned text empty → skip
- MetadataError: proceed with partial metadata

Good Test (Must Pass)
- Ingest 5 PDFs and 5 MD files → produce 100–200 chunks with sequential `seq`, non-empty `text`, and `docId` set

Bad Test (Must Fail Gracefully)
- Include one corrupted PDF → workflow continues; summary logs 1 ParserError and total counts
 - If a doc yields zero chunks after cleaning, it is skipped with a clear reason; overall job succeeds


