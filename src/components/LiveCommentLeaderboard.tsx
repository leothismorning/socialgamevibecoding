import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, CircleDollarSign, Clock3, Trophy } from 'lucide-react';
import type { StudyComment, StudyInvestment, StudyPhase, StudySelectedIdea, StudyState } from '../types';
import { cn } from '../lib/utils';
import { ParticipantAvatar } from './ParticipantRoster';

type Role = 'creator' | 'participant';

const RANKING_INTERVAL_MS = 30_000;
const VOTE_COST = 20;
const HOLD_DURATION_MS = 720;

function voteCount(comment: StudyComment) {
  return Math.max(0, Number(comment.investor_count || 0));
}

function rankIds(comments: StudyComment[], previousIds: number[]) {
  const previousPosition = new Map(previousIds.map((id, index) => [id, index]));
  return [...comments]
    .sort((a, b) =>
      voteCount(b) - voteCount(a) ||
      (previousPosition.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (previousPosition.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
      a.id - b.id,
    )
    .map((comment) => comment.id);
}

function HoldToWithdrawButton({
  voted,
  disabled,
  pending,
  insufficient,
  onVote,
  onWithdraw,
}: {
  voted: boolean;
  disabled: boolean;
  pending: boolean;
  insufficient: boolean;
  onVote: () => void;
  onWithdraw: () => void;
}) {
  const [holding, setHolding] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);
  const firedRef = React.useRef(false);

  const cancelHold = React.useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setHolding(false);
  }, []);

  const startHold = React.useCallback(() => {
    if (!voted || disabled || pending || timerRef.current !== null) return;
    firedRef.current = false;
    setHolding(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      firedRef.current = true;
      setHolding(false);
      onWithdraw();
    }, HOLD_DURATION_MS);
  }, [disabled, onWithdraw, pending, voted]);

  React.useEffect(() => cancelHold, [cancelHold]);

  return (
    <button
      type="button"
      className={cn(
        'investment-vote-button',
        voted && 'is-voted',
        holding && 'is-holding',
        insufficient && 'is-insufficient',
      )}
      disabled={disabled || pending}
      aria-pressed={voted}
      aria-label={
        voted
          ? '已投票，长按撤回投票'
          : insufficient
            ? '剩余金币不足 20，无法投票'
            : '投资 20 金币为这条评论投 1 票'
      }
      title={voted ? '长按 0.72 秒撤回投票' : undefined}
      onPointerDown={(event) => {
        if (voted) {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          startHold();
        }
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onPointerLeave={cancelHold}
      onKeyDown={(event) => {
        if (voted && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          startHold();
        }
      }}
      onKeyUp={(event) => {
        if (voted && (event.key === 'Enter' || event.key === ' ')) cancelHold();
      }}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(event) => {
        if (firedRef.current) {
          firedRef.current = false;
          event.preventDefault();
          return;
        }
        if (!voted) onVote();
      }}
    >
      <span className="vote-button-icon" aria-hidden="true">
        {voted ? <Check /> : <CircleDollarSign />}
      </span>
      <span>{pending ? '处理中' : voted ? '已投票' : insufficient ? '金币不足' : 'Invest'}</span>
      <span className="vote-hold-progress" aria-hidden="true" />
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
  isBusy,
  onRun,
  invest,
}: {
  role: Role;
  participantCode: string;
  phase: StudyPhase;
  comments: StudyComment[];
  investments: StudyInvestment[];
  investmentLocked: boolean;
  availableCoins: number;
  selectedIdeas: StudySelectedIdea[];
  isBusy: boolean;
  onRun: (action: () => Promise<StudyState>) => void;
  invest: (commentId: number, amount: number) => Promise<StudyState>;
}) {
  const reduceMotion = useReducedMotion();
  const commentsRef = React.useRef(comments);
  const [orderedIds, setOrderedIds] = React.useState<number[]>(() => rankIds(comments, []));
  const [secondsUntilUpdate, setSecondsUntilUpdate] = React.useState(
    () => Math.ceil((RANKING_INTERVAL_MS - (Date.now() % RANKING_INTERVAL_MS)) / 1000),
  );
  const rankingBucketRef = React.useRef(Math.floor(Date.now() / RANKING_INTERVAL_MS));
  const [pendingIds, setPendingIds] = React.useState<Set<number>>(() => new Set());
  const [success, setSuccess] = React.useState<{ id: number; label: string; key: number } | null>(null);
  const successTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    commentsRef.current = comments;
    setOrderedIds((current) => {
      const liveIds = new Set(comments.map((comment) => comment.id));
      const synchronized = current.filter((id) => liveIds.has(id));
      comments.forEach((comment) => {
        if (!synchronized.includes(comment.id)) synchronized.push(comment.id);
      });
      return synchronized.length === current.length && synchronized.every((id, index) => id === current[index])
        ? current
        : synchronized;
    });
  }, [comments]);

  React.useEffect(() => {
    const tick = () => {
      const currentBucket = Math.floor(Date.now() / RANKING_INTERVAL_MS);
      const remaining = Math.ceil((RANKING_INTERVAL_MS - (Date.now() % RANKING_INTERVAL_MS)) / 1000);
      setSecondsUntilUpdate(Math.max(1, remaining));
      if (currentBucket !== rankingBucketRef.current) {
        rankingBucketRef.current = currentBucket;
        setOrderedIds((current) => rankIds(commentsRef.current, current));
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => () => {
    if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
  }, []);

  const commentById = new Map(comments.map((comment) => [comment.id, comment]));
  const orderedComments = orderedIds.map((id) => commentById.get(id)).filter(Boolean) as StudyComment[];
  const investmentCode = role === 'creator' ? 'CREATOR' : participantCode;
  const ownInvestmentByComment = new Map(
    investments
      .filter((investment) => investment.participant_code === investmentCode)
      .map((investment) => [investment.comment_id, investment]),
  );
  const selectionByComment = new Map(selectedIdeas.map((idea) => [idea.comment_id, idea]));
  const canVote = phase === 'investing' && !investmentLocked;

  const submitVote = (commentId: number, amount: number) => {
    if (pendingIds.has(commentId)) return;
    setPendingIds((current) => new Set(current).add(commentId));
    onRun(async () => {
      try {
        const next = await invest(commentId, amount);
        setSuccess({ id: commentId, label: amount === 0 ? '已撤回' : '+1', key: Date.now() });
        if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
        successTimerRef.current = window.setTimeout(() => setSuccess(null), 900);
        return next;
      } finally {
        setPendingIds((current) => {
          const updated = new Set(current);
          updated.delete(commentId);
          return updated;
        });
      }
    });
  };

  return (
    <section className="live-comment-board" aria-labelledby="live-comment-board-title">
      <header className="live-comment-board-header">
        <div className="live-comment-board-title">
          <span className="live-comment-board-icon"><Trophy aria-hidden="true" /></span>
          <div>
            <p className="live-comment-board-kicker">LIVE LEADERBOARD</p>
            <h2 id="live-comment-board-title">Comments & investment</h2>
          </div>
        </div>
        <div className="live-comment-board-meta">
          <span className="live-coin-balance">剩余金币：<strong>{availableCoins}</strong></span>
          <span className="rank-refresh-indicator"><Clock3 aria-hidden="true" /> {secondsUntilUpdate}s 后更新排名</span>
        </div>
      </header>

      <p className="live-comment-board-rules">
        用户通过投资为评论投票；每次投资记为 1 票，榜单每 30 秒按票数稳定更新。
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
              const voted = Boolean(ownInvestmentByComment.get(comment.id));
              const pending = pendingIds.has(comment.id);
              const insufficient = !voted && availableCoins < VOTE_COST;
              const disabled = !canVote || ownComment || isBusy || insufficient;
              const selectedIdea = selectionByComment.get(comment.id);
              return (
                <motion.article
                  layout="position"
                  key={comment.id}
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 38, mass: 0.72 }}
                  className={cn(
                    'live-comment-row interactive-surface',
                    index < 3 && `is-top-${index + 1}`,
                    ownComment && 'is-own-comment',
                    success?.id === comment.id && 'is-vote-success',
                  )}
                >
                  <div className="interactive-surface-content live-comment-row-content">
                    <div className="live-comment-rank" aria-label={`Rank ${index + 1}`}>
                      <small>RANK</small>
                      <strong>{index + 1}</strong>
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
                    <div className="live-comment-actions">
                      <div className="live-vote-score" aria-label={`${voteCount(comment)} votes`}>
                        <strong>{voteCount(comment)}</strong>
                        <span>VOTES</span>
                      </div>
                      <HoldToWithdrawButton
                        voted={voted}
                        disabled={disabled}
                        pending={pending}
                        insufficient={insufficient}
                        onVote={() => submitVote(comment.id, VOTE_COST)}
                        onWithdraw={() => submitVote(comment.id, 0)}
                      />
                      {ownComment && <small className="own-comment-note">自己的评论不可投票</small>}
                    </div>
                    {success?.id === comment.id && (
                      <span key={success.key} className="live-vote-feedback" aria-hidden="true">{success.label}</span>
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
