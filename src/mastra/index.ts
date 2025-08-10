
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';

// Import existing weather components (will be replaced with RAG components)
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';

// Import RAG components
// TODO: Fix ingest-workflow.ts to match current Mastra API
// import { ingestWorkflow } from './workflows/ingest-workflow.js';
// TODO: Import additional RAG components when implemented
// import { ragAgent } from './agents/rag-agent';
// import { retrieveWorkflow } from './workflows/retrieve-workflow';

export const mastra = new Mastra({
  workflows: { 
    weatherWorkflow,
    // TODO: Add ingestWorkflow when API is fixed
    // ingestWorkflow,
    // TODO: Add additional RAG workflows
    // retrieveWorkflow,
  },
  agents: { 
    weatherAgent,
    // TODO: Add RAG agent
    // ragAgent,
  },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra RAG Template',
    level: 'info',
  }),
});
