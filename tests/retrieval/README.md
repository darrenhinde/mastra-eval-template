# Retrieval Tests

This directory contains comprehensive tests for the retrieval system.

## Test Files

### `test-retrieval-ollama.ts`
**Main integration test** - Tests the complete retrieval pipeline using real Ollama embeddings:
- Document ingestion with real embedding generation
- Vector similarity search accuracy
- Topic-specific query testing (AI, cooking, finance)
- Cross-topic discrimination
- Context assembly and token budgeting
- Metadata filtering by source

**Prerequisites:**
- Ollama running locally (`ollama serve`)
- nomic-embed-text model installed (`ollama pull nomic-embed-text`)

**Run:** `npx tsx tests/retrieval/test-retrieval-ollama.ts`

### `test-retrieval.ts`
Existing comprehensive test suite covering:
- Basic retrieval functionality
- Filtered retrieval
- Context assembly
- Fallback strategies
- Error handling
- Mastra tool integration

### Test Fixtures

- `fixtures/ai-document.md` - AI and machine learning content
- `fixtures/cooking-document.md` - Cooking and recipe content  
- `fixtures/finance-document.md` - Personal finance and investment content
- `fixtures/doc1.md` - Simple AI content
- `fixtures/doc2.md` - Simple cooking content

## Running Tests

```bash
# Run main Ollama integration test
npm run test:retrieval:ollama

# Run existing comprehensive test
npm run test:retrieval

# Run all retrieval tests
npm run test:retrieval:all
```

## Test Strategy

The tests validate:
1. **Accuracy** - Relevant documents rank higher than irrelevant ones
2. **Discrimination** - Topic-specific queries return topic-specific results
3. **Filtering** - Metadata filters work correctly
4. **Assembly** - Context assembly respects token budgets and includes citations
5. **Error Handling** - Graceful handling of edge cases

## Expected Results

For accurate retrieval:
- AI queries should return AI document chunks as top results
- Cooking queries should return cooking document chunks as top results
- Finance queries should return finance document chunks as top results
- Cross-topic queries should discriminate appropriately
- Relevance scores should be > 0.3 for good matches