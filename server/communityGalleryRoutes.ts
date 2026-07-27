import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { runDevelopmentAgent } from './developmentAgent.js';
import {
  closeAsyncCommunityStudy,
  completeCreatorDevelopmentOperation,
  completeCommunityGeneration,
  createSynthesis,
  deleteCommunityComment,
  deleteCommunitySynthesis,
  enterCommunityDevelopmentStage,
  exportCommunityStudy,
  failCreatorDevelopmentOperation,
  failCommunityGeneration,
  getCommunityGalleryState,
  getCommunityGenerationInput,
  getCommunityPreview,
  getCreatorDevelopmentProgress,
  getCreatorDraftContext,
  joinCommunityGallery,
  markCommunityNotificationsCelebrated,
  markCommunityNotificationsRead,
  publishCommunityVersion,
  publishInitialVersion,
  publishProjectDraft,
  recordCreatorDevelopmentProgress,
  recordCommunityGenerationProgress,
  retryCommunityGeneration,
  returnToPreviousCommunityStage,
  saveCommunityComment,
  saveInitialDraft,
  saveRefinedDraft,
  setCommunityStudyConditions,
  startCreatorDevelopmentOperation,
  startAsyncCommunityStudy,
  startAutomaticCommunityGeneration,
  startCommunityGeneration,
  startNewAsyncCommunityStudy,
  toggleCommunityAppLike,
  toggleCommunityCommentLike,
  toggleCreativeBasket,
  trackCommunityEvent,
  updateCommunityComment,
  updateCommunitySynthesis,
  uploadControlCommunityDraft,
  voteForSynthesis,
  withdrawSynthesisForVote,
  type CommunitySourceType,
} from './communityGalleryDb.js';
import { getAIProvider, setAIProvider, type StudyAIProvider } from './studyDb.js';

function sendError(res: Response, error: unknown) {
  const status = Number((error as any)?.status || 400);
  res.status(status).json({
    error: error instanceof Error ? error.message : '异步社区 API 发生未知错误。',
  });
}

function clientIdFrom(req: Request) {
  return String(req.body?.clientId || req.query.clientId || '').trim();
}

function apiKeyForCreatorCode(creatorCode: unknown) {
  if (String(creatorCode) === 'C02') return process.env.SUIXIANG_API_KEY_APP2;
  if (String(creatorCode) === 'C03') return process.env.SUIXIANG_API_KEY_APP3;
  return process.env.SUIXIANG_API_KEY;
}

function publicAgentMessage(result: Awaited<ReturnType<typeof runDevelopmentAgent>>) {
  return [result.text, ...result.steps].filter(Boolean).join('\n\n');
}

function initialCreatorProgress(progress: Parameters<typeof recordCreatorDevelopmentProgress>[1]) {
  if (progress.step !== 'plan') return progress;
  return {
    ...progress,
    title: progress.status === 'completed' ? '创作方案已经完成' : 'AI 正在理解你的创作需求',
    detail: progress.status === 'completed'
      ? progress.detail
      : '正在分析 App 目标、用户和关键交互，并制定实现方案。',
  };
}

async function runCommunityGenerationJob(jobId: number) {
  const input = getCommunityGenerationInput(jobId);
  const provider = getAIProvider();
  const result = await runDevelopmentAgent({
    provider,
    experimentTitle: input.job.app_title,
    roundNumber: Number(input.job.iteration_number || 1),
    brief: input.job.app_brief,
    creatorPrompt: input.job.base_prompt,
    selectedIdeas: input.sources.map((source: any) => ({
      participant_code: source.author_code,
      content: source.content,
    })),
    fusionPlan: [
      input.selection.title,
      input.selection.content,
      input.sources
        .filter((source: any) => source.contribution_note)
        .map((source: any) => `${source.author_code}: ${source.contribution_note}`)
        .join('\n'),
    ].filter(Boolean).join('\n\n'),
    currentCode: input.job.base_code,
    creatorMessage: input.job.creator_instruction || input.selection.content,
    apiKey: provider === 'gpt5' ? apiKeyForCreatorCode(input.job.creator_code) : undefined,
    onProgress: (progress) => recordCommunityGenerationProgress(jobId, progress),
    mode: 'round-candidate',
  });
  completeCommunityGeneration(jobId, result.code, result.text);
}

function runCommunityGenerationInBackground(jobId: number) {
  void runCommunityGenerationJob(jobId).catch((error) => {
    failCommunityGeneration(jobId, error);
  });
}

