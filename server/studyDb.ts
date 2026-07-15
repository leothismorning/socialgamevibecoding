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
  | 'aborted'
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
  experimentHistory: any[];
  ideaRevisions: any[];
  leaderboard: any[];
  marketPrivacyActive: boolean;
  viewerParticipantCode?: string;
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
    investment_settled_v3 INTEGER NOT NULL DEFAULT 0,
    investment_locked_v3 INTEGER NOT NULL DEFAULT 0,
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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS comment_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    comment_id INTEGER NOT NULL,
    participant_code TEXT NOT NULL,
    content TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS idea_display_orders (
    experiment_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    viewer_key TEXT NOT NULL,
    comment_id INTEGER NOT NULL,
    display_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(experiment_id, round_number, viewer_key, comment_id),
    UNIQUE(experiment_id, round_number, viewer_key, display_order)
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

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS experiment_participant_snapshots (
    experiment_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    coins INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT,
    last_seen_at TEXT,
    PRIMARY KEY(experiment_id, code)
  );

  CREATE TABLE IF NOT EXISTS participant_sessions (
    experiment_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    participant_code TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY(experiment_id, client_id),
    UNIQUE(experiment_id, participant_code)
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
if (!roundColumns.some((column) => column.name === 'investment_settled_v3')) {
  db.exec(`ALTER TABLE rounds ADD COLUMN investment_settled_v3 INTEGER NOT NULL DEFAULT 0`);
}
if (!roundColumns.some((column) => column.name === 'investment_locked_v3')) {
  db.exec(`ALTER TABLE rounds ADD COLUMN investment_locked_v3 INTEGER NOT NULL DEFAULT 0`);
}

const commentColumns = db.prepare(`PRAGMA table_info(comments)`).all() as Array<{ name: string }>;
if (!commentColumns.some((column) => column.name === 'updated_at')) {
  db.exec(`ALTER TABLE comments ADD COLUMN updated_at TEXT`);
  db.exec(`UPDATE comments SET updated_at = created_at WHERE updated_at IS NULL`);
}
if (!commentColumns.some((column) => column.name === 'deleted_at')) {
  db.exec(`ALTER TABLE comments ADD COLUMN deleted_at TEXT`);
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
  for (let i = 1; i <= 19; i += 1) {
    const code = `P${i}`;
    insert.run(code, `Participant ${i}`);
  }
});

seedParticipants();

const participantAllocationMigration = db
  .prepare(`SELECT value FROM app_meta WHERE key = 'automatic_participant_allocation_v1'`)
  .get() as any;
if (!participantAllocationMigration) {
  const migrateAutomaticAllocation = db.transaction(() => {
    // Clear seats selected through the retired P01-P20 picker before automatic assignment begins.
    db.prepare(`UPDATE participants SET coins = 0, joined_at = NULL, last_seen_at = NULL`).run();
    db.prepare(`DELETE FROM participant_sessions`).run();
    db.prepare(`INSERT INTO app_meta (key, value) VALUES ('automatic_participant_allocation_v1', ?)`).run(now());
  });
  migrateAutomaticAllocation();
}

function getActiveExperimentId() {
  const stored = db.prepare(`SELECT value FROM app_meta WHERE key = 'active_experiment_id'`).get() as any;
  if (stored?.value) return String(stored.value);

  const latest = db.prepare(`SELECT id FROM experiments ORDER BY created_at DESC LIMIT 1`).get() as any;
  if (latest?.id) {
    db.prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('active_experiment_id', ?)`).run(latest.id);
    return String(latest.id);
  }
  return null;
}

function setActiveExperimentId(experimentId: string) {
  db.prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('active_experiment_id', ?)`).run(experimentId);
}

function activeExperiment(experimentId?: string) {
  const id = experimentId || getActiveExperimentId();
  if (!id) return undefined;
  return db.prepare(`SELECT * FROM experiments WHERE id = ?`).get(id) as any | undefined;
}

function migrateLegacyInvestmentTiers() {
  const migrated = db.prepare(`SELECT value FROM app_meta WHERE key = 'coin_reaction_tiers_v1'`).get() as any;
  if (migrated) return;
  const experiment = activeExperiment();
  const migration = db.transaction(() => {
    if (experiment) {
      const round = db
        .prepare(`SELECT investment_locked_v3 FROM rounds WHERE experiment_id = ? AND round_number = ?`)
        .get(experiment.id, experiment.current_round) as any;
      if (Number(round?.investment_locked_v3 || 0) === 0) {
        const legacyInvestments = db.prepare(`
          SELECT * FROM investments WHERE experiment_id = ? AND round_number = ?
        `).all(experiment.id, experiment.current_round) as any[];
        const timestamp = now();
        for (const investment of legacyInvestments) {
          const amount = Number(investment.amount || 0);
          if (amount <= 0) continue;
          if (investment.actor_type === 'creator') {
            db.prepare(`UPDATE experiments SET creator_coins = creator_coins + ?, updated_at = ? WHERE id = ?`).run(
              amount,
              timestamp,
              experiment.id,
            );
          } else {
            db.prepare(`UPDATE participants SET coins = coins + ? WHERE code = ?`).run(amount, investment.participant_code);
          }
          db.prepare(`
            INSERT INTO coin_events (experiment_id, round_number, participant_code, actor_type, amount, reason, ref_id, created_at)
            VALUES (?, ?, ?, ?, ?, 'investment_reaction_migration_refund', ?, ?)
          `).run(
            experiment.id,
            experiment.current_round,
            investment.actor_type === 'creator' ? null : investment.participant_code,
            investment.actor_type || 'participant',
            amount,
            String(investment.comment_id),
            timestamp,
          );
        }
        db.prepare(`DELETE FROM investments WHERE experiment_id = ? AND round_number = ?`).run(
          experiment.id,
          experiment.current_round,
        );
      }
    }
    db.prepare(`INSERT INTO app_meta (key, value) VALUES ('coin_reaction_tiers_v1', ?)`).run(now());
  });
  migration.immediate();
}

migrateLegacyInvestmentTiers();

function snapshotParticipants(experimentId: string) {
  db.prepare(`DELETE FROM experiment_participant_snapshots WHERE experiment_id = ?`).run(experimentId);
  db.prepare(`
    INSERT INTO experiment_participant_snapshots
      (experiment_id, code, name, role, coins, joined_at, last_seen_at)
    SELECT ?, code, name, role, coins, joined_at, last_seen_at FROM participants
  `).run(experimentId);
}

function experimentHistory(activeId: string | null) {
  const experiments = db.prepare(`SELECT * FROM experiments ORDER BY created_at DESC`).all() as any[];
  const globalJoined = Number(
    (db.prepare(`SELECT COUNT(*) AS count FROM participants WHERE joined_at IS NOT NULL`).get() as any)?.count || 0,
  );
  return experiments.map((experiment) => {
    const versionCount = Number(
      (db.prepare(`SELECT COUNT(*) AS count FROM versions WHERE experiment_id = ?`).get(experiment.id) as any)?.count || 0,
    );
    const commentCount = Number(
      (db.prepare(`SELECT COUNT(*) AS count FROM comments WHERE experiment_id = ? AND deleted_at IS NULL`).get(experiment.id) as any)?.count || 0,
    );
    const archivedJoined = Number(
      (
        db
          .prepare(`SELECT COUNT(*) AS count FROM experiment_participant_snapshots WHERE experiment_id = ? AND joined_at IS NOT NULL`)
          .get(experiment.id) as any
      )?.count || 0,
    );
    return {
      ...experiment,
      is_active: experiment.id === activeId,
      version_count: versionCount,
      comment_count: commentCount,
      participant_count: experiment.id === activeId ? globalJoined : archivedJoined,
    };
  });
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

function prepareInvestmentPhase(experimentId: string, roundNumber: number) {
  const experiment = db.prepare(`SELECT creator_coins FROM experiments WHERE id = ?`).get(experimentId) as any;
  const creatorDelta = 200 - Number(experiment?.creator_coins || 0);
  const timestamp = now();
  db.prepare(`UPDATE experiments SET creator_coins = 200, updated_at = ? WHERE id = ?`).run(timestamp, experimentId);
  if (creatorDelta !== 0) {
    db.prepare(`
      INSERT INTO coin_events (experiment_id, round_number, participant_code, actor_type, amount, reason, ref_id, created_at)
      VALUES (?, ?, NULL, 'creator', ?, 'creator_budget_reset', 'fixed_200', ?)
    `).run(experimentId, roundNumber, creatorDelta, timestamp);
  }
  db.prepare(`
    UPDATE rounds SET investment_locked_v3 = 0, updated_at = ?
    WHERE experiment_id = ? AND round_number = ?
  `).run(timestamp, experimentId, roundNumber);
}

function buildLeaderboard(experimentId: string, participantRows: any[]) {
  const receivedInvestment = db.prepare(`
    SELECT COALESCE(SUM(i.amount), 0) AS total
    FROM comments c
    JOIN investments i ON i.comment_id = c.id
    WHERE c.experiment_id = ? AND c.participant_code = ? AND c.deleted_at IS NULL
  `);
  const coinEventTotal = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM coin_events
    WHERE experiment_id = ? AND participant_code = ? AND reason IN (
      SELECT value FROM json_each(?)
    )
  `);
  const selectionStats = db.prepare(`
    SELECT
      COUNT(*) AS top_three_count,
      COALESCE(SUM(CASE WHEN s.selection_rank = 1 THEN 1 ELSE 0 END), 0) AS first_place_count
    FROM selected_ideas s
    JOIN comments c ON c.id = s.comment_id
    WHERE s.experiment_id = ? AND c.participant_code = ?
  `);
  const successfulInvestments = db.prepare(`
    SELECT COUNT(*) AS count
    FROM investments i
    JOIN selected_ideas s
      ON s.experiment_id = i.experiment_id
      AND s.round_number = i.round_number
      AND s.comment_id = i.comment_id
    WHERE i.experiment_id = ? AND i.participant_code = ? AND i.actor_type = 'participant'
  `);

  const rows = participantRows
    .filter((participant) => participant.joined_at)
    .map((participant) => {
      const selection = selectionStats.get(experimentId, participant.code) as any;
      const authorEarnings = Number(
        (coinEventTotal.get(experimentId, participant.code, JSON.stringify(['idea_support_reward', 'idea_rank_bonus'])) as any)
          ?.total || 0,
      );
      const investmentReturns = Number(
        (coinEventTotal.get(experimentId, participant.code, JSON.stringify(['investment_return'])) as any)?.total || 0,
      );
      const investmentNet = Number(
        (
          coinEventTotal.get(
            experimentId,
            participant.code,
            JSON.stringify(['investment', 'investment_return', 'investment_refund_on_rollback']),
          ) as any
        )?.total || 0,
      );
      return {
        rank: 0,
        participant_code: participant.code,
        participant_name: participant.name,
        coins: Number(participant.coins || 0),
        top_three_count: Number(selection?.top_three_count || 0),
        first_place_count: Number(selection?.first_place_count || 0),
        received_investment: Number((receivedInvestment.get(experimentId, participant.code) as any)?.total || 0),
        author_earnings: authorEarnings,
        investment_returns: investmentReturns,
        investment_net: investmentNet,
        top_three_hits: Number((successfulInvestments.get(experimentId, participant.code) as any)?.count || 0),
      };
    })
    .sort(
      (a, b) =>
        b.coins - a.coins ||
        b.investment_net - a.investment_net ||
        b.first_place_count - a.first_place_count ||
        b.top_three_count - a.top_three_count ||
        a.participant_code.localeCompare(b.participant_code),
    );

  let displayedRank = 0;
  let previous: any = null;
  return rows.map((row, index) => {
    const tied =
      previous &&
      previous.coins === row.coins &&
      previous.investment_net === row.investment_net &&
      previous.first_place_count === row.first_place_count &&
      previous.top_three_count === row.top_three_count;
    if (!tied) displayedRank = index + 1;
    previous = row;
    return { ...row, rank: displayedRank };
  });
}

export type StudyViewer = {
  role?: 'creator' | 'participant' | null;
  participantCode?: string | null;
};

function ensureIdeaDisplayOrder(experimentId: string, roundNumber: number, viewerKey: string, commentIds: number[]) {
  const existing = db
    .prepare(`
      SELECT comment_id, display_order FROM idea_display_orders
      WHERE experiment_id = ? AND round_number = ? AND viewer_key = ?
      ORDER BY display_order ASC
    `)
    .all(experimentId, roundNumber, viewerKey) as any[];
  const sameIds =
    existing.length === commentIds.length &&
    existing.every((item) => commentIds.includes(Number(item.comment_id)));
  if (sameIds) return new Map(existing.map((item) => [Number(item.comment_id), Number(item.display_order)]));

  const shuffled = [...commentIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM idea_display_orders WHERE experiment_id = ? AND round_number = ? AND viewer_key = ?`).run(
      experimentId,
      roundNumber,
      viewerKey,
    );
    const insert = db.prepare(`
      INSERT INTO idea_display_orders
        (experiment_id, round_number, viewer_key, comment_id, display_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    shuffled.forEach((commentId, index) => insert.run(experimentId, roundNumber, viewerKey, commentId, index + 1, now()));
  });
  tx();
  return new Map(shuffled.map((commentId, index) => [commentId, index + 1]));
}

export function filterStudyStateForViewer(state: StudyState, viewer: StudyViewer = {}): StudyState {
  const experiment = state.experiment;
  if (!experiment || experiment.phase !== 'investing') return state;
  const participantCode = String(viewer.participantCode || '').trim().toUpperCase();
  const ownInvestmentCode = viewer.role === 'creator' ? 'CREATOR' : participantCode;

  return {
    ...state,
    comments: state.comments.map((comment) => ({
      ...comment,
      is_own: viewer.role === 'participant' && comment.participant_code === participantCode,
    })),
    investments: ownInvestmentCode
      ? state.investments.filter((investment) => investment.participant_code === ownInvestmentCode)
      : [],
    participants: state.participants.map((participant) => ({
      ...participant,
      coins: viewer.role === 'participant' && participant.code === participantCode ? participant.coins : 0,
    })),
    coinEvents: state.coinEvents.filter((event) =>
      viewer.role === 'creator'
        ? event.actor_type === 'creator'
        : viewer.role === 'participant'
          ? event.participant_code === participantCode
          : false,
    ),
    leaderboard: [],
    marketPrivacyActive: false,
  };
}

export function getStudyState(experimentId?: string): StudyState {
  const activeId = getActiveExperimentId();
  const experiment = activeExperiment(experimentId) || null;
  const archivedParticipants = experiment && experiment.id !== activeId
    ? db
        .prepare(`SELECT code, name, role, coins, joined_at, last_seen_at FROM experiment_participant_snapshots WHERE experiment_id = ? ORDER BY code ASC`)
        .all(experiment.id)
    : [];
  const participants = archivedParticipants.length > 0
    ? archivedParticipants
    : db.prepare(`SELECT * FROM participants ORDER BY code ASC`).all();
  const history = experimentHistory(activeId);
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
      experimentHistory: history,
      ideaRevisions: [],
      leaderboard: [],
      marketPrivacyActive: false,
      endVoteSummary: { eligible: 0, yes: 0, no: 0, pending: 0, requiredYes: 0 },
    };
  }

  const rounds = db.prepare(`SELECT * FROM rounds WHERE experiment_id = ? ORDER BY round_number ASC`).all(experiment.id);
  const versions = db.prepare(`SELECT * FROM versions WHERE experiment_id = ? ORDER BY round_number ASC, id ASC`).all(experiment.id);
  const comments = db
    .prepare(`
      SELECT c.*, p.name AS participant_name, COALESCE(SUM(i.amount), 0) AS invested,
             COUNT(DISTINCT i.participant_code) AS investor_count
      FROM comments c
      LEFT JOIN participants p ON p.code = c.participant_code
      LEFT JOIN investments i ON i.comment_id = c.id
      WHERE c.experiment_id = ? AND c.deleted_at IS NULL
      GROUP BY c.id
      ORDER BY c.round_number ASC, c.created_at ASC
    `)
    .all(experiment.id);
  const investments = db.prepare(`SELECT * FROM investments WHERE experiment_id = ? ORDER BY created_at ASC`).all(experiment.id);
  const coinEvents = db.prepare(`SELECT * FROM coin_events WHERE experiment_id = ? ORDER BY created_at DESC LIMIT 80`).all(experiment.id);
  const ideaRevisions = db
    .prepare(`SELECT * FROM comment_revisions WHERE experiment_id = ? ORDER BY created_at ASC, id ASC`)
    .all(experiment.id);
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
  const eligible = participants.filter((participant: any) => participant.joined_at).length;
  const yes = endVotes.filter((vote) => Number(vote.vote) === 1).length;
  const no = endVotes.filter((vote) => Number(vote.vote) === 0).length;
  const endVoteSummary = {
    eligible,
    yes,
    no,
    pending: Math.max(0, eligible - yes - no),
    requiredYes: eligible > 0 ? Math.floor(eligible * 0.75) + 1 : 0,
  };
  const leaderboard = buildLeaderboard(experiment.id, participants as any[]);

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
    experimentHistory: history,
    ideaRevisions,
    leaderboard,
    marketPrivacyActive: false,
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
  const experimentId = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const previousExperiment = activeExperiment();

  const tx = db.transaction(() => {
    if (previousExperiment) {
      snapshotParticipants(previousExperiment.id);
    }
    db.prepare(`UPDATE participants SET coins = 0, joined_at = NULL, last_seen_at = NULL`).run();
    db.prepare(`DELETE FROM participant_sessions`).run();

    db.prepare(`
      INSERT INTO experiments (id, title, brief, creator_name, creator_coins, phase, current_round, max_rounds, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, 'experience', 1, ?, ?, ?)
    `).run(experimentId, title, input.brief.trim(), input.creatorName.trim() || 'Creator', maxRounds, created, created);

    ensureRound(experimentId, 1);
    const version = db
      .prepare(`
        INSERT INTO versions (experiment_id, round_number, title, code, prompt, created_at)
        VALUES (?, 1, ?, ?, ?, ?)
      `)
      .run(experimentId, 'Initial Version', input.initialCode, input.initialPrompt || input.brief || title, created);

    db.prepare(`UPDATE experiments SET current_version_id = ?, updated_at = ? WHERE id = ?`).run(
      Number(version.lastInsertRowid),
      created,
      experimentId,
    );
    setActiveExperimentId(experimentId);
    logPhase(experimentId, 1, 'setup', 'experience');
  });

  tx();
  return getStudyState();
}

const allocateParticipant = db.transaction((rawClientId: string) => {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('Creator must start an experiment before participants can join.');
  if (experiment.phase === 'ended' || experiment.phase === 'aborted') {
    throw new Error('This experiment is no longer accepting participants.');
  }

  const clientId = rawClientId.trim();
  if (!clientId || clientId.length > 160) throw new Error('A valid participant session is required.');
  const timestamp = now();
  const existing = db.prepare(`
    SELECT participant_code FROM participant_sessions
    WHERE experiment_id = ? AND client_id = ?
  `).get(experiment.id, clientId) as any;

  if (existing?.participant_code) {
    db.prepare(`UPDATE participant_sessions SET last_seen_at = ? WHERE experiment_id = ? AND client_id = ?`).run(
      timestamp,
      experiment.id,
      clientId,
    );
    db.prepare(`
      UPDATE participants
      SET joined_at = COALESCE(joined_at, ?), last_seen_at = ?
      WHERE code = ?
    `).run(timestamp, timestamp, existing.participant_code);
    return String(existing.participant_code);
  }

  const occupied = new Set(
    (db.prepare(`SELECT participant_code FROM participant_sessions WHERE experiment_id = ?`).all(experiment.id) as any[])
      .map((row) => String(row.participant_code)),
  );
  const participantCode = Array.from({ length: 19 }, (_, index) => `P${index + 1}`)
    .find((code) => !occupied.has(code));
  if (!participantCode) throw new Error('This room is full. A maximum of 19 participants can join.');

  db.prepare(`
    INSERT INTO participant_sessions (experiment_id, client_id, participant_code, joined_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(experiment.id, clientId, participantCode, timestamp, timestamp);
  db.prepare(`
    UPDATE participants SET name = ?, coins = 0, joined_at = ?, last_seen_at = ? WHERE code = ?
  `).run(`Participant ${participantCode.slice(1)}`, timestamp, timestamp, participantCode);
  return participantCode;
});

export function joinStudy(clientId: string) {
  const participantCode = allocateParticipant.immediate(clientId);
  return { ...getStudyState(), viewerParticipantCode: participantCode };
}

export function leaveStudy(clientId: string) {
  const experiment = activeExperiment();
  if (!experiment) return getStudyState();
  const cleanClientId = clientId.trim();
  if (!cleanClientId) return getStudyState();

  const releaseParticipant = db.transaction(() => {
    const session = db.prepare(`
      SELECT participant_code FROM participant_sessions
      WHERE experiment_id = ? AND client_id = ?
    `).get(experiment.id, cleanClientId) as any;
    if (!session?.participant_code) return;
    db.prepare(`DELETE FROM participant_sessions WHERE experiment_id = ? AND client_id = ?`).run(experiment.id, cleanClientId);
    db.prepare(`
      UPDATE participants SET coins = 0, joined_at = NULL, last_seen_at = ? WHERE code = ?
    `).run(now(), session.participant_code);
  });
  releaseParticipant.immediate();
  return getStudyState();
}

export function setPhase(toPhase: StudyPhase) {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('Create the experiment before changing phases.');

  const valid: StudyPhase[] = ['setup', 'experience', 'commenting', 'investing', 'developing', 'previewing', 'ending_vote', 'aborted', 'ended'];
  if (!valid.includes(toPhase)) throw new Error('Invalid phase.');

  const fromPhase = experiment.phase;
  if (toPhase === 'investing') {
    prepareInvestmentPhase(experiment.id, experiment.current_round);
  }

  db.prepare(`UPDATE experiments SET phase = ?, updated_at = ? WHERE id = ?`).run(toPhase, now(), experiment.id);
  logPhase(experiment.id, experiment.current_round, fromPhase, toPhase);
  return getStudyState();
}

export function abortExperiment() {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('There is no active experiment to stop.');
  if (experiment.phase === 'ended') throw new Error('This experiment has already ended.');
  if (experiment.phase === 'aborted') return getStudyState();

  const stoppedAt = now();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE experiments SET phase = 'aborted', updated_at = ? WHERE id = ?`).run(stoppedAt, experiment.id);
    snapshotParticipants(experiment.id);
    db.prepare(`DELETE FROM participant_sessions WHERE experiment_id = ?`).run(experiment.id);
    logPhase(experiment.id, experiment.current_round, experiment.phase, 'aborted');
  });
  tx();
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
  if (text.length > 280) throw new Error('Comment cannot exceed 280 characters.');

  const existingComments = db
    .prepare(`
      SELECT * FROM comments
      WHERE experiment_id = ? AND round_number = ? AND participant_code = ?
      ORDER BY id DESC
    `)
    .all(experiment.id, experiment.current_round, cleanCode) as any[];
  const existing = existingComments[0];
  const timestamp = now();
  const tx = db.transaction(() => {
    let commentId: number;
    let action: 'create' | 'update' | 'restore';
    if (existing) {
      commentId = Number(existing.id);
      action = existing.deleted_at ? 'restore' : 'update';
      db.prepare(`UPDATE comments SET content = ?, updated_at = ?, deleted_at = NULL WHERE id = ?`).run(
        text,
        timestamp,
        commentId,
      );
      for (const duplicate of existingComments.slice(1)) {
        if (!duplicate.deleted_at) {
          db.prepare(`UPDATE comments SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(timestamp, timestamp, duplicate.id);
        }
      }
    } else {
      const inserted = db.prepare(`
        INSERT INTO comments (experiment_id, round_number, participant_code, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(experiment.id, experiment.current_round, cleanCode, text, timestamp, timestamp);
      commentId = Number(inserted.lastInsertRowid);
      action = 'create';
      db.prepare(`UPDATE participants SET coins = coins + 100 WHERE code = ?`).run(cleanCode);
      db.prepare(`
        INSERT INTO coin_events
          (experiment_id, round_number, participant_code, actor_type, amount, reason, ref_id, created_at)
        VALUES (?, ?, ?, 'participant', 100, 'idea_submission_reward', ?, ?)
      `).run(experiment.id, experiment.current_round, cleanCode, String(commentId), timestamp);
    }
    db.prepare(`
      INSERT INTO comment_revisions
        (experiment_id, round_number, comment_id, participant_code, content, action, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(experiment.id, experiment.current_round, commentId, cleanCode, text, action, timestamp);
  });

  tx();

  return getStudyState();
}

