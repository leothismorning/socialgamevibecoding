import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type StudyPhase =
  | 'setup'
  | 'experience'
  | 'commenting'
  | 'investing'
  | 'developing'
  | 'previewing'
  | 'ending_vote'
  | 'ended';

export type StudyState = {
  experiment: any | null;
  participants: any[];
  rounds: any[];
  versions: any[];
  comments: any[];
  investments: any[];
  coinEvents: any[];
  phaseEvents: any[];
  selectedComment: any | null;
  selectedIdeas: any[];
  fusionPlan: any | null;
  fusionPlans: any[];
  versionSources: any[];
  endVotes: any[];
  developmentSessions: any[];
  developmentDrafts: any[];
  developmentMessages: any[];
  currentDraft: any | null;
  endVoteSummary: {
    eligible: number;
    yes: number;
    no: number;
    pending: number;
    requiredYes: number;
  };
};

const now = () => new Date().toISOString();

const dbPath = process.env.STUDY_DB_PATH
  ? path.resolve(process.env.STUDY_DB_PATH)
  : path.join(process.cwd(), 'data', 'vibecoding-study.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    brief TEXT NOT NULL DEFAULT '',
    creator_name TEXT NOT NULL DEFAULT 'Creator',
    creator_coins INTEGER NOT NULL DEFAULT 200,
    phase TEXT NOT NULL DEFAULT 'setup',
    current_round INTEGER NOT NULL DEFAULT 1,
    max_rounds INTEGER NOT NULL DEFAULT 4,
    selected_comment_id INTEGER,
    current_version_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS participants (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'participant',
    coins INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT,
    last_seen_at TEXT
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    comment_rewarded INTEGER NOT NULL DEFAULT 0,
    budget_allocated_v2 INTEGER NOT NULL DEFAULT 0,
    selected_comment_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(experiment_id, round_number)
  );

  CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    code TEXT NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    source_comment_id INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    participant_code TEXT NOT NULL,
    content TEXT NOT NULL,
    selected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    participant_code TEXT NOT NULL,
    comment_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(experiment_id, round_number, participant_code, comment_id)
  );

  CREATE TABLE IF NOT EXISTS coin_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    participant_code TEXT,
    actor_type TEXT NOT NULL DEFAULT 'participant',
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS phase_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    from_phase TEXT,
    to_phase TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS selected_ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    comment_id INTEGER NOT NULL,
    selection_rank INTEGER NOT NULL,
    selection_role TEXT NOT NULL,
    reward_weight REAL NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(experiment_id, round_number, comment_id),
    UNIQUE(experiment_id, round_number, selection_rank)
  );

  CREATE TABLE IF NOT EXISTS fusion_plans (
    experiment_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    confirmed_at TEXT,
    PRIMARY KEY(experiment_id, round_number)
  );

  CREATE TABLE IF NOT EXISTS version_sources (
    version_id INTEGER NOT NULL,
    comment_id INTEGER NOT NULL,
    selection_rank INTEGER NOT NULL,
    selection_role TEXT NOT NULL,
    PRIMARY KEY(version_id, comment_id)
  );

  CREATE TABLE IF NOT EXISTS end_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    participant_code TEXT NOT NULL,
    vote INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(experiment_id, round_number, participant_code)
  );

  CREATE TABLE IF NOT EXISTS development_sessions (
    experiment_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'debugging',
    current_draft_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT,
    PRIMARY KEY(experiment_id, round_number)
  );

  CREATE TABLE IF NOT EXISTS development_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    attempt_number INTEGER NOT NULL,
    code TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(experiment_id, round_number, attempt_number)
  );

  CREATE TABLE IF NOT EXISTS development_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    draft_id INTEGER,
    created_at TEXT NOT NULL
  );
`);

const investmentColumns = db.prepare(`PRAGMA table_info(investments)`).all() as Array<{ name: string }>;
if (!investmentColumns.some((column) => column.name === 'actor_type')) {
  db.exec(`ALTER TABLE investments ADD COLUMN actor_type TEXT NOT NULL DEFAULT 'participant'`);
}

const roundColumns = db.prepare(`PRAGMA table_info(rounds)`).all() as Array<{ name: string }>;
if (!roundColumns.some((column) => column.name === 'budget_allocated_v2')) {
  db.exec(`ALTER TABLE rounds ADD COLUMN budget_allocated_v2 INTEGER NOT NULL DEFAULT 0`);
}

const experimentColumns = db.prepare(`PRAGMA table_info(experiments)`).all() as Array<{ name: string }>;
if (!experimentColumns.some((column) => column.name === 'end_vote_started_at')) {
  db.exec(`ALTER TABLE experiments ADD COLUMN end_vote_started_at TEXT`);
}
if (!experimentColumns.some((column) => column.name === 'ended_at')) {
  db.exec(`ALTER TABLE experiments ADD COLUMN ended_at TEXT`);
}

const seedParticipants = db.transaction(() => {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO participants (code, name, role, coins)
    VALUES (?, ?, 'participant', 0)
  `);
  for (let i = 1; i <= 20; i += 1) {
    const code = `P${String(i).padStart(2, '0')}`;
    insert.run(code, `Participant ${String(i).padStart(2, '0')}`);
  }
});

seedParticipants();

function activeExperiment() {
  return db.prepare(`SELECT * FROM experiments WHERE id = 'main'`).get() as any | undefined;
}

