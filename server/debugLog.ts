export type DebugLogKind = 'server' | 'ai' | 'db' | 'error';

export type DebugLogEntry = {
  id: string;
  kind: DebugLogKind;
  phase: 'request' | 'response' | 'error' | 'info';
  title: string;
  timestamp: string;
  durationMs?: number;
  detail?: Record<string, unknown>;
};

const logs: DebugLogEntry[] = [];
const MAX_LOGS = 250;

export function addDebugLog(entry: Omit<DebugLogEntry, 'id' | 'timestamp'>) {
  logs.unshift({
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  });

  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }
}

export function getDebugLogs() {
  return logs;
}

export function clearDebugLogs() {
  logs.length = 0;
}

export function errorDetail(error: unknown): Record<string, unknown> {
  const err = error as any;
  return {
    name: err?.name,
    message: err?.message || String(error),
    causeName: err?.cause?.name,
    causeMessage: err?.cause?.message,
    causeCode: err?.cause?.code,
    causeErrno: err?.cause?.errno,
    causeSyscall: err?.cause?.syscall,
    causeHostname: err?.cause?.hostname,
  };
}

