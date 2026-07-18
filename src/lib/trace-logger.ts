// DeltaAI Backend Trace Logger
// In-memory trace logger with 20+ categories and SSE broadcasting

export interface TraceEntry {
  id: string;
  timestamp: number;
  category: string;
  icon: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
}

export interface TraceCategory {
  id: string;
  icon: string;
  label: string;
  color: string;
}

export const TRACE_CATEGORIES: TraceCategory[] = [
  { id: 'start', icon: '🚀', label: 'Start', color: '#10b981' },
  { id: 'message', icon: '📨', label: 'Message', color: '#3b82f6' },
  { id: 'llm', icon: '🤖', label: 'LLM', color: '#8b5cf6' },
  { id: 'pdf', icon: '📄', label: 'PDF', color: '#ef4444' },
  { id: 'search', icon: '🔍', label: 'Search', color: '#f59e0b' },
  { id: 'image', icon: '🎨', label: 'Image', color: '#ec4899' },
  { id: 'api', icon: '🌐', label: 'API', color: '#06b6d4' },
  { id: 'db', icon: '💾', label: 'DB', color: '#14b8a6' },
  { id: 'auth', icon: '🔐', label: 'Auth', color: '#f97316' },
  { id: 'stream', icon: '📡', label: 'Stream', color: '#6366f1' },
  { id: 'error', icon: '❌', label: 'Error', color: '#dc2626' },
  { id: 'system', icon: '⚙️', label: 'System', color: '#64748b' },
  { id: 'user', icon: '👤', label: 'User', color: '#22c55e' },
  { id: 'translation', icon: '🌐', label: 'Translation', color: '#0ea5e9' },
  { id: 'islamic', icon: '🕌', label: 'Islamic', color: '#059669' },
  { id: 'cache', icon: '🗃️', label: 'Cache', color: '#a855f7' },
  { id: 'upload', icon: '📤', label: 'Upload', color: '#2563eb' },
  { id: 'download', icon: '📥', label: 'Download', color: '#7c3aed' },
  { id: 'websocket', icon: '🔌', label: 'WebSocket', color: '#0891b2' },
  { id: 'security', icon: '🛡️', label: 'Security', color: '#b91c1c' },
  { id: 'performance', icon: '⚡', label: 'Performance', color: '#ca8a04' },
  { id: 'network', icon: '🌍', label: 'Network', color: '#0d9488' },
];

const MAX_ENTRIES = 200;
let entries: TraceEntry[] = [];
let entryCounter = 0;

// SSE client management
type SSEClient = {
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
};

const sseClients: Set<SSEClient> = new Set();

function getCategoryInfo(categoryId: string): TraceCategory {
  return TRACE_CATEGORIES.find((c) => c.id === categoryId) || TRACE_CATEGORIES[0];
}

function addEntry(category: string, message: string, level: TraceEntry['level'] = 'info'): TraceEntry {
  const cat = getCategoryInfo(category);
  const entry: TraceEntry = {
    id: `trace_${++entryCounter}_${Date.now()}`,
    timestamp: Date.now(),
    category,
    icon: cat.icon,
    message,
    level,
  };

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(-MAX_ENTRIES);
  }

  // Broadcast to SSE clients
  broadcastToSSE(entry);

  return entry;
}

function broadcastToSSE(entry: TraceEntry) {
  const data = JSON.stringify(entry);
  const message = `data: ${data}\n\n`;

  for (const client of sseClients) {
    try {
      client.controller.enqueue(client.encoder.encode(message));
    } catch {
      // Client disconnected, remove
      sseClients.delete(client);
    }
  }
}

// ─── Public API ────────────────────────────────

export function traceStart(message: string) {
  return addEntry('start', message, 'success');
}

export function traceMessage(message: string) {
  return addEntry('message', message, 'info');
}

export function traceLLM(message: string) {
  return addEntry('llm', message, 'info');
}

export function tracePDF(message: string) {
  return addEntry('pdf', message, 'info');
}

export function traceSearch(message: string) {
  return addEntry('search', message, 'info');
}

export function traceImage(message: string) {
  return addEntry('image', message, 'info');
}

export function traceAPI(message: string) {
  return addEntry('api', message, 'info');
}

export function traceDB(message: string) {
  return addEntry('db', message, 'info');
}

export function traceAuth(message: string) {
  return addEntry('auth', message, 'info');
}

export function traceError(message: string) {
  return addEntry('error', message, 'error');
}

export function traceStream(message: string) {
  return addEntry('stream', message, 'info');
}

export function traceSystem(message: string) {
  return addEntry('system', message, 'info');
}

export function traceUser(message: string) {
  return addEntry('user', message, 'info');
}

export function traceTranslation(message: string) {
  return addEntry('translation', message, 'info');
}

export function traceIslamic(message: string) {
  return addEntry('islamic', message, 'info');
}

export function traceCache(message: string) {
  return addEntry('cache', message, 'info');
}

export function traceUpload(message: string) {
  return addEntry('upload', message, 'info');
}

export function traceDownload(message: string) {
  return addEntry('download', message, 'info');
}

export function traceWebSocket(message: string) {
  return addEntry('websocket', message, 'info');
}

export function traceSecurity(message: string) {
  return addEntry('security', message, 'warn');
}

export function tracePerformance(message: string) {
  return addEntry('performance', message, 'warn');
}

export function traceNetwork(message: string) {
  return addEntry('network', message, 'info');
}

// Generic trace with any category
export function trace(category: string, message: string, level: TraceEntry['level'] = 'info') {
  return addEntry(category, message, level);
}

// Get entries for SSE initial history
export function getRecentEntries(count: number = 50): TraceEntry[] {
  return entries.slice(-count);
}

// Clear all entries
export function clearEntries() {
  entries = [];
  entryCounter = 0;
}

// SSE client management
export function addSSEClient(controller: ReadableStreamDefaultController, encoder: TextEncoder): SSEClient {
  const client = { controller, encoder };
  sseClients.add(client);
  return client;
}

export function removeSSEClient(client: SSEClient) {
  sseClients.delete(client);
}

export function getSSEClientCount(): number {
  return sseClients.size;
}