function ensureRound(experimentId: string, roundNumber: number) {
  db.prepare(`
    INSERT OR IGNORE INTO rounds (experiment_id, round_number, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(experimentId, roundNumber, now(), now());
}

function logPhase(experimentId: string, roundNumber: number, fromPhase: string | null, toPhase: StudyPhase) {
  db.prepare(`
    INSERT INTO phase_events (experiment_id, round_number, from_phase, to_phase, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(experimentId, roundNumber, fromPhase, toPhase, now());
}

function allocateRoundBudgets(experimentId: string, roundNumber: number) {
  const round = db.prepare(`SELECT * FROM rounds WHERE experiment_id = ? AND round_number = ?`).get(experimentId, roundNumber) as any;
  if (round?.budget_allocated_v2) return;

  const joined = db.prepare(`SELECT code, coins FROM participants WHERE joined_at IS NOT NULL`).all() as any[];
  const receivedLastRound = db.prepare(`
    SELECT COALESCE(SUM(i.amount), 0) AS received
    FROM comments c
    JOIN investments i ON i.comment_id = c.id
    WHERE c.experiment_id = ? AND c.round_number = ? AND c.participant_code = ?
  `);
  const coinEvent = db.prepare(`
    INSERT INTO coin_events (experiment_id, round_number, participant_code, actor_type, amount, reason, ref_id, created_at)
    VALUES (?, ?, ?, ?, ?, 'round_budget_reset', ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const participant of joined) {
      const received =
        roundNumber > 1
          ? Number((receivedLastRound.get(experimentId, roundNumber - 1, participant.code) as any)?.received || 0)
          : 0;
      const budget = 100 + received;
      const delta = budget - Number(participant.coins || 0);
      db.prepare(`UPDATE participants SET coins = ? WHERE code = ?`).run(budget, participant.code);
      coinEvent.run(experimentId, roundNumber, participant.code, 'participant', delta, String(received), now());
    }

    const experiment = db.prepare(`SELECT creator_coins FROM experiments WHERE id = ?`).get(experimentId) as any;
    const creatorDelta = 200 - Number(experiment?.creator_coins || 0);
    db.prepare(`UPDATE experiments SET creator_coins = 200, updated_at = ? WHERE id = ?`).run(now(), experimentId);
    coinEvent.run(experimentId, roundNumber, null, 'creator', creatorDelta, 'fixed_200', now());

    db.prepare(`UPDATE rounds SET comment_rewarded = 1, budget_allocated_v2 = 1, updated_at = ? WHERE experiment_id = ? AND round_number = ?`).run(
      now(),
      experimentId,
      roundNumber,
    );
  });

  tx();
}

export function getStudyState(): StudyState {
  const experiment = activeExperiment() || null;
  const participants = db.prepare(`SELECT * FROM participants ORDER BY code ASC`).all();
  if (!experiment) {
    return {
      experiment: null,
      participants,
      rounds: [],
      versions: [],
      comments: [],
      investments: [],
      coinEvents: [],
      phaseEvents: [],
      selectedComment: null,
      selectedIdeas: [],
      fusionPlan: null,
      fusionPlans: [],
      versionSources: [],
      endVotes: [],
      developmentSessions: [],
      developmentDrafts: [],
      developmentMessages: [],
      currentDraft: null,
      endVoteSummary: { eligible: 0, yes: 0, no: 0, pending: 0, requiredYes: 0 },
    };
  }

  const rounds = db.prepare(`SELECT * FROM rounds WHERE experiment_id = ? ORDER BY round_number ASC`).all(experiment.id);
  const versions = db.prepare(`SELECT * FROM versions WHERE experiment_id = ? ORDER BY round_number ASC, id ASC`).all(experiment.id);
  const comments = db
    .prepare(`
      SELECT c.*, p.name AS participant_name, COALESCE(SUM(i.amount), 0) AS invested
      FROM comments c
      LEFT JOIN participants p ON p.code = c.participant_code
      LEFT JOIN investments i ON i.comment_id = c.id
      WHERE c.experiment_id = ?
      GROUP BY c.id
      ORDER BY c.round_number ASC, c.created_at ASC
    `)
    .all(experiment.id);
  const investments = db.prepare(`SELECT * FROM investments WHERE experiment_id = ? ORDER BY created_at ASC`).all(experiment.id);
  const coinEvents = db.prepare(`SELECT * FROM coin_events WHERE experiment_id = ? ORDER BY created_at DESC LIMIT 80`).all(experiment.id);
  const phaseEvents = db.prepare(`SELECT * FROM phase_events WHERE experiment_id = ? ORDER BY created_at DESC LIMIT 80`).all(experiment.id);
  const selectedComment = experiment.selected_comment_id
    ? db.prepare(`SELECT * FROM comments WHERE id = ?`).get(experiment.selected_comment_id)
    : null;
  const selectedIdeas = db
    .prepare(`
      SELECT s.*, c.participant_code, c.content, COALESCE(SUM(i.amount), 0) AS invested,
             COUNT(DISTINCT i.participant_code) AS investor_count
      FROM selected_ideas s
      JOIN comments c ON c.id = s.comment_id
      LEFT JOIN investments i ON i.comment_id = c.id
      WHERE s.experiment_id = ?
      GROUP BY s.id
      ORDER BY s.round_number ASC, s.selection_rank ASC
    `)
    .all(experiment.id);
  const fusionPlan = db
    .prepare(`SELECT * FROM fusion_plans WHERE experiment_id = ? AND round_number = ?`)
    .get(experiment.id, experiment.current_round) || null;
  const fusionPlans = db
    .prepare(`SELECT * FROM fusion_plans WHERE experiment_id = ? ORDER BY round_number ASC`)
    .all(experiment.id);
  const versionSources = db
    .prepare(`
      SELECT vs.*, c.participant_code, c.content
      FROM version_sources vs
      JOIN comments c ON c.id = vs.comment_id
      JOIN versions v ON v.id = vs.version_id
      WHERE v.experiment_id = ?
      ORDER BY vs.version_id ASC, vs.selection_rank ASC
    `)
    .all(experiment.id);
  const endVotes = db
    .prepare(`
      SELECT ev.*, p.name AS participant_name
      FROM end_votes ev
      LEFT JOIN participants p ON p.code = ev.participant_code
      WHERE ev.experiment_id = ? AND ev.round_number = ?
      ORDER BY ev.participant_code ASC
    `)
    .all(experiment.id, experiment.current_round) as any[];
  const developmentSessions = db
    .prepare(`SELECT * FROM development_sessions WHERE experiment_id = ? ORDER BY round_number ASC`)
    .all(experiment.id) as any[];
  const developmentDrafts = db
    .prepare(`SELECT * FROM development_drafts WHERE experiment_id = ? ORDER BY round_number ASC, attempt_number ASC`)
    .all(experiment.id) as any[];
  const developmentMessages = db
    .prepare(`SELECT * FROM development_messages WHERE experiment_id = ? ORDER BY round_number ASC, id ASC`)
    .all(experiment.id) as any[];
  const currentDevelopmentSession = developmentSessions.find(
    (session) => session.round_number === experiment.current_round,
  );
  const currentDraft = currentDevelopmentSession?.current_draft_id
    ? developmentDrafts.find((draft) => draft.id === currentDevelopmentSession.current_draft_id) || null
    : null;
  const eligible = Number(
    (db.prepare(`SELECT COUNT(*) AS count FROM participants WHERE joined_at IS NOT NULL`).get() as any)?.count || 0,
  );
  const yes = endVotes.filter((vote) => Number(vote.vote) === 1).length;
  const no = endVotes.filter((vote) => Number(vote.vote) === 0).length;
  const endVoteSummary = {
    eligible,
    yes,
    no,
    pending: Math.max(0, eligible - yes - no),
    requiredYes: eligible > 0 ? Math.floor(eligible * 0.75) + 1 : 0,
  };

  return {
    experiment,
    participants,
    rounds,
    versions,
    comments,
    investments,
    coinEvents,
    phaseEvents,
    selectedComment,
    selectedIdeas,
    fusionPlan,
    fusionPlans,
    versionSources,
    endVotes,
    endVoteSummary,
    developmentSessions,
    developmentDrafts,
    developmentMessages,
    currentDraft,
  };
}

export function createExperiment(input: {
  title: string;
  brief: string;
  creatorName: string;
  initialCode: string;
  initialPrompt: string;
  maxRounds?: number;
}) {
  const title = input.title.trim() || 'Dream Island';
  const created = now();
  const maxRounds = Math.min(Math.max(Number(input.maxRounds || 4), 3), 4);

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM experiments WHERE id = 'main'`).run();
    db.prepare(`DELETE FROM rounds WHERE experiment_id = 'main'`).run();
    db.prepare(`DELETE FROM versions WHERE experiment_id = 'main'`).run();
    db.prepare(`DELETE FROM comments WHERE experiment_id = 'main'`).run();
    db.prepare(`DELETE FROM investments WHERE experiment_id = 'main'`).run();
    db.prepare(`DELETE FROM coin_events WHERE experiment_id = 'main'`).run();
    db.prepare(`DELETE FROM phase_events WHERE experiment_id = 'main'`).run();
    db.prepare(`DELETE FROM selected_ideas WHERE experiment_id = 'main'`).run();
    db.prepare(`DELETE FROM fusion_plans WHERE experiment_id = 'main'`).run();
    db.prepare(`DELETE FROM end_votes WHERE experiment_id = 'main'`).run();
    db.prepare(`DELETE FROM development_messages WHERE experiment_id = 'main'`).run();
    db.prepare(`DELETE FROM development_drafts WHERE experiment_id = 'main'`).run();
    db.prepare(`DELETE FROM development_sessions WHERE experiment_id = 'main'`).run();
    db.prepare(`DELETE FROM version_sources`).run();
    db.prepare(`UPDATE participants SET coins = 0, joined_at = NULL, last_seen_at = NULL`).run();

    db.prepare(`
      INSERT INTO experiments (id, title, brief, creator_name, creator_coins, phase, current_round, max_rounds, created_at, updated_at)
      VALUES ('main', ?, ?, ?, 0, 'experience', 1, ?, ?, ?)
    `).run(title, input.brief.trim(), input.creatorName.trim() || 'Creator', maxRounds, created, created);

    ensureRound('main', 1);
    const version = db
      .prepare(`
        INSERT INTO versions (experiment_id, round_number, title, code, prompt, created_at)
        VALUES ('main', 1, ?, ?, ?, ?)
      `)
      .run('Initial Version', input.initialCode, input.initialPrompt || input.brief || title, created);

    db.prepare(`UPDATE experiments SET current_version_id = ?, updated_at = ? WHERE id = 'main'`).run(Number(version.lastInsertRowid), created);
    logPhase('main', 1, 'setup', 'experience');
  });

  tx();
  return getStudyState();
}

