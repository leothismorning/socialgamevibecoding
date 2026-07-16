import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowUp, CircleDollarSign, Clock3, Minus, Trophy } from 'lucide-react';
import type { StudyComment, StudyInvestment, StudyPhase, StudySelectedIdea, StudyState } from '../types';
import { cn } from '../lib/utils';
import { ParticipantAvatar } from './ParticipantRoster';

type Role = 'creator' | 'participant';

const RANKING_INTERVAL_MS = 30_000;
const INVESTMENT_LEVELS = [0, 20, 40, 60, 80, 100] as const;
type InvestmentLevel = (typeof INVESTMENT_LEVELS)[number];
const INVEST_STEP = 20;
const MAX_INVESTMENT: InvestmentLevel = 100;

function normalizeInvestment(value: number): InvestmentLevel {
  return INVESTMENT_LEVELS.includes(value as InvestmentLevel) ? value as InvestmentLevel : 0;
}

function getNextInvestment(current: InvestmentLevel): InvestmentLevel {
  const index = INVESTMENT_LEVELS.indexOf(current);
  return INVESTMENT_LEVELS[(index + 1) % INVESTMENT_LEVELS.length];
}

function investmentTotal(comment: StudyComment) {
  return Math.max(0, Number(comment.invested || 0));
}

