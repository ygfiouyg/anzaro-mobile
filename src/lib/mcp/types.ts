export interface MCPToolParameter { type: string; description: string; enum?: string[]; default?: unknown; }
export interface MCPToolSchema { type: "object"; properties: Record<string, MCPToolParameter>; required: string[]; }
export interface MCPToolResult { success: boolean; data?: unknown; error?: string; }
export interface MCPTool { name: string; description: string; parameters: MCPToolSchema; execute: (params: Record<string, unknown>) => Promise<MCPToolResult>; }
export function toGLMFunction(tool: MCPTool) { return { type: "function" as const, function: { name: tool.name, description: tool.description, parameters: tool.parameters } }; }
export function toGLMTools(tools: MCPTool[]) { return tools.map(toGLMFunction); }
