export type ClientDebugEntry = {
  id: string;
  source: 'client' | 'server' | 'ai' | 'error';
  phase: 'request' | 'response' | 'error' | 'info';
  title: string;
  timestamp: string;
  durationMs?: number;
  detail?: Record<string, unknown>;
};

type Listener = () => void;

const entries: ClientDebugEntry[] = [];
const listeners = new Set<Listener>();
const MAX_ENTRIES = 250;

function emit() {
  listeners.forEach((listener) => listener());
}

export function addClientDebug(entry: Omit<ClientDebugEntry, 'id' | 'timestamp' | 'source'> & { source?: ClientDebugEntry['source'] }) {
  entries.unshift({
    source: entry.source || 'client',
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  });

  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }
  emit();
}

export function getClientDebugEntries() {
  return entries;
}

export function clearClientDebugEntries() {
  entries.length = 0;
  emit();
}

export function subscribeClientDebug(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function fetchServerDebugLogs(): Promise<ClientDebugEntry[]> {
  const response = await fetch('/api/debug/logs');
  const data = await response.json();
  return (data.logs || []).map((log: any) => ({
    id: log.id,
    source: log.kind === 'ai' ? 'ai' : log.kind === 'error' ? 'error' : 'server',
    phase: log.phase,
    title: log.title,
    timestamp: log.timestamp,
    durationMs: log.durationMs,
    detail: log.detail,
  }));
}

export async function clearServerDebugLogs() {
  await fetch('/api/debug/clear', { method: 'POST' });
}