export function joinStudy(code: string) {
  const participantCode = code.trim().toUpperCase();
  const participant = db.prepare(`SELECT * FROM participants WHERE code = ?`).get(participantCode) as any;
  if (!participant) {
    throw new Error('Participant code must be P01-P20.');
  }

  const joinedAt = participant.joined_at || now();
  db.prepare(`UPDATE participants SET joined_at = ?, last_seen_at = ? WHERE code = ?`).run(joinedAt, now(), participantCode);
  return getStudyState();
}

export function setPhase(toPhase: StudyPhase) {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('Create the experiment before changing phases.');

  const valid: StudyPhase[] = ['setup', 'experience', 'commenting', 'investing', 'developing', 'previewing', 'ending_vote', 'ended'];
  if (!valid.includes(toPhase)) throw new Error('Invalid phase.');

  const fromPhase = experiment.phase;
  if (toPhase === 'investing') {
    allocateRoundBudgets(experiment.id, experiment.current_round);
  }

  db.prepare(`UPDATE experiments SET phase = ?, updated_at = ? WHERE id = ?`).run(toPhase, now(), experiment.id);
  logPhase(experiment.id, experiment.current_round, fromPhase, toPhase);
  return getStudyState();
}

export function addComment(participantCode: string, content: string) {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('Experiment has not been created yet.');
  if (experiment.phase !== 'commenting') throw new Error('Comments are only open during the commenting phase.');

  const cleanCode = participantCode.trim().toUpperCase();
  const participant = db.prepare(`SELECT * FROM participants WHERE code = ? AND joined_at IS NOT NULL`).get(cleanCode);
  if (!participant) throw new Error('Join the study before commenting.');

  const text = content.trim();
  if (!text) throw new Error('Comment cannot be empty.');

  db.prepare(`
    INSERT INTO comments (experiment_id, round_number, participant_code, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(experiment.id, experiment.current_round, cleanCode, text, now());

  return getStudyState();
}

export function investCoins(actorType: 'participant' | 'creator', participantCode: string, commentId: number, amount: number) {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('Experiment has not been created yet.');
  if (experiment.phase !== 'investing') throw new Error('Investments are only open during the investing phase.');

  const isCreator = actorType === 'creator';
  const cleanCode = isCreator ? 'CREATOR' : participantCode.trim().toUpperCase();
  const participant = isCreator
    ? null
    : (db.prepare(`SELECT * FROM participants WHERE code = ? AND joined_at IS NOT NULL`).get(cleanCode) as any);
  if (!isCreator && !participant) throw new Error('Join the study before investing.');

  const comment = db
    .prepare(`SELECT * FROM comments WHERE id = ? AND experiment_id = ? AND round_number = ?`)
    .get(commentId, experiment.id, experiment.current_round) as any;
  if (!comment) throw new Error('Comment does not belong to the current round.');
  if (!isCreator && comment.participant_code === cleanCode) throw new Error('Participants cannot invest in their own comment.');

  const value = Math.max(1, Math.floor(Number(amount)));
  const previous = db
    .prepare(`SELECT * FROM investments WHERE experiment_id = ? AND round_number = ? AND participant_code = ? AND comment_id = ?`)
    .get(experiment.id, experiment.current_round, cleanCode, commentId) as any;
  const delta = value - Number(previous?.amount || 0);
  const availableCoins = isCreator ? Number(experiment.creator_coins) : Number(participant.coins);
  if (delta > availableCoins) throw new Error('Not enough coins.');

  const tx = db.transaction(() => {
    if (previous) {
      db.prepare(`UPDATE investments SET amount = ?, created_at = ? WHERE id = ?`).run(value, now(), previous.id);
    } else {
      db.prepare(`
        INSERT INTO investments (experiment_id, round_number, participant_code, comment_id, amount, created_at, actor_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(experiment.id, experiment.current_round, cleanCode, commentId, value, now(), actorType);
    }
    if (delta !== 0) {
      if (isCreator) {
        db.prepare(`UPDATE experiments SET creator_coins = creator_coins - ?, updated_at = ? WHERE id = ?`).run(
          delta,
          now(),
          experiment.id,
        );
      } else {
        db.prepare(`UPDATE participants SET coins = coins - ? WHERE code = ?`).run(delta, cleanCode);
      }
      db.prepare(`
        INSERT INTO coin_events (experiment_id, round_number, participant_code, actor_type, amount, reason, ref_id, created_at)
        VALUES (?, ?, ?, ?, ?, 'investment', ?, ?)
      `).run(experiment.id, experiment.current_round, isCreator ? null : cleanCode, actorType, -delta, String(commentId), now());
    }
  });

  tx();
  return getStudyState();
}

