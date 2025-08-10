import { RetrievalError, RetrievalErrorCode } from "./types.js";
import type { RetrievalFilters, RetrievedChunk } from "./types.js";
import { retrieve, getAvailableFields } from "./retrieve.js";

export interface FallbackOptions {
  enableFilterRelaxation?: boolean;
  enableQueryExpansion?: boolean;
  maxRetries?: number;
}

/**
 * Retrieve with automatic fallback strategies
 */
export async function retrieveWithFallback(
  query: string,
  filters?: RetrievalFilters,
  options: FallbackOptions = {}
): Promise<{
  chunks: RetrievedChunk[];
  fallbackUsed: boolean;
  fallbackStrategy?: string;
  originalError?: RetrievalError;
}> {
  const {
    enableFilterRelaxation = true,
    enableQueryExpansion = false,
    maxRetries = 3
  } = options;
  
  try {
    // Try original query first
    const chunks = await retrieve(query, filters);
    return {
      chunks,
      fallbackUsed: false,
    };
  } catch (error) {
    if (!(error instanceof RetrievalError)) {
      throw error;
    }
    
    console.log(`⚠️  Primary retrieval failed: ${error.message}`);
    
    // Strategy 1: Filter relaxation
    if (error.code === RetrievalErrorCode.EmptyResults && enableFilterRelaxation && filters) {
      console.log('🔄 Attempting filter relaxation...');
      
      const relaxationStrategies = [
        // Remove date filters first
        () => ({ ...filters, dateAfter: undefined, dateBefore: undefined }),
        // Remove section filters
        () => ({ ...filters, section: undefined }),
        // Remove source filters
        () => ({ ...filters, source: undefined }),
        // Remove all filters
        () => undefined,
      ];
      
      for (const [index, strategy] of relaxationStrategies.entries()) {
        try {
          const relaxedFilters = strategy();
          const chunks = await retrieve(query, relaxedFilters);
          
          const strategyName = [
            'removed date filters',
            'removed section filters', 
            'removed source filters',
            'removed all filters'
          ][index];
          
          console.log(`✅ Fallback successful: ${strategyName}`);
          
          return {
            chunks,
            fallbackUsed: true,
            fallbackStrategy: strategyName,
            originalError: error,
          };
        } catch (fallbackError) {
          // Continue to next strategy
          continue;
        }
      }
    }
    
    // Strategy 2: Query expansion (simple keyword extraction)
    if (error.code === RetrievalErrorCode.EmptyResults && enableQueryExpansion) {
      console.log('🔄 Attempting query expansion...');
      
      const expandedQueries = expandQuery(query);
      
      for (const expandedQuery of expandedQueries) {
        try {
          const chunks = await retrieve(expandedQuery, filters);
          
          console.log(`✅ Fallback successful: expanded query to "${expandedQuery}"`);
          
          return {
            chunks,
            fallbackUsed: true,
            fallbackStrategy: `expanded query to "${expandedQuery}"`,
            originalError: error,
          };
        } catch (fallbackError) {
          // Continue to next expanded query
          continue;
        }
      }
    }
    
    // All fallback strategies failed
    throw error;
  }
}

/**
 * Simple query expansion strategies
 */
function expandQuery(query: string): string[] {
  const expansions: string[] = [];
  
  // Extract key terms (simple approach)
  const words = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3);
  
  // Try individual important words
  const importantWords = words.filter(word => 
    !['what', 'when', 'where', 'how', 'why', 'the', 'and', 'or', 'but', 'for', 'with'].includes(word)
  );
  
  for (const word of importantWords.slice(0, 3)) {
    expansions.push(word);
  }
  
  // Try pairs of words
  for (let i = 0; i < Math.min(2, importantWords.length - 1); i++) {
    expansions.push(`${importantWords[i]} ${importantWords[i + 1]}`);
  }
  
  return expansions;
}

/**
 * Validate filters and provide helpful error messages
 */
export async function validateFilters(
  filters: RetrievalFilters,
  tableName: string = 'chunks'
): Promise<{
  valid: boolean;
  errors: string[];
  suggestions: string[];
}> {
  const errors: string[] = [];
  const suggestions: string[] = [];
  
  if (!filters) {
    return { valid: true, errors: [], suggestions: [] };
  }
  
  try {
    const availableFields = await getAvailableFields(tableName);
    
    // Validate date formats
    if (filters.dateAfter && !isValidDate(filters.dateAfter)) {
      errors.push('dateAfter must be a valid ISO date string (YYYY-MM-DD)');
      suggestions.push('Use format: 2024-01-01');
    }
    
    if (filters.dateBefore && !isValidDate(filters.dateBefore)) {
      errors.push('dateBefore must be a valid ISO date string (YYYY-MM-DD)');
      suggestions.push('Use format: 2024-12-31');
    }
    
    // Validate date range
    if (filters.dateAfter && filters.dateBefore && filters.dateAfter > filters.dateBefore) {
      errors.push('dateAfter cannot be later than dateBefore');
      suggestions.push('Check your date range');
    }
    
    // Validate array fields are not empty
    if (filters.section && filters.section.length === 0) {
      errors.push('section filter cannot be empty array');
      suggestions.push('Remove section filter or provide valid section names');
    }
    
    if (filters.docId && filters.docId.length === 0) {
      errors.push('docId filter cannot be empty array');
      suggestions.push('Remove docId filter or provide valid document IDs');
    }
    
    if (filters.source && filters.source.length === 0) {
      errors.push('source filter cannot be empty array');
      suggestions.push('Remove source filter or provide valid source names');
    }
    
    // Provide available fields if validation fails
    if (errors.length > 0) {
      suggestions.push(`Available filter fields: ${availableFields.join(', ')}`);
    }
    
  } catch (error) {
    errors.push('Could not validate filters against table schema');
    suggestions.push('Check that the table exists and is accessible');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    suggestions,
  };
}

/**
 * Check if a string is a valid ISO date
 */
function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && Boolean(dateString.match(/^\d{4}-\d{2}-\d{2}/));
}

/**
 * Generate helpful error message with suggestions
 */
export function formatRetrievalError(error: RetrievalError): string {
  let message = `❌ ${error.message}`;
  
  if (error.suggestions && error.suggestions.length > 0) {
    message += '\n\n💡 Suggestions:';
    error.suggestions.forEach(suggestion => {
      message += `\n   • ${suggestion}`;
    });
  }
  
  return message;
}