export function deleteComment(participantCode: string) {
  const experiment = activeExperiment();
  if (!experiment) throw new Error('Experiment has not been created yet.');
  if (experiment.phase !== 'commenting') throw new Error('Ideas can only be deleted during the commenting phase.');

  const cleanCode = participantCode.trim().toUpperCase();
  const comment = db
    .prepare(`
      SELECT * FROM comments
      WHERE experiment_id = ? AND round_number = ? AND participant_code = ? AND deleted_at IS NULL
      ORDER BY id DESC LIMIT 1
    `)
    .get(experiment.id, experiment.current_round, cleanCode) as any;
  if (!comment) throw new Error('There is no active idea to delete in this round.');

  const timestamp = now();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE comments SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(timestamp, timestamp, comment.id);
    db.prepare(`
      INSERT INTO comment_revisions
        (experiment_id, round_number, comment_id, participant_code, content, action, created_at)
      VALUES (?, ?, ?, ?, ?, 'delete', ?)
    `).run(experiment.id, experiment.current_round, comment.id, cleanCode, comment.content, timestamp);
  });
  tx();
  return getStudyState();
}

export function investCoins(actorType: 'participant' | 'creator', participantCode: string, commentId: number, amount: number) {
  const updateReaction = db.transaction(() => {
    const experiment = activeExperiment();
    if (!experiment) throw new Error('Experiment has not been created yet.');
    if (experiment.phase !== 'investing') throw new Error('Investments are only open during the investing phase.');
    const round = db
      .prepare(`SELECT investment_locked_v3 FROM rounds WHERE experiment_id = ? AND round_number = ?`)
      .get(experiment.id, experiment.current_round) as any;
    if (Number(round?.investment_locked_v3 || 0) === 1) throw new Error('The investment market is locked for result settlement.');

    const isCreator = actorType === 'creator';
    const cleanCode = isCreator ? 'CREATOR' : participantCode.trim().toUpperCase();
    const participant = isCreator
      ? null
      : (db.prepare(`SELECT * FROM participants WHERE code = ? AND joined_at IS NOT NULL`).get(cleanCode) as any);
    if (!isCreator && !participant) throw new Error('Join the study before investing.');

    const comment = db
      .prepare(`
        SELECT * FROM comments
        WHERE id = ? AND experiment_id = ? AND round_number = ? AND deleted_at IS NULL
      `)
      .get(commentId, experiment.id, experiment.current_round) as any;
    if (!comment) throw new Error('Comment does not belong to the current round.');
    if (!isCreator && comment.participant_code === cleanCode) throw new Error('Participants cannot invest in their own comment.');

    const value = Math.floor(Number(amount));
    if (![0, 20].includes(value)) {
      throw new Error('A comment vote must be either 20 coins or withdrawn to 0.');
    }
    const previous = db
      .prepare(`SELECT * FROM investments WHERE experiment_id = ? AND round_number = ? AND participant_code = ? AND comment_id = ?`)
      .get(experiment.id, experiment.current_round, cleanCode, commentId) as any;
    const previousAmount = Number(previous?.amount || 0);
    const expectedAmount = previousAmount > 0 ? 0 : 20;
    if (value !== expectedAmount) {
      const error: any = new Error(previousAmount > 0 ? 'You have already voted for this comment.' : 'This vote changed elsewhere. Try again.');
      error.status = 409;
      throw error;
    }

    const committed = Number(
      (
        db
          .prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM investments
            WHERE experiment_id = ? AND round_number = ? AND participant_code = ? AND comment_id != ?
          `)
          .get(experiment.id, experiment.current_round, cleanCode, commentId) as any
      )?.total || 0,
    );
    const roundLimit = isCreator ? 200 : 150;
    if (committed + value > roundLimit) {
      throw new Error(`${isCreator ? 'Creator' : 'Participant'} may invest at most ${roundLimit} coins per round.`);
    }
    const delta = value - previousAmount;
    const availableCoins = isCreator ? Number(experiment.creator_coins) : Number(participant.coins);
    if (delta > availableCoins) throw new Error('Not enough coins for another 20-coin reaction.');

    const timestamp = now();
    if (value === 0) {
      db.prepare(`DELETE FROM investments WHERE id = ?`).run(previous.id);
    } else {
      db.prepare(`
        INSERT INTO investments (experiment_id, round_number, participant_code, comment_id, amount, created_at, actor_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(experiment.id, experiment.current_round, cleanCode, commentId, value, timestamp, actorType);
    }
    if (isCreator) {
      db.prepare(`UPDATE experiments SET creator_coins = creator_coins - ?, updated_at = ? WHERE id = ?`).run(
        delta,
        timestamp,
        experiment.id,
      );
    } else {
      db.prepare(`UPDATE participants SET coins = coins - ? WHERE code = ?`).run(delta, cleanCode);
    }
    db.prepare(`
      INSERT INTO coin_events (experiment_id, round_number, participant_code, actor_type, amount, reason, ref_id, created_at)
      VALUES (?, ?, ?, ?, ?, 'investment', ?, ?)
    `).run(experiment.id, experiment.current_round, isCreator ? null : cleanCode, actorType, -delta, String(commentId), timestamp);
  });

  updateReaction.immediate();
  return getStudyState();
}

function settleRoundInvestments(experiment: any, selected: any[], totals: any[]) {
  const round = db
    .prepare(`SELECT investment_settled_v3 FROM rounds WHERE experiment_id = ? AND round_number = ?`)
    .get(experiment.id, experiment.current_round) as any;
  if (Number(round?.investment_settled_v3 || 0) === 1) return;

  const timestamp = now();
  const addParticipantCoins = db.prepare(`UPDATE participants SET coins = coins + ? WHERE code = ?`);
  const addCreatorCoins = db.prepare(`UPDATE experiments SET creator_coins = creator_coins + ?, updated_at = ? WHERE id = ?`);
  const addEvent = db.prepare(`
    INSERT INTO coin_events
      (experiment_id, round_number, participant_code, actor_type, amount, reason, ref_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const idea of totals) {
    const reward = Math.round(Number(idea.invested || 0) * 0.2);
    if (reward <= 0) continue;
    addParticipantCoins.run(reward, idea.participant_code);
    addEvent.run(
      experiment.id,
      experiment.current_round,
      idea.participant_code,
      'participant',
      reward,
      'idea_support_reward',
      String(idea.id),
      timestamp,
    );
  }

  const authorBonuses = [60, 40, 30];
  selected.forEach((idea, index) => {
    const reward = authorBonuses[index];
    addParticipantCoins.run(reward, idea.participant_code);
    addEvent.run(
      experiment.id,
      experiment.current_round,
      idea.participant_code,
      'participant',
      reward,
      'idea_rank_bonus',
      String(idea.id),
      timestamp,
    );
  });

  const selectedRank = new Map(selected.map((idea, index) => [Number(idea.id), index + 1]));
  const returnMultipliers = [0, 1.8, 1.5, 1.3];
  const investments = db
    .prepare(`SELECT * FROM investments WHERE experiment_id = ? AND round_number = ?`)
    .all(experiment.id, experiment.current_round) as any[];
  for (const investment of investments) {
    const rank = selectedRank.get(Number(investment.comment_id)) || 0;
    const multiplier = rank > 0 ? returnMultipliers[rank] : 0.5;
    const returned = Math.round(Number(investment.amount) * multiplier);
    const isCreator = investment.actor_type === 'creator' || investment.participant_code === 'CREATOR';
    if (isCreator) {
      addCreatorCoins.run(returned, timestamp, experiment.id);
    } else {
      addParticipantCoins.run(returned, investment.participant_code);
    }
    addEvent.run(
      experiment.id,
      experiment.current_round,
      isCreator ? null : investment.participant_code,
      isCreator ? 'creator' : 'participant',
      returned,
      'investment_return',
      String(investment.id),
      timestamp,
    );
  }

  db.prepare(`
    UPDATE rounds SET investment_settled_v3 = 1, updated_at = ?
    WHERE experiment_id = ? AND round_number = ?
  `).run(timestamp, experiment.id, experiment.current_round);
}

function reverseRoundSettlement(experiment: any) {
  const round = db
    .prepare(`SELECT investment_settled_v3 FROM rounds WHERE experiment_id = ? AND round_number = ?`)
    .get(experiment.id, experiment.current_round) as any;
  if (Number(round?.investment_settled_v3 || 0) !== 1) return;

  const balances = db
    .prepare(`
      SELECT participant_code, actor_type, reason, ref_id, COALESCE(SUM(amount), 0) AS amount
      FROM coin_events
      WHERE experiment_id = ? AND round_number = ?
        AND reason IN ('idea_support_reward', 'idea_rank_bonus', 'investment_return')
      GROUP BY participant_code, actor_type, reason, ref_id
      HAVING COALESCE(SUM(amount), 0) != 0
    `)
    .all(experiment.id, experiment.current_round) as any[];
  const timestamp = now();
  const addEvent = db.prepare(`
    INSERT INTO coin_events
      (experiment_id, round_number, participant_code, actor_type, amount, reason, ref_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const balance of balances) {
    const amount = Number(balance.amount || 0);
    if (amount === 0) continue;
    if (balance.actor_type === 'creator') {
      db.prepare(`UPDATE experiments SET creator_coins = creator_coins - ?, updated_at = ? WHERE id = ?`).run(
        amount,
        timestamp,
        experiment.id,
      );
    } else {
      db.prepare(`UPDATE participants SET coins = coins - ? WHERE code = ?`).run(amount, balance.participant_code);
    }
    addEvent.run(
      experiment.id,
      experiment.current_round,
      balance.participant_code,
      balance.actor_type,
      -amount,
      balance.reason,
      balance.ref_id,
      timestamp,
    );
  }
  db.prepare(`
    UPDATE rounds SET investment_settled_v3 = 0, updated_at = ?
    WHERE experiment_id = ? AND round_number = ?
  `).run(timestamp, experiment.id, experiment.current_round);
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
      WHERE c.experiment_id = ? AND c.round_number = ? AND c.deleted_at IS NULL
      GROUP BY c.id
      ORDER BY investor_count DESC, c.created_at ASC, c.id ASC
    `)
    .all(experiment.id, experiment.current_round) as any[];

  if (totals.length < 3) throw new Error('At least three ideas are required before the voting result can be locked.');
  const rankScores = totals.slice(0, 3).map((comment) => Number(comment.investor_count || 0));
  const relevantScores = new Set(rankScores);
  const tieComments = totals.filter((comment) => relevantScores.has(Number(comment.investor_count || 0)));
  const hasRelevantTie = [...relevantScores].some(
    (score) => totals.filter((comment) => Number(comment.investor_count || 0) === score).length > 1,
  );

  if ((!commentIds || commentIds.length === 0) && hasRelevantTie) {
    db.prepare(`
      UPDATE rounds SET investment_locked_v3 = 1, updated_at = ?
      WHERE experiment_id = ? AND round_number = ?
    `).run(now(), experiment.id, experiment.current_round);
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
      if (!comment || Number(comment.investor_count || 0) !== rankScores[index]) {
        throw new Error('Creator may only reorder or choose ideas tied at that ranking position.');
      }
      return comment;
    });
  }
  const weights = [0.6, 0.2, 0.2];

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE rounds SET investment_locked_v3 = 1, updated_at = ?
      WHERE experiment_id = ? AND round_number = ?
    `).run(now(), experiment.id, experiment.current_round);
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
    settleRoundInvestments(experiment, selected, totals);
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
      db.prepare(`
        UPDATE rounds SET investment_locked_v3 = 0, updated_at = ?
        WHERE experiment_id = ? AND round_number = ?
      `).run(now(), experiment.id, experiment.current_round);
    } else if (fromPhase === 'developing') {
      toPhase = 'investing';
      reverseRoundSettlement(experiment);
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
      db.prepare(`
        UPDATE rounds SET investment_locked_v3 = 0, updated_at = ?
        WHERE experiment_id = ? AND round_number = ?
      `).run(now(), experiment.id, experiment.current_round);
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
      snapshotParticipants(experiment.id);
      db.prepare(`DELETE FROM participant_sessions WHERE experiment_id = ?`).run(experiment.id);
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
