import type { Express, Request, Response } from 'express';
import { runDevelopmentAgent } from './developmentAgent.js';
import {
  completeGalleryGenerationJob,
  deleteGalleryComment,
  endGalleryProject,
  failGalleryGenerationJob,
  finalizeGalleryRoundIfReady,
  getGalleryState,
  joinGallery,
  lockExpiredGalleryRound,
  nextGalleryGenerationJob,
  publishCreatorApp,
  retryGalleryGenerationJob,
  saveCreatorDraft,
  saveGalleryComment,
  startFormalGalleryGame,
  startNextGalleryRound,
  toggleGalleryAppLike,
  toggleGalleryCommentLike,
  type GalleryRole,
} from './galleryDb.js';
import { getAIProvider, setAIProvider, type StudyAIProvider } from './studyDb.js';

function sendError(res: Response, error: unknown) {
  const status = Number((error as any)?.status || 400);
  res.status(status).json({ error: error instanceof Error ? error.message : 'Unknown gallery API error.' });
}

function clientIdFrom(req: Request) {
  return String(req.body?.clientId || req.query.clientId || '').trim();
}

function creatorContext(clientId: string) {
  const state = getGalleryState(clientId);
  if (state.viewer?.role !== 'creator') throw new Error('Choose a Creator identity before opening the Studio.');
  if (state.study.status !== 'preparing') throw new Error('Creator development is locked after the formal game starts.');
  return state;
}

function publicAgentMessage(result: Awaited<ReturnType<typeof runDevelopmentAgent>>) {
  return [result.text, ...result.steps].filter(Boolean).join('\n\n');
}

let automationBusy = false;

export async function processGalleryAutomation() {
  if (automationBusy) return;
  automationBusy = true;
  try {
    lockExpiredGalleryRound();
    let job = nextGalleryGenerationJob();
    while (job) {
      try {
        const selectedComment = String(job.selected_comment || '').trim();
        const result = await runDevelopmentAgent({
          provider: getAIProvider(),
          experimentTitle: String(job.app_title || 'Gallery App'),
          roundNumber: Number(job.round_number),
          brief: String(job.app_brief || ''),
          selectedIdeas: selectedComment
            ? [{ participant_code: String(job.selected_author || ''), content: selectedComment }]
            : [],
          fusionPlan: selectedComment,
          currentCode: String(job.current_code || ''),
          creatorMessage: selectedComment,
          mode: 'round-candidate',
        });
        completeGalleryGenerationJob(Number(job.id), result.code, result.text);
      } catch (error) {
        failGalleryGenerationJob(Number(job.id), error);
      }
      job = nextGalleryGenerationJob();
    }
    finalizeGalleryRoundIfReady();
  } finally {
    automationBusy = false;
  }
}