export function selectTopIdeas(commentIds?: number[]) {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('Experiment has not been created yet.');
  if (experiment.phase !== 'investing') throw new Error('Lock the top ideas after the investing phase opens.');

  const totals = db
    .prepare(`
      SELECT c.*, COALESCE(SUM(i.amount), 0) AS invested,
             COUNT(DISTINCT i.participant_code) AS investor_count
      FROM comments c
      LEFT JOIN investments i ON i.comment_id = c.id
      WHERE c.experiment_id = ? AND c.round_number = ?
      GROUP BY c.id
      ORDER BY invested DESC, c.created_at ASC, c.id ASC
    `)
    .all(experiment.id, experiment.current_round) as any[];

  if (totals.length < 3) throw new Error('At least three ideas are required before the voting result can be locked.');
  const rankScores = totals.slice(0, 3).map((comment) => Number(comment.invested || 0));
  const relevantScores = new Set(rankScores);
  const tieComments = totals.filter((comment) => relevantScores.has(Number(comment.invested || 0)));
  const hasRelevantTie = [...relevantScores].some(
    (score) => totals.filter((comment) => Number(comment.invested || 0) === score).length > 1,
  );

  if ((!commentIds || commentIds.length === 0) && hasRelevantTie) {
    const error: any = new Error('Tie detected. Creator must resolve only the tied ranking slots.');
    error.status = 409;
    error.tiedComments = tieComments;
    error.rankScores = rankScores;
    throw error;
  }

  let selected = totals.slice(0, 3);
  if (commentIds?.length) {
    if (commentIds.length !== 3 || new Set(commentIds).size !== 3) {
      throw new Error('Tie resolution must contain three different ideas in rank order.');
    }
    selected = commentIds.map((commentId, index) => {
      const comment = totals.find((item) => item.id === commentId);
      if (!comment || Number(comment.invested || 0) !== rankScores[index]) {
        throw new Error('Creator may only reorder or choose ideas tied at that ranking position.');
      }
      return comment;
    });
  }
  const weights = [0.6, 0.2, 0.2];

  const tx = db.transaction(() => {
    db.prepare(`UPDATE comments SET selected = 0 WHERE experiment_id = ? AND round_number = ?`).run(
      experiment.id,
      experiment.current_round,
    );
    db.prepare(`DELETE FROM selected_ideas WHERE experiment_id = ? AND round_number = ?`).run(
      experiment.id,
      experiment.current_round,
    );
    db.prepare(`DELETE FROM fusion_plans WHERE experiment_id = ? AND round_number = ?`).run(
      experiment.id,
      experiment.current_round,
    );
    const insertSelection = db.prepare(`
      INSERT INTO selected_ideas
        (experiment_id, round_number, comment_id, selection_rank, selection_role, reward_weight, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    selected.forEach((idea, index) => {
      const rank = index + 1;
      db.prepare(`UPDATE comments SET selected = 1 WHERE id = ?`).run(idea.id);
      insertSelection.run(
        experiment.id,
        experiment.current_round,
        idea.id,
        rank,
        rank === 1 ? 'core' : 'supporting',
        weights[index],
        now(),
      );
    });
    db.prepare(`UPDATE rounds SET selected_comment_id = ?, updated_at = ? WHERE experiment_id = ? AND round_number = ?`).run(
      selected[0].id,
      now(),
      experiment.id,
      experiment.current_round,
    );
    db.prepare(`UPDATE experiments SET selected_comment_id = ?, phase = 'developing', updated_at = ? WHERE id = ?`).run(
      selected[0].id,
      now(),
      experiment.id,
    );
    logPhase(experiment.id, experiment.current_round, experiment.phase, 'developing');
  });

  tx();
  return getStudyState();
}

export function saveFusionPlan(content: string) {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('Experiment has not been created yet.');
  if (experiment.phase !== 'developing') throw new Error('Fusion plans can only be generated during development.');

  const selectedCount = db
    .prepare(`SELECT COUNT(*) AS count FROM selected_ideas WHERE experiment_id = ? AND round_number = ?`)
    .get(experiment.id, experiment.current_round) as { count: number };
  if (Number(selectedCount.count) !== 3) throw new Error('Three ranked ideas are required before generating a fusion plan.');

  const plan = content.trim();
  if (!plan) throw new Error('DeepSeek returned an empty fusion plan.');
  db.prepare(`
    INSERT INTO fusion_plans (experiment_id, round_number, content, status, created_at, confirmed_at)
    VALUES (?, ?, ?, 'draft', ?, NULL)
    ON CONFLICT(experiment_id, round_number) DO UPDATE SET
      content = excluded.content,
      status = 'draft',
      created_at = excluded.created_at,
      confirmed_at = NULL
  `).run(experiment.id, experiment.current_round, plan, now());
  return getStudyState();
}

export function saveDevelopmentDraft(input: { code: string; summary: string; creatorMessage?: string }) {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('Experiment has not been created yet.');
  if (experiment.phase !== 'developing') throw new Error('Candidate drafts can only be created during development.');
  const code = input.code.trim();
  if (!code) throw new Error('DeepSeek returned an empty candidate version.');

  const selectedCount = db
    .prepare(`SELECT COUNT(*) AS count FROM selected_ideas WHERE experiment_id = ? AND round_number = ?`)
    .get(experiment.id, experiment.current_round) as any;
  if (Number(selectedCount?.count || 0) !== 3) throw new Error('Three ranked ideas are required for development.');
  const fusionPlan = db
    .prepare(`SELECT content FROM fusion_plans WHERE experiment_id = ? AND round_number = ?`)
    .get(experiment.id, experiment.current_round) as any;
  if (!fusionPlan?.content) throw new Error('Generate the fusion plan before creating candidate drafts.');

  const tx = db.transaction(() => {
    const timestamp = now();
    db.prepare(`
      INSERT INTO development_sessions
        (experiment_id, round_number, status, current_draft_id, created_at, updated_at, published_at)
      VALUES (?, ?, 'debugging', NULL, ?, ?, NULL)
      ON CONFLICT(experiment_id, round_number) DO UPDATE SET
        status = 'debugging',
        updated_at = excluded.updated_at,
        published_at = NULL
    `).run(experiment.id, experiment.current_round, timestamp, timestamp);

    const maxAttempt = db
      .prepare(`
        SELECT COALESCE(MAX(attempt_number), 0) AS attempt
        FROM development_drafts WHERE experiment_id = ? AND round_number = ?
      `)
      .get(experiment.id, experiment.current_round) as any;
    const attemptNumber = Number(maxAttempt?.attempt || 0) + 1;

    if (input.creatorMessage?.trim()) {
      db.prepare(`
        INSERT INTO development_messages (experiment_id, round_number, role, content, draft_id, created_at)
        VALUES (?, ?, 'creator', ?, NULL, ?)
      `).run(experiment.id, experiment.current_round, input.creatorMessage.trim(), timestamp);
    }

    const draft = db
      .prepare(`
        INSERT INTO development_drafts (experiment_id, round_number, attempt_number, code, summary, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(experiment.id, experiment.current_round, attemptNumber, code, input.summary.trim(), timestamp);
    const draftId = Number(draft.lastInsertRowid);

    db.prepare(`
      INSERT INTO development_messages (experiment_id, round_number, role, content, draft_id, created_at)
      VALUES (?, ?, 'assistant', ?, ?, ?)
    `).run(
      experiment.id,
      experiment.current_round,
      input.summary.trim() || `Candidate Draft ${attemptNumber} generated.`,
      draftId,
      timestamp,
    );

    db.prepare(`
      UPDATE development_sessions SET current_draft_id = ?, status = 'debugging', updated_at = ?
      WHERE experiment_id = ? AND round_number = ?
    `).run(draftId, timestamp, experiment.id, experiment.current_round);
  });

  tx();
  return getStudyState();
}

export function rollbackDevelopmentDraft() {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('Experiment has not been created yet.');
  if (experiment.phase !== 'developing') throw new Error('Candidate rollback is only available during development.');

  const session = db
    .prepare(`SELECT * FROM development_sessions WHERE experiment_id = ? AND round_number = ?`)
    .get(experiment.id, experiment.current_round) as any;
  const current = session?.current_draft_id
    ? (db.prepare(`SELECT * FROM development_drafts WHERE id = ?`).get(session.current_draft_id) as any)
    : null;
  if (!current) throw new Error('No current candidate draft exists.');
  const previous = db
    .prepare(`
      SELECT * FROM development_drafts
      WHERE experiment_id = ? AND round_number = ? AND attempt_number < ?
      ORDER BY attempt_number DESC LIMIT 1
    `)
    .get(experiment.id, experiment.current_round, current.attempt_number) as any;
  if (!previous) throw new Error('The initial candidate has no previous draft.');

  const timestamp = now();
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE development_sessions SET current_draft_id = ?, status = 'debugging', updated_at = ?
      WHERE experiment_id = ? AND round_number = ?
    `).run(previous.id, timestamp, experiment.id, experiment.current_round);
    db.prepare(`
      INSERT INTO development_messages (experiment_id, round_number, role, content, draft_id, created_at)
      VALUES (?, ?, 'system', ?, ?, ?)
    `).run(
      experiment.id,
      experiment.current_round,
      `Creator rolled back to Candidate Draft ${previous.attempt_number}.`,
      previous.id,
      timestamp,
    );
  });
  tx();
  return getStudyState();
}

export function publishDevelopmentDraft() {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('Experiment has not been created yet.');
  if (experiment.phase !== 'developing') throw new Error('Candidates can only be published during development.');
  const selectedIdeas = db
    .prepare(`
      SELECT s.*, c.content
      FROM selected_ideas s
      JOIN comments c ON c.id = s.comment_id
      WHERE s.experiment_id = ? AND s.round_number = ?
      ORDER BY s.selection_rank ASC
    `)
    .all(experiment.id, experiment.current_round) as any[];
  if (selectedIdeas.length !== 3) throw new Error('Three ranked ideas are required for publishing.');

  const fusionPlan = db
    .prepare(`SELECT * FROM fusion_plans WHERE experiment_id = ? AND round_number = ?`)
    .get(experiment.id, experiment.current_round) as any;
  if (!fusionPlan?.content) throw new Error('Generate the fusion plan before publishing.');
  const session = db
    .prepare(`SELECT * FROM development_sessions WHERE experiment_id = ? AND round_number = ?`)
    .get(experiment.id, experiment.current_round) as any;
  const draft = session?.current_draft_id
    ? (db.prepare(`SELECT * FROM development_drafts WHERE id = ?`).get(session.current_draft_id) as any)
    : null;
  if (!draft) throw new Error('Generate a candidate draft before publishing.');

  const tx = db.transaction(() => {
    const timestamp = now();
    const version = db
      .prepare(`
        INSERT INTO versions (experiment_id, round_number, title, code, prompt, source_comment_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        experiment.id,
        experiment.current_round,
        `Round ${experiment.current_round} Version`,
        draft.code,
        fusionPlan.content,
        selectedIdeas[0].comment_id,
        timestamp,
      );

    const versionId = Number(version.lastInsertRowid);
    const insertSource = db.prepare(`
      INSERT INTO version_sources (version_id, comment_id, selection_rank, selection_role)
      VALUES (?, ?, ?, ?)
    `);
    for (const idea of selectedIdeas) {
      insertSource.run(versionId, idea.comment_id, idea.selection_rank, idea.selection_role);
    }

    db.prepare(`UPDATE experiments SET current_version_id = ?, phase = 'previewing', updated_at = ? WHERE id = ?`).run(
      versionId,
      timestamp,
      experiment.id,
    );

    db.prepare(`
      UPDATE fusion_plans SET status = 'confirmed', confirmed_at = ?
      WHERE experiment_id = ? AND round_number = ?
    `).run(timestamp, experiment.id, experiment.current_round);

    db.prepare(`
      UPDATE development_sessions SET status = 'published', published_at = ?, updated_at = ?
      WHERE experiment_id = ? AND round_number = ?
    `).run(timestamp, timestamp, experiment.id, experiment.current_round);
    db.prepare(`
      INSERT INTO development_messages (experiment_id, round_number, role, content, draft_id, created_at)
      VALUES (?, ?, 'system', ?, ?, ?)
    `).run(
      experiment.id,
      experiment.current_round,
      `Creator published Candidate Draft ${draft.attempt_number} as the official round version.`,
      draft.id,
      timestamp,
    );

    logPhase(experiment.id, experiment.current_round, experiment.phase, 'previewing');
  });

  tx();
  return getStudyState();
}

