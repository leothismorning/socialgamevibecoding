import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  runDevelopmentAgent,
  type DevelopmentAgentInput,
  type DevelopmentAgentProgress,
} from './developmentAgent.js';
import {
  closeAsyncCommunityStudy,
  controlCommunityAppFlows,
  completeCreatorDevelopmentOperation,
  completeCommunityGeneration,
  createSynthesis,
  deleteOwnInitialApp,
  deleteCommunityComment,
  deleteCommunitySynthesis,
  exportCommunityStudy,
  exportCommunityWorkspace,
  enterCommunityDevelopmentStage,
  failCreatorDevelopmentOperation,
  failCommunityGeneration,
  getCommunityGalleryState,
  getCommunityGenerationInput,
  getCommunityPreview,
  getPublishedCommunityVersionDownload,
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
  clearCommunityTestData,
  retryCommunityGeneration,
  retryLatestCommunityGenerations,
  saveCommunityComment,
  saveInitialDraft,
  saveRefinedDraft,
  setCommunityHomeFeedOrder,
  setCommunityTestCreators,
  startCreatorDevelopmentOperation,
  startAsyncCommunityStudy,
  startCommunityGeneration,
  startNewAsyncCommunityStudy,
  startNewAsyncCommunityWorkspace,
  toggleCommunityAppLike,
  toggleCommunityCommentLike,
  toggleCreativeBasket,
  trackCommunityEvent,
  updateCommunityComment,
  updateCommunitySynthesis,
  useCommunityWildcard,
  voteForSynthesis,
  withdrawSynthesisForVote,
  type CommunitySourceType,
} from './communityGalleryDb.js';
import { buildCommunityWorkspaceArchive } from './communityGalleryArchive.js';
import {
  applyPreviewPerformanceGuard,
  type PreviewPerformanceMode,
} from './previewPerformance.js';
import {
  withDevelopmentChannel,
  type DevelopmentChannelQueueSnapshot,
  type DevelopmentChannelStats,
  type DevelopmentChannelProvider,
} from './developmentChannelPool.js';

function sendError(res: Response, error: unknown) {
  const status = Number((error as any)?.status || 400);
  res.status(status).json({
    error: error instanceof Error ? error.message : '异步社区 API 发生未知错误。',
  });
}

function clientIdFrom(req: Request) {
  return String(req.body?.clientId || req.query.clientId || '').trim();
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
      : '正在分析应用目标、用户和关键交互，并制定实现方案。',
  };
}

function queuedKeyProgress(snapshot: DevelopmentChannelQueueSnapshot): DevelopmentAgentProgress {
  return {
    step: 'queue',
    order: 0,
    status: 'pending',
    title: `正在排队等待可用 AI 通道 · 第 ${snapshot.position} 位`,
    detail: `DeepSeek ${snapshot.deepSeekActive}/${snapshot.deepSeekCapacity} 个思考通道正在使用。轮到你后会自动开始，无需重复点击。`,
  };
}

function acquiredKeyProgress(
  snapshot: DevelopmentChannelStats & { provider: DevelopmentChannelProvider },
): DevelopmentAgentProgress {
  return {
    step: 'queue',
    order: 0,
    status: 'completed',
    title: '已获得 DeepSeek 思考通道，正在开始开发',
    detail: '本轮将由 DeepSeek V4 Pro 高思考模式完成，并保留在开发进度记录中。',
  };
}

async function runQueuedDevelopmentAgent(
  input: DevelopmentAgentInput,
  recordQueueProgress: (progress: DevelopmentAgentProgress) => void,
) {
  return withDevelopmentChannel(
    (lease) => runDevelopmentAgent({
      ...input,
      provider: 'deepseek-pro',
      apiKey: lease.apiKey,
    }),
    {
      providerOrder: ['deepseek'],
      onQueued: (snapshot) => recordQueueProgress(queuedKeyProgress(snapshot)),
      onAcquired: (snapshot) => recordQueueProgress(acquiredKeyProgress(snapshot)),
    },
  );
}

