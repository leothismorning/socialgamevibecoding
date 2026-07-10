
import { SystemLog } from '../types';

let systemLogs: SystemLog[] = [];
const MAX_LOGS = 100;

export function addLog(log: SystemLog) {
  systemLogs.push(log);
  if (systemLogs.length > MAX_LOGS) {
    systemLogs.shift();
  }
}

export function getSystemLogs() {
  return [...systemLogs].reverse();
}

export function createTraceId() {
  return Math.random().toString(36).substring(7);
}
