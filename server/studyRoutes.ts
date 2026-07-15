import type { Express, Request, Response } from 'express';
import {
  addComment,
  abortExperiment,
  createExperiment,
  deleteComment,
  filterStudyStateForViewer,
  getAIProvider,
  getStudyState,
  investCoins,
  joinStudy,
  rollbackPhase,
  rollbackDevelopmentDraft,
  publishDevelopmentDraft,
  saveDevelopmentDraft,
  saveFusionPlan,
  selectTopIdeas,
  setAIProvider,
  setPhase,
  startEndVote,
  startNextRound,
  voteProjectEnd,
  type StudyPhase,
  type StudyAIProvider,
  type StudyViewer,
} from './studyDb.js';
import { generateWithAI } from './ai.js';

function sendError(res: Response, error: unknown) {
  const anyError = error as any;
  const status = anyError?.status || 400;
  res.status(status).json({
    error: error instanceof Error ? error.message : 'Unknown study API error.',
    tiedComments: anyError?.tiedComments,
    rankScores: anyError?.rankScores,
  });
}

function sendState(res: Response, state: ReturnType<typeof getStudyState>, viewer: StudyViewer = {}) {
  res.json(filterStudyStateForViewer(state, viewer));
}

const fallbackHtml = (title: string, brief: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://cdn.tailwindcss.com"></script>
  <title>${title}</title>
</head>
<body class="min-h-screen bg-gradient-to-br from-sky-100 via-white to-violet-100 text-slate-900">
  <main class="min-h-screen grid place-items-center p-10">
    <section class="max-w-3xl rounded-[2rem] bg-white/80 border border-white shadow-2xl shadow-blue-200/50 p-12 text-center">
      <div class="text-6xl mb-6">🏝️</div>
      <h1 class="text-5xl font-black text-blue-950 mb-4">${title}</h1>
      <p class="text-lg text-slate-600 leading-relaxed">${brief || 'A collaborative vibecoding prototype is ready for the first study round.'}</p>
      <button class="mt-10 px-8 py-4 rounded-2xl text-white font-bold bg-gradient-to-r from-blue-500 to-violet-600 shadow-xl shadow-violet-300">Start exploring</button>
    </section>
  </main>
</body>
</html>`;

export function registerStudyRoutes(app: Express) {
  app.get('/api/study/state', (req, res) => {
    const role = req.query.viewerRole === 'creator' || req.query.viewerRole === 'participant'
      ? req.query.viewerRole
      : null;
    sendState(res, getStudyState(), {
      role,
      participantCode: String(req.query.participantCode || ''),
    });
  });

  app.post('/api/study/ai-provider', (req, res) => {
    try {
      const provider = String(req.body?.provider || '') as StudyAIProvider;
      sendState(res, setAIProvider(provider), { role: 'creator' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/study/archive/:experimentId', (req, res) => {
    const state = getStudyState(String(req.params.experimentId || ''));
    if (!state.experiment) {
      res.status(404).json({ error: 'Experiment archive was not found.' });
      return;
    }
    const activeExperimentId = getStudyState().experiment?.id;
    if (
      state.experiment.id === activeExperimentId &&
      state.experiment.phase !== 'ended' &&
      state.experiment.phase !== 'aborted'
    ) {
      res.status(409).json({ error: 'The active experiment is not available through the archive endpoint.' });
      return;
    }
    res.json(state);
  });

  app.post('/api/study/experiment', async (req: Request, res: Response) => {
    try {
      const { title = 'Dream Island', brief = '', creatorName = 'Creator', initialPrompt = '', initialCode = '', maxRounds = 4 } =
        req.body ?? {};

      let code = String(initialCode || '').trim();
      let prompt = String(initialPrompt || '').trim();

      if (!code && prompt) {
        const generated = await generateWithAI(
          getAIProvider(),
          `Create the initial playable web prototype for a CHI user-study collaborative vibecoding experiment.
Project title: ${title}
Project brief: ${brief}
Initial creator prompt: ${prompt}
Make it visually soft, dreamlike, game-like, and self-contained.`,
        );
        code = generated.code;
      }

      if (!code) {
        code = fallbackHtml(String(title), String(brief));
        prompt = prompt || String(brief || title);
      }

      sendState(
        res,
        createExperiment({
          title: String(title),
          brief: String(brief),
          creatorName: String(creatorName),
          initialCode: code,
          initialPrompt: prompt,
          maxRounds: Number(maxRounds),
        }),
        { role: 'creator' },
      );
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/join', (req, res) => {
    try {
      const participantCode = String(req.body?.participantCode || '');
      sendState(res, joinStudy(participantCode), { role: 'participant', participantCode });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/phase', (req, res) => {
    try {
      sendState(res, setPhase(String(req.body?.phase || '') as StudyPhase), { role: 'creator' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/rollback-phase', (_req, res) => {
    try {
      sendState(res, rollbackPhase(), { role: 'creator' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/abort-experiment', (_req, res) => {
    try {
      sendState(res, abortExperiment(), { role: 'creator' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/comments', (req, res) => {
    try {
      const participantCode = String(req.body?.participantCode || '');
      sendState(res, addComment(participantCode, String(req.body?.content || '')), { role: 'participant', participantCode });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/comments/delete', (req, res) => {
    try {
      const participantCode = String(req.body?.participantCode || '');
      sendState(res, deleteComment(participantCode), { role: 'participant', participantCode });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/investments', (req, res) => {
    try {
      const actorType = req.body?.actorType === 'creator' ? 'creator' : 'participant';
      const participantCode = String(req.body?.participantCode || '');
      sendState(
        res,
        investCoins(
          actorType,
          participantCode,
          Number(req.body?.commentId),
          Number(req.body?.amount || 0),
        ),
        { role: actorType, participantCode },
      );
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/select-top-ideas', (req, res) => {
    try {
      const commentIds = Array.isArray(req.body?.commentIds) ? req.body.commentIds.map(Number) : undefined;
      sendState(res, selectTopIdeas(commentIds), { role: 'creator' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/generate-fusion-plan', async (_req, res) => {
    try {
      const state = getStudyState();
      if (!state.experiment) throw new Error('Experiment has not been created yet.');
      const selectedIdeas = state.selectedIdeas.filter(
        (idea) => idea.round_number === state.experiment.current_round,
      );
      if (selectedIdeas.length !== 3) throw new Error('Three ranked ideas are required before generating a fusion plan.');

      const currentVersion =
        state.versions.find((version) => version.id === state.experiment.current_version_id) || state.versions.at(-1);
      if (!currentVersion) throw new Error('No current version exists.');

      const ideaList = selectedIdeas
        .map(
          (idea) =>
            `${idea.selection_rank}. ${idea.selection_role === 'core' ? 'CORE IDEA' : 'SUPPORTING IDEA'} by ${idea.participant_code} (${idea.invested} coins, ${idea.investor_count} investors): ${idea.content}`,
        )
        .join('\n');
      const prompt = `Create an implementation fusion plan for the three automatically selected ideas below.
The creator is not allowed to edit, reorder, replace, or omit these ideas.
The core idea sets the main direction. Both supporting ideas must produce visible, testable changes unless technically impossible.
Identify conflicts and resolve them by preserving the core idea while incorporating the intent of each supporting idea.
Do not write or modify HTML yet. Keep the plan concrete and concise.

Experiment: ${state.experiment.title}
Round: ${state.experiment.current_round}
Current prototype summary/source length: ${currentVersion.code.length} characters

Selected ideas:
${ideaList}`;

      const generated = await generateWithAI(getAIProvider(), prompt, {
        systemPrompt:
          'You plan collaborative web-prototype changes for a controlled CHI study. Return only JSON with "text" containing a structured fusion plan and "code" set to an empty string. Do not use Markdown fences. Use the same language as the participant ideas.',
        maxTokens: 2048,
      });
      sendState(res, saveFusionPlan(generated.text), { role: 'creator' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/development/initial', async (_req, res) => {
    try {
      const state = getStudyState();
      if (!state.experiment) throw new Error('Experiment has not been created yet.');
      const selectedIdeas = state.selectedIdeas.filter(
        (idea) => idea.round_number === state.experiment.current_round,
      );
      if (selectedIdeas.length !== 3) throw new Error('Three ranked ideas are required for development.');
      if (!state.fusionPlan?.content) throw new Error('Generate the fusion plan before development.');
      const currentVersion = state.versions.find((version) => version.id === state.experiment.current_version_id) || state.versions.at(-1);
      if (!currentVersion) {
        throw new Error('No current version exists.');
      }

      const ideaList = selectedIdeas
        .map(
          (idea) =>
            `${idea.selection_rank}. ${idea.selection_role === 'core' ? 'CORE' : 'SUPPORTING'} — ${idea.participant_code}: ${idea.content}`,
        )
        .join('\n');
      const prompt = `Create the first visible candidate version of this self-contained HTML prototype according to all three automatically selected ideas and the approved fusion plan.
Keep the output as one complete HTML document.
The core idea controls the main direction. Implement both supporting ideas as visible, testable contributions.
Do not silently omit an idea. Preserve existing working functionality unless the fusion plan explicitly replaces it.
This is a candidate draft, not an official release. Provide a concise summary of what was implemented so participants can follow the development process.

Experiment: ${state.experiment.title}
Round: ${state.experiment.current_round}

Selected ideas:
${ideaList}

Fusion plan:
${state.fusionPlan.content}

Existing HTML:
${currentVersion.code}`;

      const generated = await generateWithAI(getAIProvider(), prompt);
      sendState(res, saveDevelopmentDraft({ code: generated.code, summary: generated.text }), { role: 'creator' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/development/debug', async (req, res) => {
    try {
      const creatorMessage = String(req.body?.message || '').trim();
      if (!creatorMessage) throw new Error('Enter a development message for the selected AI model.');
      const state = getStudyState();
      if (!state.experiment || !state.currentDraft) throw new Error('Generate the initial candidate before debugging.');
      if (!state.fusionPlan?.content) throw new Error('The fusion plan is missing.');

      const selectedIdeas = state.selectedIdeas.filter(
        (idea) => idea.round_number === state.experiment.current_round,
      );
      if (selectedIdeas.length !== 3) throw new Error('Three ranked ideas are required for development.');
      const ideaList = selectedIdeas
        .map(
          (idea) =>
            `${idea.selection_rank}. ${idea.selection_role === 'core' ? 'CORE' : 'SUPPORTING'} — ${idea.participant_code}: ${idea.content}`,
        )
        .join('\n');
      const recentConversation = state.developmentMessages
        .filter((message) => message.round_number === state.experiment.current_round)
        .slice(-20)
        .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
        .join('\n');

      const prompt = `Continue an AI Studio-style debugging conversation for the current candidate web prototype.
Apply the creator's latest request to the current candidate and return a new complete self-contained HTML document.
Preserve all three selected ideas and the approved fusion plan. Do not silently remove working features.
The response summary must clearly state what changed so participants can follow the live debugging process.

Experiment: ${state.experiment.title}
Round: ${state.experiment.current_round}

Selected ideas:
${ideaList}

Approved fusion plan:
${state.fusionPlan.content}

Recent transparent development conversation:
${recentConversation || 'No previous debugging messages.'}

Creator's latest message:
${creatorMessage}

Current candidate HTML (Draft ${state.currentDraft.attempt_number}):
${state.currentDraft.code}`;

      const generated = await generateWithAI(getAIProvider(), prompt, {
        systemPrompt:
          'You are an AI Studio-style web development partner. Return only JSON with "text" containing a concise public change summary and "code" containing the full updated self-contained HTML. Never return a partial patch or Markdown fences.',
      });
      sendState(
        res,
        saveDevelopmentDraft({
          code: generated.code,
          summary: generated.text,
          creatorMessage,
        }),
        { role: 'creator' },
      );
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/development/rollback', (_req, res) => {
    try {
      sendState(res, rollbackDevelopmentDraft(), { role: 'creator' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/development/publish', (_req, res) => {
    try {
      sendState(res, publishDevelopmentDraft(), { role: 'creator' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/next-round', (_req, res) => {
    try {
      sendState(res, startNextRound(), { role: 'creator' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/start-end-vote', (_req, res) => {
    try {
      sendState(res, startEndVote(), { role: 'creator' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/end-vote', (req, res) => {
    try {
      const participantCode = String(req.body?.participantCode || '');
      sendState(res, voteProjectEnd(participantCode, Boolean(req.body?.vote)), { role: 'participant', participantCode });
    } catch (error) {
      sendError(res, error);
    }
  });
}