async function runCommunityGenerationJob(jobId: number) {
  const input = getCommunityGenerationInput(jobId);
  const result = await runQueuedDevelopmentAgent({
    provider: 'deepseek-pro',
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
    onProgress: (progress) => recordCommunityGenerationProgress(jobId, progress),
    mode: 'round-candidate',
  }, (progress) => recordCommunityGenerationProgress(jobId, progress));
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
      res.json(joinCommunityGallery(
        clientIdFrom(req),
        String(req.body?.account || ''),
        String(req.body?.password || ''),
      ));
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
      const performanceMode = String(req.query.performance || '');
      if (performanceMode && !['interactive', 'thumbnail'].includes(performanceMode)) {
        throw new Error('Invalid preview performance mode.');
      }
      const responseCode = performanceMode
        ? applyPreviewPerformanceGuard(code, performanceMode as PreviewPerformanceMode)
        : code;
      res.setHeader('Cache-Control', 'no-store');
      return res.type('html').send(responseCode);
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.post('/api/community-gallery/apps/generate-initial', async (req, res) => {
    let operationId = '';
    let operationStarted = false;
    try {
      const clientId = clientIdFrom(req);
      const state = getCommunityGalleryState(clientId);
      if (state.viewer?.role !== 'creator') throw new Error('请选择创作者身份。');
      if (state.study.status === 'closed') throw new Error('研究已经结束，不能继续创作初始版本。');
      const title = String(req.body?.title || '').trim();
      const brief = String(req.body?.brief || '').trim();
      const prompt = String(req.body?.prompt || '').trim();
      if (!title || !prompt) throw new Error('请填写应用名称和创作提示。');
      operationId = String(req.body?.operationId || randomUUID()).trim();
      startCreatorDevelopmentOperation(clientId, operationId, 'generate');
      operationStarted = true;
      const result = await runQueuedDevelopmentAgent({
        provider: 'deepseek-pro',
        experimentTitle: title,
        brief,
        creatorPrompt: prompt,
        creatorMessage: prompt,
        mode: 'initial-project',
        onProgress: (progress) => recordCreatorDevelopmentProgress(
          operationId,
          initialCreatorProgress(progress),
        ),
      }, (progress) => recordCreatorDevelopmentProgress(operationId, progress));
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
      res.json(getCommunityGalleryState(clientId));
    } catch (error) {
      if (operationId) {
        failCreatorDevelopmentOperation(operationId, error);
        sendError(res, operationStarted
          ? new Error('AI 开发过程中出现异常，本轮开发失败，请重试。')
          : error);
      } else {
        sendError(res, error);
      }
    }
  });

  app.post('/api/community-gallery/apps/upload-initial', (req, res) => {
    try {
      const code = String(req.body?.code || '');
      if (!/<html|<!doctype/i.test(code)) throw new Error('请上传完整的 HTML 应用。');
      res.json(saveInitialDraft({
        clientId: clientIdFrom(req),
        title: String(req.body?.title || '').trim(),
        brief: String(req.body?.brief || '').trim(),
        prompt: String(req.body?.prompt || '').trim(),
        code,
        summary: '创作者上传的初始版本。',
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/apps/refine', async (req, res) => {
    let operationId = '';
    let operationStarted = false;
    try {
      const clientId = clientIdFrom(req);
      const message = String(req.body?.message || '').trim();
      if (!message) throw new Error('请说明希望怎样修改当前草稿。');
      const context = getCreatorDraftContext(clientId);
      operationId = String(req.body?.operationId || randomUUID()).trim();
      const operationPhase = context.messagePhase as 'initial' | 'community' | 'project';
      startCreatorDevelopmentOperation(clientId, operationId, 'refine', operationPhase);
      operationStarted = true;
      const result = await runQueuedDevelopmentAgent({
        provider: 'deepseek-pro',
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
        mode: context.draft.kind === 'initial' ? 'initial-project' : 'round-candidate',
        onProgress: (progress) => recordCreatorDevelopmentProgress(
          operationId,
          initialCreatorProgress(progress),
        ),
      }, (progress) => recordCreatorDevelopmentProgress(operationId, progress));
      saveRefinedDraft(
        clientId,
        result.code,
        result.text,
        message,
        publicAgentMessage(result),
      );
      completeCreatorDevelopmentOperation(operationId, context.app.id);
      res.json(getCommunityGalleryState(clientId));
    } catch (error) {
      if (operationId) {
        failCreatorDevelopmentOperation(operationId, error);
        sendError(res, operationStarted
          ? new Error('AI 开发过程中出现异常，本轮开发失败，请重试。')
          : error);
      } else {
        sendError(res, error);
      }
    }
  });

  app.post('/api/community-gallery/apps/publish-initial', (req, res) => {
    try {
      res.json(publishInitialVersion(clientIdFrom(req)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/community-gallery/apps/:appId/versions/:versionId/download', (req, res) => {
    try {
      const version = getPublishedCommunityVersionDownload(
        clientIdFrom(req),
        String(req.params.appId),
        Number(req.params.versionId),
      );
      const displayVersion = Math.max(0, Number(version.version_number) - 1);
      const filename = `${version.creator_code}-V${displayVersion}.html`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.type('html').send(version.code);
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.get('/api/community-gallery/study/archive', async (req, res) => {
    try {
      const isTest = String(req.query.isTest || '') === 'true';
      const payload = exportCommunityWorkspace(clientIdFrom(req), isTest);
      const archive = await buildCommunityWorkspaceArchive(
        payload,
        String(req.query.archiveName || ''),
      );
      const suffix = isTest ? 'test' : 'regular';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${archive.archiveName}-${suffix}.zip"`,
      );
      res.setHeader('Content-Length', String(archive.buffer.length));
      res.send(archive.buffer);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/community-gallery/apps/:appId', (req, res) => {
    try {
      res.json(deleteOwnInitialApp(clientIdFrom(req), String(req.params.appId)));
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

  app.post('/api/community-gallery/apps/:appId/versions/:versionId/like', (req, res) => {
    try {
      res.json(toggleCommunityAppLike(
        clientIdFrom(req),
        String(req.params.appId),
        Number(req.params.versionId),
      ));
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
        Array.isArray(req.body?.sources)
          ? req.body.sources.map((source: any) => ({
              type: String(source?.type || '') as 'comment' | 'synthesis',
              id: Number(source?.id),
            }))
          : [],
        String(req.body?.creatorInstruction || ''),
        req.body?.baseVersionId == null ? undefined : Number(req.body.baseVersionId),
      );
      jobId = started.jobId;
      await runCommunityGenerationJob(jobId);
      res.json(getCommunityGalleryState(clientId));
    } catch (error) {
      if (jobId) failCommunityGeneration(jobId, error);
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/apps/:appId/wildcard', (req, res) => {
    try {
      res.json(useCommunityWildcard(
        clientIdFrom(req),
        String(req.params.appId),
        Number(req.body?.commentId),
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

  app.post('/api/community-gallery/apps/flow-control', (req, res) => {
    try {
      res.json(controlCommunityAppFlows(
        clientIdFrom(req),
        Array.isArray(req.body?.appIds) ? req.body.appIds.map(String) : [],
        String(req.body?.action) as 'rollback',
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/apps/retry-development', (req, res) => {
    try {
      const started = retryLatestCommunityGenerations(
        clientIdFrom(req),
        Array.isArray(req.body?.appIds) ? req.body.appIds.map(String) : [],
      );
      res.json(started.state);
      started.jobIds.forEach(runCommunityGenerationInBackground);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/study/start', (req, res) => {
    try {
      res.json(startAsyncCommunityStudy(clientIdFrom(req), Boolean(req.body?.isTest)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/study/enter-development', (req, res) => {
    try {
      const started = enterCommunityDevelopmentStage(
        clientIdFrom(req),
        Number(req.body?.iterationNumber) as 1 | 2,
        Boolean(req.body?.isTest),
        Array.isArray(req.body?.appIds) ? req.body.appIds.map(String) : undefined,
      );
      res.json(started.state);
      started.jobIds.forEach(runCommunityGenerationInBackground);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/study/test-creators', (req, res) => {
    try {
      res.json(setCommunityTestCreators(
        clientIdFrom(req),
        Array.isArray(req.body?.testCreatorCodes)
          ? req.body.testCreatorCodes.map(String)
          : [],
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/study/home-feed-order', (req, res) => {
    try {
      res.json(setCommunityHomeFeedOrder(
        clientIdFrom(req),
        String(req.body?.order || '') as 'asc' | 'desc',
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/study/clear-test-data', (req, res) => {
    try {
      res.json(clearCommunityTestData(
        clientIdFrom(req),
        String(req.body?.confirmation || ''),
      ));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/community-gallery/study/close', (req, res) => {
    try {
      res.json(closeAsyncCommunityStudy(clientIdFrom(req), Boolean(req.body?.isTest)));
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

  app.post('/api/community-gallery/study/new-workspace', (req, res) => {
    try {
      res.json(startNewAsyncCommunityWorkspace(
        clientIdFrom(req),
        Boolean(req.body?.isTest),
      ));
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