export function registerGalleryRoutes(app: Express) {
  app.get('/api/gallery/state', (req, res) => {
    void processGalleryAutomation();
    res.json(getGalleryState(clientIdFrom(req)));
  });

  app.post('/api/gallery/join', (req, res) => {
    try {
      res.json(joinGallery(clientIdFrom(req), String(req.body?.role || '') as GalleryRole));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/gallery/ai-provider', (req, res) => {
    try {
      const clientId = clientIdFrom(req);
      const state = creatorContext(clientId);
      if (state.viewer?.code !== 'C01') throw new Error('Only Creator 1 / Host can change the shared AI model.');
      setAIProvider(String(req.body?.provider || '') as StudyAIProvider);
      res.json(getGalleryState(clientId));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/gallery/apps/generate', async (req, res) => {
    try {
      const clientId = clientIdFrom(req);
      creatorContext(clientId);
      const title = String(req.body?.title || '').trim();
      const brief = String(req.body?.brief || '').trim();
      const prompt = String(req.body?.prompt || '').trim();
      if (!title) throw new Error('App title is required.');
      if (!prompt) throw new Error('Describe the App you want the AI to build.');
      const result = await runDevelopmentAgent({
        provider: getAIProvider(),
        experimentTitle: title,
        brief,
        creatorPrompt: prompt,
        creatorMessage: prompt,
        mode: 'initial-project',
      });
      res.json(saveCreatorDraft({
        clientId,
        title,
        brief,
        creatorPrompt: prompt,
        code: result.code,
        summary: result.text,
        creatorMessage: prompt,
        assistantMessage: publicAgentMessage(result),
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/gallery/apps/upload', (req, res) => {
    try {
      const clientId = clientIdFrom(req);
      creatorContext(clientId);
      const code = String(req.body?.code || '').trim();
      if (!/<html[\s>]/i.test(code) || !/<\/html>/i.test(code)) {
        throw new Error('Upload a complete HTML document containing <html> and </html>.');
      }
      res.json(saveCreatorDraft({
        clientId,
        title: String(req.body?.title || '').trim(),
        brief: String(req.body?.brief || '').trim(),
        creatorPrompt: String(req.body?.prompt || '').trim(),
        code,
        summary: 'Creator uploaded a complete HTML App.',
        creatorMessage: 'Uploaded a complete HTML App.',
        assistantMessage: 'The uploaded App is ready to preview and publish.',
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/gallery/apps/refine', async (req, res) => {
    try {
      const clientId = clientIdFrom(req);
      const state = creatorContext(clientId);
      const app = state.apps.find((candidate: any) => candidate.creator_code === state.viewer?.code) as any;
      if (!app?.draft_code) throw new Error('Generate or upload an App before asking for a revision.');
      const message = String(req.body?.message || '').trim();
      if (!message) throw new Error('Describe what the AI should change.');
      const conversation = (state.developmentMessages as any[])
        .slice(-8)
        .map((item) => `${item.role}: ${item.content}`)
        .join('\n');
      const result = await runDevelopmentAgent({
        provider: getAIProvider(),
        experimentTitle: String(app.title),
        brief: String(app.brief || ''),
        creatorPrompt: String(app.creator_prompt || ''),
        currentCode: String(app.draft_code),
        creatorMessage: message,
        recentConversation: conversation,
        mode: 'debug',
      });
      res.json(saveCreatorDraft({
        clientId,
        title: String(app.title),
        brief: String(app.brief || ''),
        creatorPrompt: String(app.creator_prompt || ''),
        code: result.code,
        summary: result.text,
        creatorMessage: message,
        assistantMessage: publicAgentMessage(result),
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/gallery/apps/publish', (req, res) => {
    try {
      res.json(publishCreatorApp(clientIdFrom(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/gallery/start', (req, res) => {
    try {
      res.json(startFormalGalleryGame(clientIdFrom(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/gallery/next-round', (req, res) => {
    try {
      res.json(startNextGalleryRound(clientIdFrom(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/gallery/comments', (req, res) => {
    try {
      res.json(saveGalleryComment(clientIdFrom(req), String(req.body?.appId || ''), String(req.body?.content || '')));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/gallery/comments', (req, res) => {
    try {
      res.json(deleteGalleryComment(clientIdFrom(req), String(req.body?.appId || '')));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/gallery/comments/:commentId/like', (req, res) => {
    try {
      res.json(toggleGalleryCommentLike(clientIdFrom(req), Number(req.params.commentId)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/gallery/apps/:appId/like', (req, res) => {
    try {
      const stage = String(req.body?.stage || 'showcase') as 'showcase' | 'final';
      if (stage !== 'showcase' && stage !== 'final') throw new Error('Unknown like stage.');
      res.json(toggleGalleryAppLike(clientIdFrom(req), String(req.params.appId), stage));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/gallery/jobs/:jobId/retry', (req, res) => {
    try {
      const state = retryGalleryGenerationJob(clientIdFrom(req), Number(req.params.jobId));
      void processGalleryAutomation();
      res.json(state);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/gallery/end', (req, res) => {
    try {
      res.json(endGalleryProject(clientIdFrom(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  const timer = setInterval(() => void processGalleryAutomation(), 2_000);
  timer.unref();
}