export function rollbackPhase() {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('Experiment has not been created yet.');

  const fromPhase = experiment.phase as StudyPhase;
  let toPhase: StudyPhase;

  const tx = db.transaction(() => {
    if (fromPhase === 'commenting') {
      toPhase = 'experience';
    } else if (fromPhase === 'investing') {
      toPhase = 'commenting';
      const investments = db
        .prepare(`SELECT * FROM investments WHERE experiment_id = ? AND round_number = ?`)
        .all(experiment.id, experiment.current_round) as any[];
      const refundEvent = db.prepare(`
        INSERT INTO coin_events (experiment_id, round_number, participant_code, actor_type, amount, reason, ref_id, created_at)
        VALUES (?, ?, ?, ?, ?, 'investment_refund_on_rollback', ?, ?)
      `);
      for (const investment of investments) {
        const isCreator = investment.actor_type === 'creator' || investment.participant_code === 'CREATOR';
        if (isCreator) {
          db.prepare(`UPDATE experiments SET creator_coins = creator_coins + ?, updated_at = ? WHERE id = ?`).run(
            investment.amount,
            now(),
            experiment.id,
          );
        } else {
          db.prepare(`UPDATE participants SET coins = coins + ? WHERE code = ?`).run(
            investment.amount,
            investment.participant_code,
          );
        }
        refundEvent.run(
          experiment.id,
          experiment.current_round,
          isCreator ? null : investment.participant_code,
          isCreator ? 'creator' : 'participant',
          investment.amount,
          String(investment.comment_id),
          now(),
        );
      }
      db.prepare(`DELETE FROM investments WHERE experiment_id = ? AND round_number = ?`).run(
        experiment.id,
        experiment.current_round,
      );
    } else if (fromPhase === 'developing') {
      toPhase = 'investing';
      db.prepare(`UPDATE comments SET selected = 0 WHERE experiment_id = ? AND round_number = ?`).run(
        experiment.id,
        experiment.current_round,
      );
      db.prepare(`DELETE FROM selected_ideas WHERE experiment_id = ? AND round_number = ?`).run(
        experiment.id,
        experiment.current_round,
      );
      db.prepare(`DELETE FROM fusion_plans WHERE experiment_id = ? AND round_number = ?`).run(
        experiment.id,
        experiment.current_round,
      );
      db.prepare(`DELETE FROM development_messages WHERE experiment_id = ? AND round_number = ?`).run(
        experiment.id,
        experiment.current_round,
      );
      db.prepare(`DELETE FROM development_drafts WHERE experiment_id = ? AND round_number = ?`).run(
        experiment.id,
        experiment.current_round,
      );
      db.prepare(`DELETE FROM development_sessions WHERE experiment_id = ? AND round_number = ?`).run(
        experiment.id,
        experiment.current_round,
      );
      db.prepare(`UPDATE rounds SET selected_comment_id = NULL, updated_at = ? WHERE experiment_id = ? AND round_number = ?`).run(
        now(),
        experiment.id,
        experiment.current_round,
      );
      db.prepare(`UPDATE experiments SET selected_comment_id = NULL WHERE id = ?`).run(experiment.id);
    } else if (fromPhase === 'previewing') {
      toPhase = 'developing';
      const currentVersion = db.prepare(`SELECT * FROM versions WHERE id = ?`).get(experiment.current_version_id) as any;
      const previousVersion = db
        .prepare(`SELECT * FROM versions WHERE experiment_id = ? AND id < ? ORDER BY id DESC LIMIT 1`)
        .get(experiment.id, experiment.current_version_id) as any;
      if (!currentVersion || currentVersion.round_number !== experiment.current_round || !previousVersion) {
        throw new Error('The committed preview cannot be rolled back safely.');
      }
      db.prepare(`DELETE FROM version_sources WHERE version_id = ?`).run(currentVersion.id);
      db.prepare(`DELETE FROM versions WHERE id = ?`).run(currentVersion.id);
      db.prepare(`
        UPDATE fusion_plans SET status = 'draft', confirmed_at = NULL
        WHERE experiment_id = ? AND round_number = ?
      `).run(experiment.id, experiment.current_round);
      db.prepare(`UPDATE experiments SET current_version_id = ? WHERE id = ?`).run(previousVersion.id, experiment.id);
      db.prepare(`
        UPDATE development_sessions SET status = 'debugging', published_at = NULL, updated_at = ?
        WHERE experiment_id = ? AND round_number = ?
      `).run(now(), experiment.id, experiment.current_round);
    } else if (fromPhase === 'ending_vote') {
      toPhase = 'previewing';
      db.prepare(`DELETE FROM end_votes WHERE experiment_id = ? AND round_number = ?`).run(
        experiment.id,
        experiment.current_round,
      );
      db.prepare(`UPDATE experiments SET end_vote_started_at = NULL WHERE id = ?`).run(experiment.id);
    } else {
      throw new Error('This phase does not have a safe previous phase.');
    }

    db.prepare(`UPDATE experiments SET phase = ?, updated_at = ? WHERE id = ?`).run(toPhase!, now(), experiment.id);
    logPhase(experiment.id, experiment.current_round, fromPhase, toPhase!);
  });

  tx();
  return getStudyState();
}

