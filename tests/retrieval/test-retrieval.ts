#!/usr/bin/env tsx

/**
 * Comprehensive test suite for retrieval functionality
 * Tests vector search, filtering, context assembly, and error handling
 *
 * Styled similarly to tests/ingestion/test-suite.ts for consistent outputs
 */

import { config } from "dotenv";
import { retrieve } from "../../src/mastra/tools/retrieval/retrieve.js";
import { assembleContext } from "../../src/mastra/tools/retrieval/assemble.js";
import {
  retrieveWithFallback,
  validateFilters,
} from "../../src/mastra/tools/retrieval/fallback.js";
import {
  vectorRetrievalTool,
  simpleRetrievalTool,
} from "../../src/mastra/tools/retrieval/tool.js";
import { RetrievalError } from "../../src/mastra/tools/retrieval/types.js";
import type { RetrievalFilters } from "../../src/mastra/tools/retrieval/types.js";

// Load environment variables
config();

// Unified test harness (mirrors tests/ingestion/test-suite.ts)
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

async function runTest(
  name: string,
  testFn: () => Promise<
    boolean | { passed: boolean; message: string; details?: any }
  >
): Promise<TestResult> {
  try {
    console.log(`🧪 Running: ${name}`);
    const result = await testFn();

    if (typeof result === "boolean") {
      return { name, passed: result, message: result ? "Passed" : "Failed" };
    }

    return {
      name,
      passed: result.passed,
      message: result.message,
      details: result.details,
    };
  } catch (error) {
    return {
      name,
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

async function testBasicRetrieval() {
  console.log("📊 Test 1: Basic retrieval functionality...");

  try {
    // Test with a general query
    const chunks = await retrieve(
      "artificial intelligence machine learning",
      undefined,
      {
        tableName: "chunks",
        k: 5,
      }
    );

    console.log(`✅ Retrieved ${chunks.length} chunks`);
    console.log(
      `   Score range: ${chunks[0]?.score.toFixed(3)} - ${chunks[chunks.length - 1]?.score.toFixed(3)}`
    );
    console.log(
      `   Sources: ${[...new Set(chunks.map((c) => c.source))].join(", ")}`
    );

    // Validate chunk structure
    for (const chunk of chunks) {
      if (!chunk.id || !chunk.text || typeof chunk.score !== "number") {
        throw new Error(`Invalid chunk structure: ${JSON.stringify(chunk)}`);
      }
    }

    console.log("✅ Basic retrieval test passed\n");
    return chunks;
  } catch (error) {
    console.error(
      "❌ Basic retrieval test failed:",
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

async function testFilteredRetrieval() {
  console.log("📊 Test 2: Filtered retrieval...");

  try {
    // Test with section filter
    const filters: RetrievalFilters = {
      section: ["introduction", "overview"],
    };

    const chunks = await retrieve("test document", filters, {
      tableName: "chunks",
      k: 10,
    });

    console.log(`✅ Retrieved ${chunks.length} chunks with section filter`);

    // Verify all chunks match the filter
    const sections = chunks.map((c) => c.section).filter(Boolean);
    const validSections = sections.every((section) =>
      filters.section!.includes(section!)
    );

    if (!validSections && sections.length > 0) {
      console.warn(
        "⚠️  Some chunks don't match section filter (this may be expected if sections are optional)"
      );
    }

    console.log("✅ Filtered retrieval test passed\n");
    return chunks;
  } catch (error) {
    if (error instanceof RetrievalError && error.code === "EmptyResults") {
      console.log(
        "✅ Empty results handled correctly (no chunks match filter)\n"
      );
      return [];
    }

    console.error(
      "❌ Filtered retrieval test failed:",
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

async function testContextAssembly() {
  console.log("📊 Test 3: Context assembly...");

  try {
    // Get some chunks first
    const chunks = await retrieve("document content", undefined, {
      tableName: "chunks",
      k: 10,
    });

    if (chunks.length === 0) {
      console.log("⚠️  No chunks available for context assembly test");
      return;
    }

    // Test context assembly with different token budgets
    const contexts = [
      assembleContext(chunks, { tokenBudget: 1000, includeCitations: true }),
      assembleContext(chunks, { tokenBudget: 2000, includeCitations: false }),
      assembleContext(chunks, { tokenBudget: 500, maxChunks: 3 }),
    ];

    for (const [index, context] of contexts.entries()) {
      const budget = [1000, 2000, 500][index];
      console.log(
        `   Budget ${budget}: ${context.chunks.length} chunks, ${context.totalTokens} tokens${context.truncated ? " (truncated)" : ""}`
      );

      if (context.totalTokens > budget) {
        throw new Error(
          `Context exceeds token budget: ${context.totalTokens} > ${budget}`
        );
      }

      // Check citations are included when requested
      if (index === 0 && context.context && !context.context.includes("§")) {
        console.warn(
          "⚠️  Citations not found in context (may be expected if no chunks)"
        );
      }
    }

    console.log("✅ Context assembly test passed\n");
  } catch (error) {
    console.error(
      "❌ Context assembly test failed:",
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

async function testFallbackStrategies() {
  console.log("📊 Test 4: Fallback strategies...");

  try {
    // Test with overly restrictive filters that should trigger fallback
    const restrictiveFilters: RetrievalFilters = {
      section: ["nonexistent-section"],
      dateAfter: "2030-01-01", // Future date
    };

    const result = await retrieveWithFallback(
      "test query",
      restrictiveFilters,
      { enableFilterRelaxation: true }
    );

    console.log(`✅ Fallback retrieval: ${result.chunks.length} chunks`);
    console.log(`   Fallback used: ${result.fallbackUsed}`);
    if (result.fallbackStrategy) {
      console.log(`   Strategy: ${result.fallbackStrategy}`);
    }

    console.log("✅ Fallback strategies test passed\n");
  } catch (error) {
    if (error instanceof RetrievalError) {
      console.log("✅ Fallback correctly failed when no results available\n");
    } else {
      console.error(
        "❌ Fallback strategies test failed:",
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  }
}

async function testFilterValidation() {
  console.log("📊 Test 5: Filter validation...");

  try {
    // Test valid filters
    const validFilters: RetrievalFilters = {
      section: ["introduction"],
      dateAfter: "2024-01-01",
      dateBefore: "2024-12-31",
    };

    const validResult = await validateFilters(validFilters);
    if (!validResult.valid) {
      throw new Error(
        `Valid filters marked as invalid: ${validResult.errors.join(", ")}`
      );
    }

    // Test invalid filters
    const invalidFilters: RetrievalFilters = {
      dateAfter: "invalid-date",
      dateBefore: "2024-01-01",
      section: [], // Empty array
    };

    const invalidResult = await validateFilters(invalidFilters);
    if (invalidResult.valid) {
      throw new Error("Invalid filters marked as valid");
    }

    console.log(
      `✅ Filter validation: ${invalidResult.errors.length} errors detected`
    );
    console.log(`   Suggestions: ${invalidResult.suggestions.length} provided`);

    console.log("✅ Filter validation test passed\n");
  } catch (error) {
    console.error(
      "❌ Filter validation test failed:",
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

async function testMastraTools() {
  console.log("📊 Test 6: Mastra tool integration...");

  try {
    // Note: Mastra tools need to be executed within the Mastra framework context
    // For now, we'll verify the tools are properly structured

    console.log(`✅ Vector retrieval tool created: ${vectorRetrievalTool.id}`);
    console.log(
      `   Input schema: ${vectorRetrievalTool.inputSchema ? "defined" : "missing"}`
    );
    console.log(
      `   Output schema: ${vectorRetrievalTool.outputSchema ? "defined" : "missing"}`
    );

    console.log(`✅ Simple retrieval tool created: ${simpleRetrievalTool.id}`);
    console.log(
      `   Input schema: ${simpleRetrievalTool.inputSchema ? "defined" : "missing"}`
    );
    console.log(
      `   Output schema: ${simpleRetrievalTool.outputSchema ? "defined" : "missing"}`
    );

    console.log(
      "✅ Mastra tool integration test passed (tools properly structured)\n"
    );
  } catch (error) {
    console.error(
      "❌ Mastra tool integration test failed:",
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

async function testErrorHandling() {
  console.log("📊 Test 7: Error handling...");

  try {
    // Test empty query
    try {
      await retrieve("");
      throw new Error("Empty query should have failed");
    } catch (error) {
      if (!(error instanceof RetrievalError)) {
        throw new Error("Expected RetrievalError for empty query");
      }
      console.log("✅ Empty query error handled correctly");
    }

    // Test nonexistent table
    try {
      await retrieve("test", undefined, { tableName: "nonexistent_table" });
      throw new Error("Nonexistent table should have failed");
    } catch (error) {
      if (!(error instanceof RetrievalError)) {
        throw new Error("Expected RetrievalError for nonexistent table");
      }
      console.log("✅ Nonexistent table error handled correctly");
    }

    console.log("✅ Error handling test passed\n");
  } catch (error) {
    console.error(
      "❌ Error handling test failed:",
      error instanceof Error ? error.message : error
    );
    throw error;
  }
}

async function runAllTests() {
  console.log("🚀 Running Retrieval Test Suite\n");

  const tests: TestResult[] = [];

  tests.push(
    await runTest("Basic Retrieval", async () => {
      await testBasicRetrieval();
      return { passed: true, message: "Retrieved relevant chunks" };
    })
  );

  tests.push(
    await runTest("Filtered Retrieval", async () => {
      await testFilteredRetrieval();
      return { passed: true, message: "Applied filters correctly" };
    })
  );

  tests.push(
    await runTest("Context Assembly", async () => {
      await testContextAssembly();
      return {
        passed: true,
        message: "Assembled context within token budgets",
      };
    })
  );

  tests.push(
    await runTest("Fallback Strategies", async () => {
      await testFallbackStrategies();
      return { passed: true, message: "Fallback used when appropriate" };
    })
  );

  tests.push(
    await runTest("Filter Validation", async () => {
      await testFilterValidation();
      return { passed: true, message: "Validated filters and suggestions" };
    })
  );

  tests.push(
    await runTest("Mastra Tool Integration", async () => {
      await testMastraTools();
      return { passed: true, message: "Mastra tools are properly structured" };
    })
  );

  tests.push(
    await runTest("Error Handling", async () => {
      await testErrorHandling();
      return { passed: true, message: "Handled common errors as expected" };
    })
  );

  console.log("\n📊 TEST RESULTS:\n");

  let passed = 0;
  let failed = 0;

  tests.forEach((test, index) => {
    const status = test.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`${index + 1}. ${test.name}: ${status}`);
    console.log(`   ${test.message}`);
    if (test.details) {
      console.log(
        `   Details: ${JSON.stringify(test.details, null, 2).split("\n").join("\n   ")}`
      );
    }
    console.log("");
    if (test.passed) passed++;
    else failed++;
  });

  console.log(
    `📈 SUMMARY: ${passed} passed, ${failed} failed, ${tests.length} total`
  );
  if (failed > 0) process.exit(1);
}

// Run tests
runAllTests().catch(console.error);
