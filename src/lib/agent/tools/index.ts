import { AgentTool } from '../types';
import { webSearchTool } from './web_search';
import { fetchPageTool } from './fetch_page';
import { readMemoryTool, writeMemoryTool } from './memory';

// Static compiled-in tool registry per PRD §16
export const TOOL_REGISTRY: Record<string, AgentTool> = {
  web_search: webSearchTool,
  fetch_page: fetchPageTool,
  read_memory: readMemoryTool,
  write_memory: writeMemoryTool,
};

export function getAvailableTools(isTainted: boolean): AgentTool[] {
  return Object.values(TOOL_REGISTRY).filter((tool) => {
    // PRD §7.3: Once tainted, write_memory is removed from the tool schema
    if (isTainted && tool.name === 'write_memory') {
      return false;
    }
    return true;
  });
}
