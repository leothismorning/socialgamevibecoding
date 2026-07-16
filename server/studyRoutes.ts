import type { Express, Request, Response } from 'express';
import {
  addComment,
  addDevelopmentMessage,
  abortExperiment,
  createExperiment,
  deleteComment,
  filterStudyStateForViewer,
  getAIProvider,
  getStudyState,
  investCoins,
  joinStudy,
  leaveStudy,
  rollbackPhase,
  rollbackDevelopmentDraft,
  publishDevelopmentDraft,
  saveDevelopmentDraft,
  saveFusionPlan,
  selectParticipantNumber,
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
import { runDevelopmentAgent } from './developmentAgent.js';

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
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; color: #0f172a; background: #ffffff; }
    main { width: min(720px, calc(100% - 32px)); margin: 0 auto; padding: 64px 0; }
    h1 { margin: 0; font-size: clamp(2rem, 7vw, 4rem); line-height: 1.1; }
    p { margin: 20px 0 0; color: #475569; font-size: 1.05rem; line-height: 1.7; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    ${brief ? `<p>${brief}</p>` : ''}
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
      const { title = 'Untitled Project', brief = '', creatorName = 'Creator', initialPrompt = '', initialCode = '', maxRounds = 4 } =
        req.body ?? {};

      let code = String(initialCode || '').trim();
      let prompt = String(initialPrompt || '').trim();

      if (!code && prompt) {
        const provider = getAIProvider();
        const basePrompt = `Create one complete self-contained HTML document for the project described below.
Project title: ${title}
Project brief: ${brief}
Creator request: ${prompt}

Treat the project title, brief, and Creator request as the complete product requirements.
Do not add features, themes, text, branding, games, AI controls, editing controls, or interactions that are not explicitly requested.
When a detail is not supplied, choose the smallest neutral implementation rather than inventing content or product claims.
Only add the HTML structure, CSS, JavaScript, responsiveness, and accessibility behavior technically necessary to implement the supplied requirements.`;
        const generated = provider === 'glm'
          ? await runDevelopmentAgent({
            provider,
            experimentTitle: String(title),
            brief: String(brief),
            creatorPrompt: prompt,
            mode: 'initial-project',
          })
          : await generateWithAI(provider, basePrompt);
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
      const joined = joinStudy(String(req.body?.clientId || ''));
      sendState(res, joined, { role: 'participant', participantCode: joined.viewerParticipantCode });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/leave', (req, res) => {
    try {
      sendState(res, leaveStudy(String(req.body?.clientId || '')));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/study/participant-number', (req, res) => {
    try {
      const selected = selectParticipantNumber(
        String(req.body?.clientId || ''),
        String(req.body?.participantCode || ''),
      );
      sendState(res, selected, { role: 'participant', participantCode: selected.viewerParticipantCode });
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

      const ideaList = selectedIdeas
        .map((idea) => `${idea.selection_rank}. ${idea.content}`)
        .join('\n');
      const prompt = `Combine the three automatically selected comments below into one short, fluent development instruction.
Preserve the concrete meaning of all three comments. Use the first-ranked core comment as the main direction and smoothly incorporate the other two comments.
Do not evaluate the comments, give advice, explain your reasoning, add new features, or expand beyond what the comments say.
Do not mention ranks, authors, coins, investors, or the combining process.
Return one concise paragraph only. Do not write or modify HTML yet.

Selected comments:
${ideaList}`;

      const generated = await generateWithAI(getAIProvider(), prompt, {
        systemPrompt:
          'Act only as a concise text combiner. Return JSON with "text" containing one short, fluent paragraph that combines all three comments without evaluation, recommendations, headings, bullet points, reasoning, or invented details, and "code" set to an empty string. Use the same language as the comments. Do not use Markdown fences.',
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

      const provider = getAIProvider();
      const generated = provider === 'glm'
        ? await runDevelopmentAgent({
          provider,
          experimentTitle: state.experiment.title,
          roundNumber: state.experiment.current_round,
          selectedIdeas,
          fusionPlan: state.fusionPlan.content,
          currentCode: currentVersion.code,
          mode: 'round-candidate',
        })
        : await generateWithAI(provider, prompt);
      const agentSteps = (generated as any).steps;
      if (Array.isArray(agentSteps)) {
        for (const step of agentSteps) addDevelopmentMessage('system', step);
      }
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

      const prompt = `Apply the Creator's latest development request to the current candidate and return a new complete self-contained HTML document.
Preserve all three selected ideas and the approved fusion plan. Do not silently remove working features.
Do not add features, themes, text, branding, games, controls, or interactions that are not present in the current candidate, selected ideas, fusion plan, or Creator's latest request.
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

      const provider = getAIProvider();
      const generated = provider === 'glm'
        ? await runDevelopmentAgent({
          provider,
          experimentTitle: state.experiment.title,
          roundNumber: state.experiment.current_round,
          selectedIdeas,
          fusionPlan: state.fusionPlan.content,
          currentCode: state.currentDraft.code,
          creatorMessage,
          recentConversation,
          mode: 'debug',
        })
        : await generateWithAI(provider, prompt, {
          systemPrompt:
            'You are an expert web developer. Follow the supplied project state and Creator request exactly without inventing additional product behavior or visual themes. Return only JSON with "text" containing a concise change summary and "code" containing the full updated self-contained HTML. Never return a partial patch or Markdown fences.',
        });
      const agentSteps = (generated as any).steps;
      if (Array.isArray(agentSteps)) {
        for (const step of agentSteps) addDevelopmentMessage('system', step);
      }
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
