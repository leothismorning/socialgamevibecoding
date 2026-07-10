import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { addDebugLog, clearDebugLogs, getDebugLogs } from './server/debugLog.js';
import { generateWithDeepSeek } from './server/deepseek.js';
import { registerStudyRoutes } from './server/studyRoutes.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const rootDir = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: [path.join(rootDir, '.env.local'), path.join(rootDir, '.env')] });

app.use(express.json({ limit: '10mb' }));

app.use('/api', (req, res, next) => {
  const startedAt = performance.now();
  addDebugLog({
    kind: 'server',
    phase: 'request',
    title: `${req.method} ${req.originalUrl}`,
    detail: {
      bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : [],
      bodySize: req.body ? JSON.stringify(req.body).length : 0,
    },
  });
  res.on('finish', () => {
    addDebugLog({
      kind: res.statusCode >= 400 ? 'error' : 'server',
      phase: res.statusCode >= 400 ? 'error' : 'response',
      title: `${req.method} ${req.originalUrl} -> ${res.statusCode}`,
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
      },
    });
  });
  next();
});

app.get('/api/debug/logs', (_req, res) => {
  res.json({ logs: getDebugLogs() });
});

app.post('/api/debug/clear', (_req, res) => {
  clearDebugLogs();
  res.json({ ok: true });
});

registerStudyRoutes(app);

app.post('/api/ai/generate', async (req, res) => {
  const { prompt, model = 'deepseek-v4-flash' } = req.body ?? {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'A non-empty prompt is required.' });
  }

  try {
    return res.json(await generateWithDeepSeek(prompt, model));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DeepSeek error.';
    return res.status(500).json({ error: message });
  }
});

if (isProduction) {
  app.use(express.static(path.join(rootDir, 'dist')));
  app.get('*', (_req, res) => res.sendFile(path.join(rootDir, 'dist', 'index.html')));
} else {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Vibe.Social running at http://localhost:${port}`);
});
