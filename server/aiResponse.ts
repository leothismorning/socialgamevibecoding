export function isTextOnlyAIRequest(systemPrompt?: string) {
  return Boolean(systemPrompt?.includes('"code" set to an empty string'));
}

export function normalizeAITextArtifact(
  parsed: unknown,
  textOnlyRequest: boolean,
  fallback = 'Generation complete.',
) {
  const response = parsed as Record<string, unknown> | null;
  if (typeof response?.text === 'string' && response.text.trim()) return response.text;
  if (!textOnlyRequest || !response || typeof response !== 'object' || Array.isArray(response)) {
    return fallback;
  }

  if (response.text != null) {
    return typeof response.text === 'string'
      ? response.text
      : JSON.stringify(response.text);
  }

  const artifact = { ...response };
  if (artifact.code === '') delete artifact.code;
  return Object.keys(artifact).length > 0 ? JSON.stringify(artifact) : fallback;
}
