import { generateWithDeepSeek } from './deepseek.js';
import { GEMINI_MODEL, generateWithGemini, type GeminiOptions } from './gemini.js';

export type AIProvider = 'deepseek' | 'gemini';
export type AIResult = {
  text: string;
  code: string;
  model: string;
  usage: unknown;
};

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  deepseek: 'DeepSeek',
  gemini: 'Gemini 2.5 Flash',
};

export async function generateWithAI(
  provider: AIProvider,
  prompt: string,
  options: GeminiOptions = {},
): Promise<AIResult> {
  if (provider === 'gemini') return generateWithGemini(prompt, GEMINI_MODEL, options);
  return generateWithDeepSeek(prompt, 'deepseek-v4-flash', options);
}
