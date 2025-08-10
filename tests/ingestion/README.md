# Ingestion Pipeline Tests

This directory contains tests for the document ingestion pipeline functionality.

## Directory Structure

```
tests/ingestion/
├── fixtures/           # Test documents
│   ├── policy.md       # Company policy with metadata
│   ├── sample.md       # Sample document with sections
│   ├── large-document.md # Large document for chunking tests
│   ├── minimal.md      # Minimal document for edge cases
│   └── corrupted.md    # Document with issues for error testing
├── test-suite.ts       # Comprehensive test suite
├── inspect-chunks.ts   # Interactive chunk inspection
├── debug-parsing.ts    # Debug parsing and metadata extraction
└── README.md          # This file
```

## Test Fixtures

### `policy.md`
- **Purpose**: Test metadata extraction
- **Features**: Author, date, structured sections
- **Expected**: 6 chunks with proper metadata

### `sample.md`
- **Purpose**: Test basic functionality
- **Features**: Multiple sections, contact info
- **Expected**: 6 chunks with section headers

### `large-document.md`
- **Purpose**: Test chunking strategies
- **Features**: ~400 words, multiple sections/subsections
- **Expected**: 8-12 chunks depending on strategy

### `minimal.md`
- **Purpose**: Test edge cases
- **Features**: Very short content
- **Expected**: 1 chunk

### `corrupted.md`
- **Purpose**: Test error handling
- **Features**: Malformed metadata, inconsistent structure
- **Expected**: Graceful handling with partial extraction

## Running Tests

### Full Test Suite
```bash
npx tsx tests/ingestion/test-suite.ts
```

### Interactive Inspection
```bash
npx tsx tests/ingestion/inspect-chunks.ts
```

### Debug Parsing
```bash
npx tsx tests/ingestion/debug-parsing.ts
```

### Manual Testing
```bash
# Test with all fixtures
npm run ingest ./tests/ingestion/fixtures

# Test with specific file
npm run ingest ./tests/ingestion/fixtures/large-document.md --strategy sentence

# Test with different options
npm run ingest ./tests/ingestion/fixtures --max-tokens 256 --overlap 0.2
```

## Test Coverage

The test suite covers:

- ✅ **Basic Functionality**: File discovery, parsing, chunking
- ✅ **Metadata Extraction**: Author, date, title, keywords, entities
- ✅ **Chunking Strategies**: Paragraph, sentence, section, token
- ✅ **Error Handling**: Non-existent paths, malformed documents
- ✅ **Edge Cases**: Minimal documents, large documents
- ✅ **Performance**: Token counting, chunk sizing

## Expected Results

When all tests pass, you should see:
- All fixtures processed successfully
- Metadata correctly extracted from structured documents
- Different chunking strategies producing varied results
- Proper error handling for invalid inputs
- Consistent chunk quality across different document types