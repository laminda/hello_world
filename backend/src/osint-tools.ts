/**
 * Compatibility façade. Real tools live in backend/src/tools/methodologies/*
 * — one OSINT methodology per module, independently extendable.
 */
export {
  executeTool,
  listMethodologies,
  listToolCalls,
  listTools,
  logToolCall,
  llmStatus,
  OSINT_TOOLS,
  planNextTool,
} from "./tools/registry.js";
export type { OsintToolMeta as OsintTool, ToolCall, ToolResult } from "./tools/types.js";
