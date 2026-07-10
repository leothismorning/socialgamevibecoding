import { addLog, createTraceId } from './loggerService';
import { SystemLog } from '../types';

let currentModel = 'deepseek-v4-flash';

export const setCustomModel = (model: string) => {
  currentModel = model || 'deepseek-v4-flash';
};

export type AIResponse = { text: string; code: string };

async function requestDeepSeek(prompt: string): Promise<AIResponse> {
  const traceId = createTraceId();
  const startTime = performance.now();
  const currentLog: SystemLog = {
    id: traceId,
    type: 'ai',
    timestamp: Date.now(),
    model: currentModel,
    prompt,
    apiKey: 'SERVER_MANAGED',
    duration: '0',
    result: null,
    status: 'pending',
  };
  addLog(currentLog);

  try {
    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: currentModel }),
    });
    const data = await response.json();
    currentLog.duration = (performance.now() - startTime).toFixed(2);
    if (!response.ok) {
      throw new Error(data?.error || `DeepSeek request failed with HTTP ${response.status}.`);
    }
    currentLog.result = data;
    currentLog.status = 'success';
    return { text: data.text || 'Generation complete.', code: data.code || '' };
  } catch (error) {
    currentLog.duration = (performance.now() - startTime).toFixed(2);
    currentLog.status = 'error';
    currentLog.error = error instanceof Error ? error.message : 'Unknown DeepSeek error.';
    throw error;
  }
}

export function generateCode(prompt: string): Promise<AIResponse> {
  return requestDeepSeek(prompt);
}

export function evolveCode(baseCode: string, evolutionPrompt: string): Promise<AIResponse> {
  return requestDeepSeek(`EXISTING CODE:\n${baseCode}\n\nNEW INSTRUCTIONS / FEEDBACK:\n${evolutionPrompt}\n\nUpdate the existing code and return the full HTML document.`);
}