export function registerCommunityGalleryRoutes(app: Express) {
  app.get('/api/community-gallery/state', (req, res) => {
    try {
      res.json(getCommunityGalleryState(clientIdFrom(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/community-gallery/export', (req, res) => {
    try {
      const payload = exportCommunityStudy(clientIdFrom(req));
      res.setHeader('Content-Disposition', `attachment; filename="${payload.study.id}.json"`);
      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/community-gallery/development-progress', (req, res) => {
    try {
      res.json(getCreatorDevelopmentProgress(
        clientIdFrom(req),
        String(req.query.operationId || ''),
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/join', (req, res) => {
    try {
      res.json(joinCommunityGallery(clientIdFrom(req), String(req.body?.code || '')));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/community-gallery/apps/:appId/preview', (req, res) => {
    try {
      const version = String(req.query.version || 'initial') as 'initial' | 'community' | 'draft';
      if (!['initial', 'community', 'draft'].includes(version)) throw new Error('无效的版本类型。');
      const requestedVersionId = req.query.versionId == null
        ? undefined
        : Number(req.query.versionId);
      const code = getCommunityPreview(
        clientIdFrom(req),
        String(req.params.appId),
        version,
        requestedVersionId,
      );
      if (!code) return res.status(404).type('text/plain').send('该版本尚未发布。');
      res.setHeader('Cache-Control', 'no-store');
      return res.type('html').send(code);
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.post('/api/community-gallery/model', (req, res) => {
    try {
      const state = getCommunityGalleryState(clientIdFrom(req));
      if (state.viewer?.role !== 'host') throw new Error('只有 Host 可以选择 AI 模型。');
      if (state.study.status !== 'setup') throw new Error('研究开放后不能更换统一 AI 模型。');
      setAIProvider(String(req.body?.provider || '') as StudyAIProvider);
      res.json(getCommunityGalleryState(clientIdFrom(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/apps/generate-initial', async (req, res) => {
    let operationId = '';
    try {
      const clientId = clientIdFrom(req);
      const state = getCommunityGalleryState(clientId);
      if (state.viewer?.role !== 'creator') throw new Error('请选择 Creator 身份。');
      if (state.study.status !== 'setup') throw new Error('Initial Version 创作阶段已经结束。');
      const title = String(req.body?.title || '').trim();
      const brief = String(req.body?.brief || '').trim();
      const prompt = String(req.body?.prompt || '').trim();
      if (!title || !prompt) throw new Error('请填写 App 名称和创作提示。');
      operationId = String(req.body?.operationId || randomUUID()).trim();
      startCreatorDevelopmentOperation(clientId, operationId, 'generate');
      const provider = getAIProvider();
      const result = await runDevelopmentAgent({
        provider,
        experimentTitle: title,
        brief,
        creatorPrompt: prompt,
        creatorMessage: prompt,
        apiKey: provider === 'gpt5' ? apiKeyForCreatorCode(state.viewer.code) : undefined,
        mode: 'initial-project',
        onProgress: (progress) => recordCreatorDevelopmentProgress(
          operationId,
          initialCreatorProgress(progress),
        ),
      });
      const nextState = saveInitialDraft({
        clientId,
        title,
        brief,
        prompt,
        code: result.code,
        summary: result.text,
        conversation: {
          creator: prompt,
          assistant: publicAgentMessage(result),
        },
      });
      completeCreatorDevelopmentOperation(
        operationId,
        nextState.apps.find((item) => item.creator_code === state.viewer?.code)?.id,
      );
      res.json(nextState);
    } catch (error) {
      if (operationId) failCreatorDevelopmentOperation(operationId, error);
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/apps/upload-initial', (req, res) => {
    try {
      const code = String(req.body?.code || '');
      if (!/<html|<!doctype/i.test(code)) throw new Error('请上传完整的 HTML App。');
      res.json(saveInitialDraft({
        clientId: clientIdFrom(req),
        title: String(req.body?.title || '').trim(),
        brief: String(req.body?.brief || '').trim(),
        prompt: String(req.body?.prompt || '').trim(),
        code,
        summary: 'Creator 上传的 Initial Version。',
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/apps/refine', async (req, res) => {
    let operationId = '';
    try {
      const clientId = clientIdFrom(req);
      const message = String(req.body?.message || '').trim();
      if (!message) throw new Error('请说明希望怎样修改当前草稿。');
      const context = getCreatorDraftContext(clientId);
      if (context.draft.kind !== 'initial' && context.viewer.condition === 'control') {
        throw new Error('对照组需要在原有外部 vibe-coding 工具中继续修改已发布项目。');
      }
      operationId = String(req.body?.operationId || randomUUID()).trim();
      const operationPhase = context.draft.kind === 'initial' ? 'initial' : 'project';
      startCreatorDevelopmentOperation(clientId, operationId, 'refine', operationPhase);
      const provider = getAIProvider();
      const result = await runDevelopmentAgent({
        provider,
        experimentTitle: context.app.title,
        brief: context.app.brief,
        creatorPrompt: context.app.creator_prompt,
        selectedIdeas: context.sources.map((source: any) => ({
          participant_code: source.author_code,
          content: source.content,
        })),
        fusionPlan: context.selection
          ? `${context.selection.title || '入选普通评论'}\n${context.selection.content}`
          : undefined,
        currentCode: context.draft.code,
        creatorMessage: message,
        recentConversation: context.messages
          .map((item: any) => `${item.role}: ${item.content}`)
          .join('\n'),
        apiKey: provider === 'gpt5' ? apiKeyForCreatorCode(context.viewer.code) : undefined,
        mode: context.draft.kind === 'initial' ? 'initial-project' : 'round-candidate',
        onProgress: (progress) => recordCreatorDevelopmentProgress(
          operationId,
          initialCreatorProgress(progress),
        ),
      });
      const nextState = saveRefinedDraft(
        clientId,
        result.code,
        result.text,
        message,
        publicAgentMessage(result),
      );
      completeCreatorDevelopmentOperation(operationId, context.app.id);
      res.json(nextState);
    } catch (error) {
      if (operationId) failCreatorDevelopmentOperation(operationId, error);
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/apps/publish-initial', (req, res) => {
    try {
      res.json(publishInitialVersion(clientIdFrom(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/apps/publish-project', (req, res) => {
    try {
      res.json(publishProjectDraft(clientIdFrom(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/comments', (req, res) => {
    try {
      res.json(saveCommunityComment({
        clientId: clientIdFrom(req),
        appId: String(req.body?.appId || ''),
        content: String(req.body?.content || ''),
        parentCommentId: req.body?.parentCommentId == null
          ? undefined
          : Number(req.body.parentCommentId),
        targetType: req.body?.targetType === 'synthesis' ? 'synthesis' : 'app',
        targetId: req.body?.targetId == null ? undefined : String(req.body.targetId),
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/community-gallery/comments/:commentId', (req, res) => {
    try {
      res.json(deleteCommunityComment(clientIdFrom(req), Number(req.params.commentId)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/community-gallery/comments/:commentId', (req, res) => {
    try {
      res.json(updateCommunityComment(
        clientIdFrom(req),
        Number(req.params.commentId),
        String(req.body?.content || ''),
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/comments/:commentId/like', (req, res) => {
    try {
      res.json(toggleCommunityCommentLike(clientIdFrom(req), Number(req.params.commentId)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/apps/:appId/like', (req, res) => {
    try {
      res.json(toggleCommunityAppLike(clientIdFrom(req), String(req.params.appId)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/basket/toggle', (req, res) => {
    try {
      const sourceType = String(req.body?.sourceType || '') as CommunitySourceType;
      if (!['comment', 'synthesis'].includes(sourceType)) throw new Error('无效的创意素材类型。');
      res.json(toggleCreativeBasket(clientIdFrom(req), sourceType, Number(req.body?.sourceId)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/syntheses', (req, res) => {
    try {
      res.json(createSynthesis({
        clientId: clientIdFrom(req),
        targetAppId: String(req.body?.targetAppId || ''),
        title: String(req.body?.title || ''),
        content: String(req.body?.content || ''),
        sources: Array.isArray(req.body?.sources) ? req.body.sources : [],
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/community-gallery/syntheses/:synthesisId', (req, res) => {
    try {
      res.json(updateCommunitySynthesis(
        clientIdFrom(req),
        Number(req.params.synthesisId),
        String(req.body?.content || ''),
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/community-gallery/syntheses/:synthesisId', (req, res) => {
    try {
      res.json(deleteCommunitySynthesis(
        clientIdFrom(req),
        Number(req.params.synthesisId),
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/syntheses/:synthesisId/withdraw-for-vote', (req, res) => {
    try {
      res.json(withdrawSynthesisForVote(
        clientIdFrom(req),
        Number(req.params.synthesisId),
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/syntheses/:synthesisId/vote', (req, res) => {
    try {
      res.json(voteForSynthesis(
        clientIdFrom(req),
        Number(req.params.synthesisId),
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/apps/:appId/generate-community', async (req, res) => {
    let jobId = 0;
    try {
      const clientId = clientIdFrom(req);
      const started = startCommunityGeneration(
        clientId,
        String(req.params.appId),
        String(req.body?.sourceType || '') as CommunitySourceType,
        Number(req.body?.sourceId),
        String(req.body?.creatorInstruction || ''),
        req.body?.baseVersionId == null ? undefined : Number(req.body.baseVersionId),
        String(req.body?.selectionReason || ''),
      );
      jobId = started.jobId;
      await runCommunityGenerationJob(jobId);
      res.json(getCommunityGalleryState(clientId));
    } catch (error) {
      if (jobId) failCommunityGeneration(jobId, error);
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/apps/:appId/upload-community', (req, res) => {
    try {
      const code = String(req.body?.code || '');
      if (!/<html|<!doctype/i.test(code)) throw new Error('请上传完整的 HTML Community Version。');
      res.json(uploadControlCommunityDraft(
        clientIdFrom(req),
        String(req.params.appId),
        code,
        String(req.body?.summary || 'Creator 使用外部工具开发的 Community Version。'),
        String(req.body?.prompt || ''),
        req.body?.baseVersionId == null ? undefined : Number(req.body.baseVersionId),
        String(req.body?.selectionReason || ''),
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/apps/:appId/publish-community', (req, res) => {
    try {
      res.json(publishCommunityVersion(clientIdFrom(req), String(req.params.appId)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/notifications/read', (req, res) => {
    try {
      res.json(markCommunityNotificationsRead(clientIdFrom(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/notifications/celebrated', (req, res) => {
    try {
      res.json(markCommunityNotificationsCelebrated(
        clientIdFrom(req),
        Array.isArray(req.body?.notificationIds)
          ? req.body.notificationIds.map(Number)
          : [],
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/study/enter-development', (req, res) => {
    try {
      const clientId = clientIdFrom(req);
      const iterationNumber = Number(req.body?.iterationNumber);
      if (iterationNumber !== 1 && iterationNumber !== 2) {
        throw new Error('无效的开发阶段。');
      }
      const existingState = getCommunityGalleryState(clientId);
      if (existingState.viewer?.role !== 'host') throw new Error('只有 Host 可以启动开发。');
      const lockedState = existingState.study.workflow_stage === `development_${iterationNumber}`
        ? existingState
        : enterCommunityDevelopmentStage(
            clientId,
            iterationNumber as 1 | 2,
          );
      const starts = lockedState.stageSelections
        .filter((selection) => Number(selection.iteration_number) === iterationNumber)
        .map((selection) => startAutomaticCommunityGeneration(
          clientId,
          selection.app_id,
          iterationNumber as 1 | 2,
        ));
      res.json(getCommunityGalleryState(clientId));
      starts
        .filter((started) => !started.existing)
        .forEach((started) => runCommunityGenerationInBackground(started.jobId));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/jobs/:jobId/retry', (req, res) => {
    try {
      const clientId = clientIdFrom(req);
      const started = retryCommunityGeneration(clientId, Number(req.params.jobId));
      res.json(started.state);
      runCommunityGenerationInBackground(started.jobId);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/study/return-to-previous-stage', (req, res) => {
    try {
      res.json(returnToPreviousCommunityStage(clientIdFrom(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/study/start', (req, res) => {
    try {
      res.json(startAsyncCommunityStudy(clientIdFrom(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/study/conditions', (req, res) => {
    try {
      res.json(setCommunityStudyConditions(
        clientIdFrom(req),
        Array.isArray(req.body?.controlCreatorCodes)
          ? req.body.controlCreatorCodes.map(String)
          : [],
        Array.isArray(req.body?.controlCommunityCodes)
          ? req.body.controlCommunityCodes.map(String)
          : [],
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/study/close', (req, res) => {
    try {
      res.json(closeAsyncCommunityStudy(clientIdFrom(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/study/new', (req, res) => {
    try {
      res.json(startNewAsyncCommunityStudy(clientIdFrom(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/events', (req, res) => {
    try {
      res.json(trackCommunityEvent(
        clientIdFrom(req),
        String(req.body?.eventType || ''),
        req.body?.entityType == null ? undefined : String(req.body.entityType),
        req.body?.entityId == null ? undefined : String(req.body.entityId),
        req.body?.data && typeof req.body.data === 'object' ? req.body.data : undefined,
      ));
    } catch (error) {
      sendError(res, error);
    }
  });
}