export function startEndVote() {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('Experiment has not been created yet.');
  if (experiment.phase !== 'previewing') throw new Error('Project-end voting can only start after previewing a completed round.');

  const eligible = Number(
    (db.prepare(`SELECT COUNT(*) AS count FROM participants WHERE joined_at IS NOT NULL`).get() as any)?.count || 0,
  );
  if (eligible === 0) throw new Error('At least one participant must join before starting a project-end vote.');

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM end_votes WHERE experiment_id = ? AND round_number = ?`).run(
      experiment.id,
      experiment.current_round,
    );
    db.prepare(`UPDATE experiments SET phase = 'ending_vote', end_vote_started_at = ?, updated_at = ? WHERE id = ?`).run(
      now(),
      now(),
      experiment.id,
    );
    logPhase(experiment.id, experiment.current_round, experiment.phase, 'ending_vote');
  });
  tx();
  return getStudyState();
}

export function voteProjectEnd(participantCode: string, vote: boolean) {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('Experiment has not been created yet.');
  if (experiment.phase !== 'ending_vote') throw new Error('There is no active project-end vote.');

  const cleanCode = participantCode.trim().toUpperCase();
  const participant = db.prepare(`SELECT * FROM participants WHERE code = ? AND joined_at IS NOT NULL`).get(cleanCode);
  if (!participant) throw new Error('Join the study before voting.');

  const tx = db.transaction(() => {
    const timestamp = now();
    db.prepare(`
      INSERT INTO end_votes (experiment_id, round_number, participant_code, vote, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(experiment_id, round_number, participant_code) DO UPDATE SET
        vote = excluded.vote,
        updated_at = excluded.updated_at
    `).run(experiment.id, experiment.current_round, cleanCode, vote ? 1 : 0, timestamp, timestamp);

    const eligible = Number(
      (db.prepare(`SELECT COUNT(*) AS count FROM participants WHERE joined_at IS NOT NULL`).get() as any)?.count || 0,
    );
    const counts = db
      .prepare(`
        SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) AS yes
        FROM end_votes WHERE experiment_id = ? AND round_number = ?
      `)
      .get(experiment.id, experiment.current_round) as any;
    const totalVotes = Number(counts?.total || 0);
    const yesVotes = Number(counts?.yes || 0);

    if (yesVotes * 4 > eligible * 3) {
      db.prepare(`UPDATE experiments SET phase = 'ended', ended_at = ?, updated_at = ? WHERE id = ?`).run(
        timestamp,
        timestamp,
        experiment.id,
      );
      logPhase(experiment.id, experiment.current_round, 'ending_vote', 'ended');
    } else if (totalVotes >= eligible) {
      db.prepare(`UPDATE experiments SET phase = 'previewing', end_vote_started_at = NULL, updated_at = ? WHERE id = ?`).run(
        timestamp,
        experiment.id,
      );
      logPhase(experiment.id, experiment.current_round, 'ending_vote', 'previewing');
    }
  });

  tx();
  return getStudyState();
}

export function startNextRound() {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('Experiment has not been created yet.');
  if (experiment.phase !== 'previewing') throw new Error('The next round can only start from the preview phase.');

  const nextRound = Number(experiment.current_round) + 1;
  const nextMaxRounds = Math.max(Number(experiment.max_rounds), nextRound);
  const tx = db.transaction(() => {
    ensureRound(experiment.id, nextRound);
    db.prepare(`UPDATE experiments SET current_round = ?, max_rounds = ?, phase = 'experience', selected_comment_id = NULL, updated_at = ? WHERE id = ?`).run(
      nextRound,
      nextMaxRounds,
      now(),
      experiment.id,
    );
    logPhase(experiment.id, nextRound, experiment.phase, 'experience');
  });

  tx();
  return getStudyState();
}
