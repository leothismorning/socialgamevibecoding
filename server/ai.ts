import { generateWithDeepSeek } from './deepseek.js';
import { GEMINI_MODEL, generateWithGemini, type GeminiOptions } from './gemini.js';
import { generateWithGLM, GLM_MODEL } from './glm.js';
import { generateWithSuiXiangGPT, SUIXIANG_GPT_MODEL } from './suixiang.js';

export type AIProvider = 'deepseek' | 'deepseek-pro' | 'gemini' | 'glm' | 'gpt5';
export type AIResult = {
  text: string;
  code: string;
  model: string;
  usage: unknown;
};

export type AIOptions = GeminiOptions & {
  apiKey?: string;
};

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  deepseek: 'DeepSeek V4 Flash',
  'deepseek-pro': 'DeepSeek V4 Pro',
  gemini: 'Gemini 2.5 Flash',
  glm: 'GLM-5.2',
  gpt5: 'GPT-5.5 (Sui-Xiang)',
};

export async function generateWithAI(
  provider: AIProvider,
  prompt: string,
  options: AIOptions = {},
): Promise<AIResult> {
  if (provider === 'gemini') return generateWithGemini(prompt, GEMINI_MODEL, options);
  if (provider === 'glm') return generateWithGLM(prompt, GLM_MODEL, options);
  if (provider === 'gpt5') return generateWithSuiXiangGPT(prompt, SUIXIANG_GPT_MODEL, options);
  if (provider === 'deepseek-pro') return generateWithDeepSeek(prompt, 'deepseek-v4-pro', options);
  return generateWithDeepSeek(prompt, 'deepseek-v4-flash', options);
}