function rankIds(comments: StudyComment[], previousIds: number[]) {
  const previousPosition = new Map(previousIds.map((id, index) => [id, index]));
  return [...comments]
    .sort((a, b) =>
      investmentTotal(b) - investmentTotal(a) ||
      (previousPosition.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (previousPosition.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
      a.id - b.id,
    )
    .map((comment) => comment.id);
}

function InvestmentCycleButton({
  amount,
  disabled,
  insufficient,
  feedbackKey,
  reachedMaximum,
  onInvest,
}: {
  amount: InvestmentLevel;
  disabled: boolean;
  insufficient: boolean;
  feedbackKey: number;
  reachedMaximum: boolean;
  onInvest: () => void;
}) {
  const nextAmount = getNextInvestment(amount);

  return (
    <button
      type="button"
      className={cn(
        'investment-vote-button',
        amount > 0 && 'has-investment',
        amount === MAX_INVESTMENT && 'is-max-investment',
        reachedMaximum && 'just-reached-maximum',
        insufficient && 'is-insufficient',
      )}
      style={{ '--investment-progress': amount / MAX_INVESTMENT } as React.CSSProperties}
      disabled={disabled}
      aria-label={
        insufficient
          ? `当前已投资 ${amount} 金币，余额不足 20 金币`
          : amount === MAX_INVESTMENT
            ? '当前已投资 100 金币，再次点击清零并返还 100 金币'
            : `当前已投资 ${amount} 金币，点击切换至 ${nextAmount} 金币`
      }
      title={amount === MAX_INVESTMENT ? 'Click again to reset' : undefined}
      onClick={onInvest}
    >
      <span key={`coin-${feedbackKey}`} className={cn('vote-button-icon', feedbackKey > 0 && 'is-clicked')} aria-hidden="true">
        <CircleDollarSign />
      </span>
      <span className="investment-button-label" aria-live="polite">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={amount}
            initial={{ opacity: 0, y: 7, scale: amount === 0 ? 0.82 : 1 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -7, scale: amount === 100 ? 0.78 : 1 }}
            transition={{ duration: 0.19, ease: 'easeOut' }}
          >
            {amount}
          </motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
}

export function LiveCommentLeaderboard({
  role,
  participantCode,
  phase,
  comments,
  investments,
  investmentLocked,
  availableCoins,
  selectedIdeas,
  invest,
  onInvestmentState,
  onInvestmentError,
}: {
  role: Role;
  participantCode: string;
  phase: StudyPhase;
  comments: StudyComment[];
  investments: StudyInvestment[];
  investmentLocked: boolean;
  availableCoins: number;
  selectedIdeas: StudySelectedIdea[];
  invest: (commentId: number, amount: number) => Promise<StudyState>;
  onInvestmentState: (state: StudyState) => void;
  onInvestmentError: (message: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const commentsRef = React.useRef(comments);
  const [orderedIds, setOrderedIds] = React.useState<number[]>(() => rankIds(comments, []));
  const orderedIdsRef = React.useRef(orderedIds);
  const [rankDeltas, setRankDeltas] = React.useState<Map<number, number>>(() => new Map());
  const [secondsUntilUpdate, setSecondsUntilUpdate] = React.useState(
    () => Math.ceil((RANKING_INTERVAL_MS - (Date.now() % RANKING_INTERVAL_MS)) / 1000),
  );
  const rankingBucketRef = React.useRef(Math.floor(Date.now() / RANKING_INTERVAL_MS));
  const [feedbacks, setFeedbacks] = React.useState<Map<number, { label: string; key: number }>>(() => new Map());
  const feedbackTimersRef = React.useRef<Map<number, number>>(new Map());
  const feedbackSequenceRef = React.useRef(0);
  const optimisticAmountsRef = React.useRef<Map<number, InvestmentLevel>>(new Map());
  const [optimisticAmounts, setOptimisticAmounts] = React.useState<Map<number, InvestmentLevel>>(() => new Map());
  const [optimisticCoins, setOptimisticCoins] = React.useState(availableCoins);
  const optimisticCoinsRef = React.useRef(availableCoins);
  const requestQueuesRef = React.useRef<Map<number, Promise<void>>>(new Map());
  const activeRequestCountRef = React.useRef(0);

  React.useEffect(() => {
    commentsRef.current = comments;
    setOrderedIds((current) => {
      const liveIds = new Set(comments.map((comment) => comment.id));
      const synchronized = current.filter((id) => liveIds.has(id));
      comments.forEach((comment) => {
        if (!synchronized.includes(comment.id)) synchronized.push(comment.id);
      });
      const next = synchronized.length === current.length && synchronized.every((id, index) => id === current[index])
        ? current
        : synchronized;
      orderedIdsRef.current = next;
      return next;
    });
  }, [comments]);

  React.useEffect(() => {
    const tick = () => {
      const currentBucket = Math.floor(Date.now() / RANKING_INTERVAL_MS);
      const remaining = Math.ceil((RANKING_INTERVAL_MS - (Date.now() % RANKING_INTERVAL_MS)) / 1000);
      setSecondsUntilUpdate(Math.max(1, remaining));
      if (currentBucket !== rankingBucketRef.current) {
        rankingBucketRef.current = currentBucket;
        const previous = orderedIdsRef.current;
        const previousPosition = new Map<number, number>(previous.map((id, index) => [id, index] as const));
        const next = rankIds(commentsRef.current, previous);
        setRankDeltas(new Map(next.map((id, index) => [id, (previousPosition.get(id) ?? index) - index])));
        orderedIdsRef.current = next;
        setOrderedIds(next);
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => () => {
    feedbackTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    feedbackTimersRef.current.clear();
  }, []);

  React.useEffect(() => {
    if (activeRequestCountRef.current === 0) {
      optimisticCoinsRef.current = availableCoins;
      setOptimisticCoins(availableCoins);
      optimisticAmountsRef.current = new Map();
      setOptimisticAmounts(new Map());
    }
  }, [availableCoins, investments]);

  const commentById = new Map(comments.map((comment) => [comment.id, comment]));
  const orderedComments = orderedIds.map((id) => commentById.get(id)).filter(Boolean) as StudyComment[];
  const investmentCode = role === 'creator' ? 'CREATOR' : participantCode;
  const ownInvestmentByComment = new Map(
    investments
      .filter((investment) => investment.participant_code === investmentCode)
      .map((investment) => [investment.comment_id, investment]),
  );
  const selectionByComment = new Map(selectedIdeas.map((idea) => [idea.comment_id, idea]));
  const canInvest = phase === 'investing' && !investmentLocked;

  const submitInvestment = (commentId: number, authoritativeAmount: InvestmentLevel) => {
    const currentAmount = optimisticAmountsRef.current.get(commentId) ?? authoritativeAmount;
    const nextAmount = getNextInvestment(currentAmount);
    const delta = nextAmount - currentAmount;
    if (delta > optimisticCoinsRef.current) {
      onInvestmentError('剩余金币不足 20，无法继续增加投资。');
      return;
    }

    optimisticAmountsRef.current = new Map(optimisticAmountsRef.current).set(commentId, nextAmount);
    setOptimisticAmounts(new Map(optimisticAmountsRef.current));
    optimisticCoinsRef.current -= delta;
    setOptimisticCoins(optimisticCoinsRef.current);
    feedbackSequenceRef.current += 1;
    const feedback = { label: nextAmount === 0 ? '已清零' : '+20', key: feedbackSequenceRef.current };
    setFeedbacks((current) => new Map(current).set(commentId, feedback));
    const previousTimer = feedbackTimersRef.current.get(commentId);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    feedbackTimersRef.current.set(commentId, window.setTimeout(() => {
      setFeedbacks((current) => {
        const updated = new Map(current);
        updated.delete(commentId);
        return updated;
      });
      feedbackTimersRef.current.delete(commentId);
    }, 560));

    activeRequestCountRef.current += 1;
    const previousQueue = requestQueuesRef.current.get(commentId) ?? Promise.resolve();
    const nextQueue = previousQueue.then(async () => {
      try {
        const next = await invest(commentId, nextAmount);
        onInvestmentState(next);
      } catch (error) {
        optimisticAmountsRef.current = new Map(optimisticAmountsRef.current).set(commentId, currentAmount);
        setOptimisticAmounts(new Map(optimisticAmountsRef.current));
        optimisticCoinsRef.current += delta;
        setOptimisticCoins(optimisticCoinsRef.current);
        onInvestmentError(error instanceof Error ? error.message : 'Investment failed.');
      } finally {
        activeRequestCountRef.current = Math.max(0, activeRequestCountRef.current - 1);
      }
    });
    requestQueuesRef.current.set(commentId, nextQueue);
    void nextQueue.finally(() => {
      if (requestQueuesRef.current.get(commentId) === nextQueue) requestQueuesRef.current.delete(commentId);
    });
  };

  return (
    <section className="live-comment-board" aria-labelledby="live-comment-board-title">
      <header className="live-comment-board-header">
        <div className="live-comment-board-title">
          <span className="live-comment-board-icon"><Trophy aria-hidden="true" /></span>
          <div>
            <p className="live-comment-board-kicker">LIVE INTERACTION</p>
            <h2 id="live-comment-board-title">实时评论排行榜 · Live Comment Ranking</h2>
          </div>
        </div>
        <div className="live-comment-board-meta">
          <span className="live-coin-balance">剩余金币：<strong>{optimisticCoins}</strong></span>
          <span className="rank-live-indicator">实时更新 · Just now</span>
          <span className="rank-refresh-indicator"><Clock3 aria-hidden="true" /> {secondsUntilUpdate}s · Sorted by invested coins</span>
        </div>
      </header>

      <p className="live-comment-board-rules">
        每次点击追加 20 金币，单条评论最多投入 100 金币；榜单每 30 秒按累计投资金币稳定更新。
      </p>

      <div className="live-comment-list custom-scrollbar-light" aria-live="polite">
        {orderedComments.length === 0 ? (
          <div className="live-comment-empty">
            <Trophy aria-hidden="true" />
            <strong>还没有参赛评论</strong>
            <span>评论提交后会先加入榜单，并在下一个 30 秒节点参与排名。</span>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {orderedComments.map((comment, index) => {
              const ownComment = role === 'participant' && (comment.is_own || comment.participant_code === participantCode);
              const authoritativeInvestment = normalizeInvestment(Number(ownInvestmentByComment.get(comment.id)?.amount || 0));
              const myInvestment = optimisticAmounts.get(comment.id) ?? authoritativeInvestment;
              const insufficient = myInvestment < MAX_INVESTMENT && optimisticCoins < INVEST_STEP;
              const disabled = !canInvest || ownComment;
              const selectedIdea = selectionByComment.get(comment.id);
              const rankDelta = rankDeltas.get(comment.id) ?? 0;
              const feedback = feedbacks.get(comment.id);
              return (
                <motion.article
                  layout="position"
                  key={comment.id}
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 38, mass: 0.72 }}
                  className={cn(
                    'live-comment-row interactive-surface',
                    index < 3 && `is-top-${index + 1}`,
                    ownComment && 'is-own-comment',
                    feedback && 'is-vote-success',
                  )}
                >
                  <div className="interactive-surface-content live-comment-row-content">
                    <div className="live-comment-rank" aria-label={`Rank ${index + 1}`}>
                      <small>RANK</small>
                      <strong>{index + 1}</strong>
                      <span className={cn('live-rank-change', rankDelta > 0 && 'is-up', rankDelta < 0 && 'is-down')}>
                        {rankDelta > 0 ? <ArrowUp /> : rankDelta < 0 ? <ArrowDown /> : <Minus />}
                        {rankDelta === 0 ? '—' : Math.abs(rankDelta)}
                      </span>
                    </div>
                    <span className="live-comment-avatar"><ParticipantAvatar /></span>
                    <div className="live-comment-copy">
                      <div className="live-comment-identity">
                        <strong>{comment.participant_code}</strong>
                        <span>{comment.participant_name || `Participant ${comment.participant_code.replace('P', '')}`}</span>
                        {ownComment && <em>Own idea</em>}
                        {selectedIdea && <em>TOP {selectedIdea.selection_rank}</em>}
                      </div>
                      <p>{comment.content}</p>
                    </div>
                    <div className="live-vote-score" aria-label={`${investmentTotal(comment)} invested coins`}>
                      <strong>{investmentTotal(comment)}</strong>
                      <span>COINS</span>
                    </div>
                    <div className="live-comment-actions">
                      <InvestmentCycleButton
                        amount={myInvestment}
                        disabled={disabled}
                        insufficient={insufficient}
                        feedbackKey={feedback?.key ?? 0}
                        reachedMaximum={Boolean(feedback) && myInvestment === MAX_INVESTMENT}
                        onInvest={() => submitInvestment(comment.id, authoritativeInvestment)}
                      />
                      {ownComment && <small className="own-comment-note">自己的评论不可投票</small>}
                    </div>
                    {feedback && (
                      <span key={feedback.key} className="live-vote-feedback" aria-hidden="true">{feedback.label}</span>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
