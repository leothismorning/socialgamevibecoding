import { randomInt, randomUUID } from 'node:crypto';
import { db, getAIProvider, type StudyAIProvider } from './studyDb.js';

export type GalleryRole = 'host' | 'creator' | 'contributor';
export type GalleryStatus =
  | 'preparing'
  | 'round_active'
  | 'round_processing'
  | 'round_review'
  | 'final_voting'
  | 'ended';

export type GalleryViewer = {
  clientId: string;
  role: GalleryRole;
  code: string;
};

const LEGACY_STUDY_ID = 'gallery_v2_main';
const ACTIVE_STUDY_SETTING = 'active_study_id';
let STUDY_ID = LEGACY_STUDY_ID;
const CREATOR_COUNT = 3;
const CONTRIBUTOR_COUNT = 20;
const ROUND_ONE_DURATION_SECONDS = 15 * 60;
const LATER_ROUND_DURATION_SECONDS = 10 * 60;
const now = () => new Date().toISOString();

db.exec(`
  CREATE TABLE IF NOT EXISTS gallery_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gallery_studies (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'preparing',
    current_round INTEGER NOT NULL DEFAULT 0,
    round_duration_seconds INTEGER NOT NULL DEFAULT 900,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    final_voting_started_at TEXT,
    ended_at TEXT
  );

  CREATE TABLE IF NOT EXISTS gallery_sessions (
    study_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    role TEXT NOT NULL,
    code TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY (study_id, client_id)
  );

  CREATE TABLE IF NOT EXISTS gallery_apps (
    id TEXT PRIMARY KEY,
    study_id TEXT NOT NULL,
    creator_code TEXT NOT NULL,
    title TEXT NOT NULL,
    brief TEXT NOT NULL DEFAULT '',
    creator_prompt TEXT NOT NULL DEFAULT '',
    draft_code TEXT NOT NULL DEFAULT '',
    draft_summary TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    initial_version_id INTEGER,
    current_version_id INTEGER,
    final_version_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT,
    UNIQUE (study_id, creator_code)
  );

  CREATE TABLE IF NOT EXISTS gallery_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    round_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    code TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    source_comment_id INTEGER,
    created_at TEXT NOT NULL,
    UNIQUE (app_id, version_number)
  );

  CREATE TABLE IF NOT EXISTS gallery_development_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gallery_app_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    voter_code TEXT NOT NULL,
    stage TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (study_id, app_id, voter_code, stage)
  );

  CREATE TABLE IF NOT EXISTS gallery_rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    status TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    locked_at TEXT,
    completed_at TEXT,
    UNIQUE (study_id, round_number)
  );

  CREATE TABLE IF NOT EXISTS gallery_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    author_code TEXT NOT NULL,
    parent_comment_id INTEGER,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS gallery_comment_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    comment_id INTEGER NOT NULL,
    voter_code TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (study_id, comment_id, voter_code)
  );

  CREATE TABLE IF NOT EXISTS gallery_lottery_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    selected_comment_id INTEGER,
    total_weight INTEGER NOT NULL DEFAULT 0,
    random_roll INTEGER,
    weights_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    UNIQUE (study_id, app_id, round_number)
  );

  CREATE TABLE IF NOT EXISTS gallery_generation_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    selected_comment_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    started_at TEXT,
    completed_at TEXT,
    UNIQUE (study_id, app_id, round_number)
  );

  CREATE TABLE IF NOT EXISTS gallery_round_openings (
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    opened_at TEXT NOT NULL,
    opened_by TEXT NOT NULL,
    PRIMARY KEY (study_id, app_id, round_number)
  );
`);

function migrateGallerySessionsToSharedCodes() {
  const table = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'gallery_sessions'
  `).get() as { sql?: string } | undefined;
  if (!/UNIQUE\s*\(\s*study_id\s*,\s*code\s*\)/i.test(table?.sql || '')) return;

  db.transaction(() => {
    db.exec(`
      ALTER TABLE gallery_sessions RENAME TO gallery_sessions_with_unique_code;

      CREATE TABLE gallery_sessions (
        study_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        role TEXT NOT NULL,
        code TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        PRIMARY KEY (study_id, client_id)
      );

      INSERT INTO gallery_sessions (study_id, client_id, role, code, joined_at, last_seen_at)
      SELECT study_id, client_id, role, code, joined_at, last_seen_at
      FROM gallery_sessions_with_unique_code;

      DROP TABLE gallery_sessions_with_unique_code;
    `);
  })();
}

migrateGallerySessionsToSharedCodes();

function migrateGalleryCommentsToReplies() {
  const columns = db.prepare(`PRAGMA table_info(gallery_comments)`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === 'parent_comment_id')) return;

  db.transaction(() => {
    db.exec(`
      ALTER TABLE gallery_comments RENAME TO gallery_comments_without_replies;

      CREATE TABLE gallery_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        study_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        round_number INTEGER NOT NULL,
        author_code TEXT NOT NULL,
        parent_comment_id INTEGER,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      INSERT INTO gallery_comments
        (id, study_id, app_id, round_number, author_code, parent_comment_id, content, created_at, updated_at, deleted_at)
      SELECT id, study_id, app_id, round_number, author_code, NULL, content, created_at, updated_at, deleted_at
      FROM gallery_comments_without_replies;

      DROP TABLE gallery_comments_without_replies;

      CREATE UNIQUE INDEX gallery_comments_top_level_unique
      ON gallery_comments (study_id, app_id, round_number, author_code)
      WHERE parent_comment_id IS NULL;

      CREATE UNIQUE INDEX gallery_comments_reply_unique
      ON gallery_comments (study_id, app_id, round_number, author_code)
      WHERE parent_comment_id IS NOT NULL;
    `);
  })();
}

migrateGalleryCommentsToReplies();
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS gallery_comments_top_level_unique
  ON gallery_comments (study_id, app_id, round_number, author_code)
  WHERE parent_comment_id IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS gallery_comments_reply_unique
  ON gallery_comments (study_id, app_id, round_number, author_code)
  WHERE parent_comment_id IS NOT NULL;
`);

const activeStudySetting = db.prepare(`SELECT value FROM gallery_settings WHERE key = ?`).get(
  ACTIVE_STUDY_SETTING,
) as { value?: string } | undefined;
if (activeStudySetting?.value) {
  STUDY_ID = activeStudySetting.value;
} else {
  db.prepare(`INSERT INTO gallery_settings (key, value, updated_at) VALUES (?, ?, ?)`).run(
    ACTIVE_STUDY_SETTING,
    STUDY_ID,
    now(),
  );
}

export function galleryRoundDurationSeconds(roundNumber = 1) {
  const milliseconds = Number(process.env.GALLERY_ROUND_DURATION_MS || 0);
  if (Number.isFinite(milliseconds) && milliseconds > 0) return Math.max(1, Math.ceil(milliseconds / 1000));
  return roundNumber === 1 ? ROUND_ONE_DURATION_SECONDS : LATER_ROUND_DURATION_SECONDS;
}

function ensureStudy() {
  const timestamp = now();
  db.prepare(`
    INSERT OR IGNORE INTO gallery_studies
      (id, status, current_round, round_duration_seconds, created_at, updated_at)
    VALUES (?, 'preparing', 0, ?, ?, ?)
  `).run(STUDY_ID, galleryRoundDurationSeconds(), timestamp, timestamp);
  return db.prepare(`SELECT * FROM gallery_studies WHERE id = ?`).get(STUDY_ID) as any;
}

ensureStudy();

function study() {
  return ensureStudy();
}

function sessionForClient(clientId: string) {
  return db.prepare(`
    SELECT * FROM gallery_sessions WHERE study_id = ? AND client_id = ?
  `).get(STUDY_ID, clientId.trim()) as any;
}

function requireSession(clientId: string, role?: GalleryRole): GalleryViewer {
  const session = sessionForClient(clientId);
  if (!session) throw new Error('Choose a gallery role before continuing.');
  if (role && session.role !== role) throw new Error(`This action requires the ${role} role.`);
  db.prepare(`UPDATE gallery_sessions SET last_seen_at = ? WHERE study_id = ? AND client_id = ?`).run(
    now(),
    STUDY_ID,
    clientId.trim(),
  );
  return { clientId: session.client_id, role: session.role, code: session.code };
}

function codeRange(role: GalleryRole) {
  const prefix = role === 'host' ? 'H' : role === 'creator' ? 'C' : 'P';
  const count = role === 'host' ? 1 : role === 'creator' ? CREATOR_COUNT : CONTRIBUTOR_COUNT;
  return Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(2, '0')}`);
}

export function joinGallery(clientId: string, role: GalleryRole, requestedCode: string) {
  const cleanClientId = clientId.trim();
  const cleanCode = requestedCode.trim().toUpperCase();
  if (!cleanClientId || cleanClientId.length > 160) throw new Error('A valid browser-tab session is required.');
  if (role !== 'host' && role !== 'creator' && role !== 'contributor') {
    throw new Error('Role must be Host, Creator, or Contributor.');
  }
  if (!codeRange(role).includes(cleanCode)) {
    throw new Error(`Choose a valid ${role} identity number.`);
  }

  if (role === 'contributor' && publishedApps().length < CREATOR_COUNT) {
    throw new Error('Contributors can enter after all three Creators publish their Apps.');
  }

  const existing = sessionForClient(cleanClientId);
  if (existing) {
    if (existing.role !== role) throw new Error(`This tab is already registered as ${existing.role}.`);
    return getGalleryState(cleanClientId);
  }

  const timestamp = now();
  db.prepare(`
    INSERT INTO gallery_sessions (study_id, client_id, role, code, joined_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(STUDY_ID, cleanClientId, role, cleanCode, timestamp, timestamp);
  return getGalleryState(cleanClientId);
}

export function getGalleryViewer(clientId = ''): GalleryViewer | null {
  const session = clientId ? sessionForClient(clientId) : null;
  return session ? { clientId: session.client_id, role: session.role, code: session.code } : null;
}

export function saveCreatorDraft(input: {
  clientId: string;
  title: string;
  brief: string;
  creatorPrompt: string;
  code: string;
  summary: string;
  creatorMessage?: string;
  assistantMessage?: string;
}) {
  const viewer = requireSession(input.clientId, 'creator');
  const currentStudy = study();
  if (currentStudy.status !== 'preparing') throw new Error('Creator development is locked after the formal game starts.');
  const title = input.title.trim();
  const code = input.code.trim();
  if (!title) throw new Error('App title is required.');
  if (!code) throw new Error('A complete HTML App is required.');

  const existing = db.prepare(`SELECT * FROM gallery_apps WHERE study_id = ? AND creator_code = ?`).get(
    STUDY_ID,
    viewer.code,
  ) as any;
  const timestamp = now();
  const appId = existing?.id || `app_${randomUUID()}`;
  if (existing) {
    db.prepare(`
      UPDATE gallery_apps
      SET title = ?, brief = ?, creator_prompt = ?, draft_code = ?, draft_summary = ?, status = 'draft', updated_at = ?
      WHERE id = ?
    `).run(title, input.brief.trim(), input.creatorPrompt.trim(), code, input.summary.trim(), timestamp, appId);
  } else {
    db.prepare(`
      INSERT INTO gallery_apps
        (id, study_id, creator_code, title, brief, creator_prompt, draft_code, draft_summary, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
    `).run(
      appId,
      STUDY_ID,
      viewer.code,
      title,
      input.brief.trim(),
      input.creatorPrompt.trim(),
      code,
      input.summary.trim(),
      timestamp,
      timestamp,
    );
  }

  if (input.creatorMessage?.trim()) {
    db.prepare(`
      INSERT INTO gallery_development_messages (study_id, app_id, role, content, created_at)
      VALUES (?, ?, 'creator', ?, ?)
    `).run(STUDY_ID, appId, input.creatorMessage.trim(), timestamp);
  }
  if (input.assistantMessage?.trim()) {
    db.prepare(`
      INSERT INTO gallery_development_messages (study_id, app_id, role, content, created_at)
      VALUES (?, ?, 'assistant', ?, ?)
    `).run(STUDY_ID, appId, input.assistantMessage.trim(), timestamp);
  }
  return getGalleryState(input.clientId);
}

export function publishCreatorApp(clientId: string) {
  const viewer = requireSession(clientId, 'creator');
  const currentStudy = study();
  if (currentStudy.status !== 'preparing') throw new Error('Apps can only be published before the formal game starts.');
  const app = db.prepare(`SELECT * FROM gallery_apps WHERE study_id = ? AND creator_code = ?`).get(
    STUDY_ID,
    viewer.code,
  ) as any;
  if (!app?.draft_code) throw new Error('Generate or upload an App before publishing.');
  const timestamp = now();
  const tx = db.transaction(() => {
    let initialVersionId = Number(app.initial_version_id || 0);
    if (initialVersionId) {
      db.prepare(`
        UPDATE gallery_versions SET title = ?, code = ?, summary = ?, created_at = ? WHERE id = ?
      `).run(`${app.title} · Initial`, app.draft_code, app.draft_summary, timestamp, initialVersionId);
    } else {
      const inserted = db.prepare(`
        INSERT INTO gallery_versions
          (study_id, app_id, version_number, round_number, title, code, summary, created_at)
        VALUES (?, ?, 0, 0, ?, ?, ?, ?)
      `).run(STUDY_ID, app.id, `${app.title} · Initial`, app.draft_code, app.draft_summary, timestamp);
      initialVersionId = Number(inserted.lastInsertRowid);
    }
    db.prepare(`
      UPDATE gallery_apps
      SET status = 'published', initial_version_id = ?, current_version_id = ?, published_at = COALESCE(published_at, ?), updated_at = ?
      WHERE id = ?
    `).run(initialVersionId, initialVersionId, timestamp, timestamp, app.id);
  });
  tx();
  return getGalleryState(clientId);
}

function publishedApps() {
  return db.prepare(`
    SELECT * FROM gallery_apps WHERE study_id = ? AND status = 'published' ORDER BY creator_code
  `).all(STUDY_ID) as any[];
}

function requireHost(clientId: string) {
  return requireSession(clientId, 'host');
}

function requireGalleryParticipant(clientId: string) {
  const viewer = requireSession(clientId);
  if (viewer.role === 'host') {
    throw new Error('The Host only controls the experiment flow and cannot comment or like.');
  }
  return viewer;
}

function startRound(roundNumber: number) {
  const durationSeconds = galleryRoundDurationSeconds(roundNumber);
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + durationSeconds * 1000);
  db.prepare(`
    INSERT INTO gallery_rounds (study_id, round_number, status, starts_at, ends_at)
    VALUES (?, ?, 'active', ?, ?)
  `).run(STUDY_ID, roundNumber, startsAt.toISOString(), endsAt.toISOString());
  db.prepare(`
    UPDATE gallery_studies
    SET status = 'round_active', current_round = ?, round_duration_seconds = ?, updated_at = ?
    WHERE id = ?
  `).run(roundNumber, durationSeconds, now(), STUDY_ID);
}

export function startFormalGalleryGame(clientId: string) {
  requireHost(clientId);
  const currentStudy = study();
  if (currentStudy.status !== 'preparing') throw new Error('The formal game has already started.');
  if (publishedApps().length !== CREATOR_COUNT) throw new Error('All three Creators must publish one App before starting.');
  startRound(1);
  return getGalleryState(clientId);
}

export function startNextGalleryRound(clientId: string) {
  requireHost(clientId);
  const currentStudy = study();
  if (currentStudy.status !== 'round_review') throw new Error('Wait for every App update before starting the next round.');
  if (Number(currentStudy.current_round) >= 3) throw new Error('All three rounds are complete.');
  const nextRound = Number(currentStudy.current_round) + 1;
  const opened = db.prepare(`
    SELECT COUNT(*) AS count FROM gallery_round_openings
    WHERE study_id = ? AND round_number = ?
  `).get(STUDY_ID, nextRound) as any;
  if (Number(opened.count) !== publishedApps().length) {
    throw new Error('Open next-round comments for all three Apps before starting the countdown.');
  }
  startRound(nextRound);
  return getGalleryState(clientId);
}

export function openNextRoundComments(clientId: string, appId: string) {
  const host = requireHost(clientId);
  const currentStudy = study();
  if (!['round_processing', 'round_review'].includes(currentStudy.status)) {
    throw new Error('Next-round comments can only be opened after the lottery.');
  }
  if (Number(currentStudy.current_round) >= 3) throw new Error('There is no comment phase after round three.');
  const app = db.prepare(`
    SELECT id FROM gallery_apps WHERE id = ? AND study_id = ? AND status = 'published'
  `).get(appId, STUDY_ID) as any;
  if (!app) throw new Error('App not found.');
  const job = db.prepare(`
    SELECT status FROM gallery_generation_jobs
    WHERE study_id = ? AND app_id = ? AND round_number = ?
  `).get(STUDY_ID, appId, currentStudy.current_round) as any;
  if (!job || !['completed', 'skipped'].includes(job.status)) {
    throw new Error('Wait for this App to finish development before opening its next comment phase.');
  }
  db.prepare(`
    INSERT OR IGNORE INTO gallery_round_openings
      (study_id, app_id, round_number, opened_at, opened_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(STUDY_ID, appId, Number(currentStudy.current_round) + 1, now(), host.code);
  return getGalleryState(clientId);
}

function interactionRoundForApp(appId: string) {
  const currentStudy = study();
  const app = db.prepare(`
    SELECT id FROM gallery_apps WHERE id = ? AND study_id = ? AND status = 'published'
  `).get(appId, STUDY_ID) as any;
  if (!app) throw new Error('App not found.');

  if (currentStudy.status === 'round_active') {
    const round = db.prepare(`
      SELECT * FROM gallery_rounds WHERE study_id = ? AND round_number = ?
    `).get(STUDY_ID, currentStudy.current_round) as any;
    if (!round || Date.now() >= Date.parse(round.ends_at)) {
      throw new Error('This round has ended and interactions are locked.');
    }
    return Number(currentStudy.current_round);
  }

  if (['round_processing', 'round_review'].includes(currentStudy.status) && Number(currentStudy.current_round) < 3) {
    const nextRound = Number(currentStudy.current_round) + 1;
    const opening = db.prepare(`
      SELECT 1 FROM gallery_round_openings WHERE study_id = ? AND app_id = ? AND round_number = ?
    `).get(STUDY_ID, appId, nextRound);
    if (opening) return nextRound;
  }
  throw new Error('Comments are not open for this App right now.');
}

export function saveGalleryComment(clientId: string, appId: string, content: string, parentCommentId?: number) {
  const viewer = requireGalleryParticipant(clientId);
  const roundNumber = interactionRoundForApp(appId);
  const text = content.trim();
  if (!text) throw new Error('Comment cannot be empty.');
  if (text.length > 500) throw new Error('Comment must be 500 characters or fewer.');
  const timestamp = now();
  if (parentCommentId) {
    const parent = db.prepare(`
      SELECT * FROM gallery_comments
      WHERE id = ? AND study_id = ? AND app_id = ? AND round_number = ?
        AND parent_comment_id IS NULL AND deleted_at IS NULL
    `).get(parentCommentId, STUDY_ID, appId, roundNumber) as any;
    if (!parent) throw new Error('The original comment is not available in this comment phase.');
    if (parent.author_code === viewer.code) throw new Error('You cannot expand your own comment.');
    const existing = db.prepare(`
      SELECT id FROM gallery_comments
      WHERE study_id = ? AND app_id = ? AND round_number = ? AND author_code = ?
        AND parent_comment_id IS NOT NULL
    `).get(STUDY_ID, appId, roundNumber, viewer.code) as any;
    if (existing) {
      db.prepare(`
        UPDATE gallery_comments
        SET parent_comment_id = ?, content = ?, updated_at = ?, deleted_at = NULL
        WHERE id = ?
      `).run(parentCommentId, text, timestamp, existing.id);
    } else {
      db.prepare(`
        INSERT INTO gallery_comments
          (study_id, app_id, round_number, author_code, parent_comment_id, content, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(STUDY_ID, appId, roundNumber, viewer.code, parentCommentId, text, timestamp, timestamp);
    }
  } else {
    db.prepare(`
      INSERT INTO gallery_comments
        (study_id, app_id, round_number, author_code, parent_comment_id, content, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL)
      ON CONFLICT(study_id, app_id, round_number, author_code) WHERE parent_comment_id IS NULL
      DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at, deleted_at = NULL
    `).run(STUDY_ID, appId, roundNumber, viewer.code, text, timestamp, timestamp);
  }
  return getGalleryState(clientId);
}

export function deleteGalleryComment(clientId: string, appId: string, commentId?: number) {
  const viewer = requireGalleryParticipant(clientId);
  const roundNumber = interactionRoundForApp(appId);
  const timestamp = now();
  if (commentId) {
    db.prepare(`
      UPDATE gallery_comments SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND study_id = ? AND app_id = ? AND round_number = ? AND author_code = ?
        AND parent_comment_id IS NOT NULL
    `).run(timestamp, timestamp, commentId, STUDY_ID, appId, roundNumber, viewer.code);
  } else {
    const own = db.prepare(`
      SELECT id FROM gallery_comments
      WHERE study_id = ? AND app_id = ? AND round_number = ? AND author_code = ?
        AND parent_comment_id IS NULL AND deleted_at IS NULL
    `).get(STUDY_ID, appId, roundNumber, viewer.code) as any;
    if (own) {
      db.transaction(() => {
        db.prepare(`UPDATE gallery_comments SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(timestamp, timestamp, own.id);
        db.prepare(`
          UPDATE gallery_comments SET deleted_at = ?, updated_at = ?
          WHERE study_id = ? AND parent_comment_id = ? AND deleted_at IS NULL
        `).run(timestamp, timestamp, STUDY_ID, own.id);
      })();
    }
  }
  return getGalleryState(clientId);
}

export function toggleGalleryCommentLike(clientId: string, commentId: number) {
  const viewer = requireGalleryParticipant(clientId);
  const comment = db.prepare(`
    SELECT * FROM gallery_comments
    WHERE id = ? AND study_id = ? AND deleted_at IS NULL
  `).get(commentId, STUDY_ID) as any;
  if (!comment) throw new Error('Comment not found.');
  const interactionRound = interactionRoundForApp(String(comment.app_id));
  if (Number(comment.round_number) !== interactionRound) throw new Error('This comment phase is locked.');
  if (comment.author_code === viewer.code) throw new Error('You cannot like your own comment.');
  const existing = db.prepare(`
    SELECT id FROM gallery_comment_likes WHERE study_id = ? AND comment_id = ? AND voter_code = ?
  `).get(STUDY_ID, commentId, viewer.code) as any;
  if (existing) db.prepare(`DELETE FROM gallery_comment_likes WHERE id = ?`).run(existing.id);
  else {
    db.prepare(`
      INSERT INTO gallery_comment_likes (study_id, comment_id, voter_code, created_at) VALUES (?, ?, ?, ?)
    `).run(STUDY_ID, commentId, viewer.code, now());
  }
  return getGalleryState(clientId);
}

export function toggleGalleryAppLike(clientId: string, appId: string, stage: 'showcase' | 'final') {
  const viewer = requireGalleryParticipant(clientId);
  const currentStudy = study();
  const app = db.prepare(`SELECT * FROM gallery_apps WHERE id = ? AND study_id = ? AND status = 'published'`).get(
    appId,
    STUDY_ID,
  ) as any;
  if (!app) throw new Error('App not found.');
  if (viewer.role === 'creator' && app.creator_code === viewer.code) throw new Error('Creators cannot like their own App.');
  if (stage === 'final' && currentStudy.status !== 'final_voting') {
    throw new Error('Final-version likes are only open after round three.');
  }
  if (currentStudy.status === 'ended') throw new Error('This project is read-only.');
  const existing = db.prepare(`
    SELECT id FROM gallery_app_likes WHERE study_id = ? AND app_id = ? AND voter_code = ? AND stage = ?
  `).get(STUDY_ID, appId, viewer.code, stage) as any;
  if (existing) db.prepare(`DELETE FROM gallery_app_likes WHERE id = ?`).run(existing.id);
  else {
    db.prepare(`
      INSERT INTO gallery_app_likes (study_id, app_id, voter_code, stage, created_at) VALUES (?, ?, ?, ?, ?)
    `).run(STUDY_ID, appId, viewer.code, stage, now());
  }
  return getGalleryState(clientId);
}

type LotteryRandom = (exclusiveMax: number) => number;

export function lockExpiredGalleryRound(random: LotteryRandom = (max) => randomInt(max), force = false) {
  const currentStudy = study();
  if (currentStudy.status !== 'round_active') return false;
  const round = db.prepare(`
    SELECT * FROM gallery_rounds WHERE study_id = ? AND round_number = ?
  `).get(STUDY_ID, currentStudy.current_round) as any;
  if (!round || (!force && Date.now() < Date.parse(round.ends_at))) return false;
  const timestamp = now();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE gallery_rounds
      SET status = 'processing', locked_at = ?,
          ends_at = CASE WHEN ? = 1 THEN ? ELSE ends_at END
      WHERE id = ?
    `).run(timestamp, force ? 1 : 0, timestamp, round.id);
    db.prepare(`UPDATE gallery_studies SET status = 'round_processing', updated_at = ? WHERE id = ?`).run(
      timestamp,
      STUDY_ID,
    );

    for (const app of publishedApps()) {
      const comments = db.prepare(`
        SELECT c.*, COUNT(l.id) AS like_count
        FROM gallery_comments c
        LEFT JOIN gallery_comment_likes l ON l.comment_id = c.id
        WHERE c.study_id = ? AND c.app_id = ? AND c.round_number = ? AND c.deleted_at IS NULL
        GROUP BY c.id
        ORDER BY c.id
      `).all(STUDY_ID, app.id, currentStudy.current_round) as any[];
      const weights = comments.map((comment) => ({
        commentId: Number(comment.id),
        likes: Number(comment.like_count || 0),
        weight: Number(comment.like_count || 0) + 1,
      }));
      const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
      const roll = totalWeight > 0 ? Math.min(totalWeight - 1, Math.max(0, random(totalWeight))) : null;
      let selectedCommentId: number | null = null;
      if (roll !== null) {
        let cursor = 0;
        for (const item of weights) {
          cursor += item.weight;
          if (roll < cursor) {
            selectedCommentId = item.commentId;
            break;
          }
        }
      }
      db.prepare(`
        INSERT INTO gallery_lottery_results
          (study_id, app_id, round_number, selected_comment_id, total_weight, random_roll, weights_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        STUDY_ID,
        app.id,
        currentStudy.current_round,
        selectedCommentId,
        totalWeight,
        roll,
        JSON.stringify(weights),
        timestamp,
      );
      db.prepare(`
        INSERT INTO gallery_generation_jobs
          (study_id, app_id, round_number, selected_comment_id, status, attempts)
        VALUES (?, ?, ?, ?, ?, 0)
      `).run(
        STUDY_ID,
        app.id,
        currentStudy.current_round,
        selectedCommentId,
        selectedCommentId ? 'pending' : 'skipped',
      );
    }
  });
  tx();
  finalizeGalleryRoundIfReady();
  return true;
}

export function endGalleryRoundEarly(
  clientId: string,
  random: LotteryRandom = (max) => randomInt(max),
) {
  requireHost(clientId);
  const currentStudy = study();
  if (currentStudy.status !== 'round_active') {
    throw new Error('Only an active countdown can be ended early.');
  }
  if (!lockExpiredGalleryRound(random, true)) {
    throw new Error('The current round could not be ended.');
  }
  return getGalleryState(clientId);
}

export function nextGalleryGenerationJob(jobId?: number) {
  const job = db.prepare(`
    SELECT j.*, a.title AS app_title, a.brief AS app_brief, a.current_version_id,
           a.creator_code AS app_creator_code,
           c.content AS selected_comment, c.author_code AS selected_author,
           c.parent_comment_id AS selected_parent_comment_id,
           parent.content AS selected_parent_comment, parent.author_code AS selected_parent_author,
           v.code AS current_code
    FROM gallery_generation_jobs j
    JOIN gallery_apps a ON a.id = j.app_id
    JOIN gallery_comments c ON c.id = j.selected_comment_id
    LEFT JOIN gallery_comments parent ON parent.id = c.parent_comment_id
    JOIN gallery_versions v ON v.id = (
      SELECT base.id
      FROM gallery_versions base
      WHERE base.study_id = j.study_id
        AND base.app_id = j.app_id
        AND base.round_number < j.round_number
      ORDER BY base.round_number DESC, base.version_number DESC, base.id DESC
      LIMIT 1
    )
    WHERE j.study_id = ? AND j.status = 'pending'
      AND (? IS NULL OR j.id = ?)
    ORDER BY j.id
    LIMIT 1
  `).get(STUDY_ID, jobId ?? null, jobId ?? null) as any;
  if (!job) return null;
  db.prepare(`
    UPDATE gallery_generation_jobs
    SET status = 'running', attempts = attempts + 1, started_at = ?, error = NULL
    WHERE id = ? AND status = 'pending'
  `).run(now(), job.id);
  return { ...job, attempts: Number(job.attempts || 0) + 1 };
}

export function completeGalleryGenerationJob(jobId: number, code: string, summary: string) {
  const job = db.prepare(`SELECT * FROM gallery_generation_jobs WHERE id = ?`).get(jobId) as any;
  if (!job || job.status !== 'running') throw new Error('Generation job is no longer active.');
  const app = db.prepare(`SELECT * FROM gallery_apps WHERE id = ?`).get(job.app_id) as any;
  const nextVersion = Number(
    (db.prepare(`SELECT COALESCE(MAX(version_number), 0) AS value FROM gallery_versions WHERE app_id = ?`).get(app.id) as any)
      .value,
  ) + 1;
  const timestamp = now();
  const tx = db.transaction(() => {
    const inserted = db.prepare(`
      INSERT INTO gallery_versions
        (study_id, app_id, version_number, round_number, title, code, summary, source_comment_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      STUDY_ID,
      app.id,
      nextVersion,
      job.round_number,
      `${app.title} · Round ${job.round_number}`,
      code,
      summary,
      job.selected_comment_id,
      timestamp,
    );
    db.prepare(`UPDATE gallery_apps SET current_version_id = ?, updated_at = ? WHERE id = ?`).run(
      Number(inserted.lastInsertRowid),
      timestamp,
      app.id,
    );
    db.prepare(`
      UPDATE gallery_generation_jobs SET status = 'completed', completed_at = ?, error = NULL WHERE id = ?
    `).run(timestamp, jobId);
  });
  tx();
  finalizeGalleryRoundIfReady();
}

export function failGalleryGenerationJob(jobId: number, error: unknown) {
  const job = db.prepare(`SELECT * FROM gallery_generation_jobs WHERE id = ?`).get(jobId) as any;
  if (!job) return;
  if (job.status === 'cancelled') {
    finalizeGalleryRoundIfReady();
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  const nextStatus = Number(job.attempts || 0) >= 3 ? 'failed' : 'pending';
  db.prepare(`
    UPDATE gallery_generation_jobs SET status = ?, error = ?, completed_at = ? WHERE id = ?
  `).run(nextStatus, message.slice(0, 1000), nextStatus === 'failed' ? now() : null, jobId);
  finalizeGalleryRoundIfReady();
}

export function cancelGalleryGenerationJob(clientId: string, jobId: number) {
  const viewer = requireHost(clientId);
  const currentStudy = study();
  if (currentStudy.status !== 'round_processing') {
    throw new Error('AI tasks can only be stopped while the current round is processing.');
  }
  const job = db.prepare(`
    SELECT j.*, a.creator_code AS app_creator_code, a.title AS app_title
    FROM gallery_generation_jobs j
    JOIN gallery_apps a ON a.id = j.app_id
    WHERE j.id = ? AND j.study_id = ?
  `).get(jobId, STUDY_ID) as any;
  if (!job) throw new Error('Generation job not found.');
  if (Number(job.round_number) !== Number(currentStudy.current_round)) {
    throw new Error('Only the current round AI tasks can be stopped.');
  }
  if (!['pending', 'running'].includes(String(job.status))) {
    throw new Error('This AI task has already finished.');
  }
  db.prepare(`
    UPDATE gallery_generation_jobs
    SET status = 'cancelled', error = ?, completed_at = ?
    WHERE id = ?
  `).run(`Stopped by ${viewer.code}.`, now(), jobId);
  finalizeGalleryRoundIfReady();
  return getGalleryState(clientId);
}

export function redevelopGalleryGenerationJob(clientId: string, jobId: number) {
  requireHost(clientId);
  const currentStudy = study();
  if (!['round_processing', 'round_review'].includes(String(currentStudy.status))) {
    throw new Error('Redevelopment is only available before the next round starts.');
  }
  const job = db.prepare(`
    SELECT j.*, a.title AS app_title
    FROM gallery_generation_jobs j
    JOIN gallery_apps a ON a.id = j.app_id
    WHERE j.id = ? AND j.study_id = ?
  `).get(jobId, STUDY_ID) as any;
  if (!job) throw new Error('Generation job not found.');
  if (Number(job.round_number) !== Number(currentStudy.current_round)) {
    throw new Error('The next round has already started; this result is locked.');
  }
  if (['pending', 'running'].includes(String(job.status))) {
    throw new Error('Stop the active AI task before requesting redevelopment.');
  }
  if (!job.selected_comment_id) {
    throw new Error('This App did not select a comment in the current round.');
  }
  const nextRoundOpening = db.prepare(`
    SELECT 1 FROM gallery_round_openings
    WHERE study_id = ? AND app_id = ? AND round_number = ?
  `).get(STUDY_ID, job.app_id, Number(job.round_number) + 1);
  if (nextRoundOpening) {
    throw new Error('This App has already entered the next comment phase and can no longer be redeveloped.');
  }

  const timestamp = now();
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE gallery_generation_jobs
      SET status = 'pending', attempts = 0, error = NULL,
          started_at = NULL, completed_at = NULL
      WHERE id = ?
    `).run(jobId);
    db.prepare(`
      UPDATE gallery_rounds
      SET status = 'processing', completed_at = NULL
      WHERE study_id = ? AND round_number = ?
    `).run(STUDY_ID, currentStudy.current_round);
    db.prepare(`
      UPDATE gallery_studies
      SET status = 'round_processing', updated_at = ?
      WHERE id = ?
    `).run(timestamp, STUDY_ID);
  });
  tx();
  return getGalleryState(clientId);
}

export function retryGalleryGenerationJob(clientId: string, jobId: number) {
  requireHost(clientId);
  const job = db.prepare(`SELECT * FROM gallery_generation_jobs WHERE id = ? AND study_id = ?`).get(jobId, STUDY_ID) as any;
  if (!job || job.status !== 'failed') throw new Error('Only failed generation jobs can be retried.');
  return redevelopGalleryGenerationJob(clientId, jobId);
}

export function finalizeGalleryRoundIfReady() {
  const currentStudy = study();
  if (currentStudy.status !== 'round_processing') return false;
  const unfinished = db.prepare(`
    SELECT COUNT(*) AS count FROM gallery_generation_jobs
    WHERE study_id = ? AND round_number = ? AND status IN ('pending', 'running')
  `).get(STUDY_ID, currentStudy.current_round) as any;
  if (Number(unfinished.count) > 0) return false;
  const timestamp = now();
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE gallery_rounds SET status = 'completed', completed_at = ?
      WHERE study_id = ? AND round_number = ?
    `).run(timestamp, STUDY_ID, currentStudy.current_round);
    if (Number(currentStudy.current_round) >= 3) {
      db.prepare(`
        UPDATE gallery_apps SET final_version_id = current_version_id, updated_at = ?
        WHERE study_id = ? AND status = 'published'
      `).run(timestamp, STUDY_ID);
      db.prepare(`
        UPDATE gallery_studies
        SET status = 'final_voting', final_voting_started_at = ?, updated_at = ? WHERE id = ?
      `).run(timestamp, timestamp, STUDY_ID);
    } else {
      db.prepare(`UPDATE gallery_studies SET status = 'round_review', updated_at = ? WHERE id = ?`).run(
        timestamp,
        STUDY_ID,
      );
    }
  });
  tx();
  return true;
}

export function endGalleryProject(clientId: string) {
  requireHost(clientId);
  const currentStudy = study();
  if (currentStudy.status !== 'final_voting') throw new Error('Final voting must be open before ending the project.');
  const timestamp = now();
  db.prepare(`UPDATE gallery_studies SET status = 'ended', ended_at = ?, updated_at = ? WHERE id = ?`).run(
    timestamp,
    timestamp,
    STUDY_ID,
  );
  return getGalleryState(clientId);
}

export function startNewGalleryExperiment(clientId: string) {
  const host = requireHost(clientId);
  const currentStudy = study();
  if (currentStudy.status !== 'ended') {
    throw new Error('The current experiment must be ended before starting a new one.');
  }

  const timestamp = now();
  const nextStudyId = `gallery_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO gallery_studies
        (id, status, current_round, round_duration_seconds, created_at, updated_at)
      VALUES (?, 'preparing', 0, ?, ?, ?)
    `).run(nextStudyId, galleryRoundDurationSeconds(), timestamp, timestamp);
    db.prepare(`
      INSERT INTO gallery_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(ACTIVE_STUDY_SETTING, nextStudyId, timestamp);
    db.prepare(`
      INSERT INTO gallery_sessions (study_id, client_id, role, code, joined_at, last_seen_at)
      VALUES (?, ?, 'host', 'H01', ?, ?)
    `).run(nextStudyId, host.clientId, timestamp, timestamp);
  });
  tx();
  STUDY_ID = nextStudyId;
  return getGalleryState(clientId);
}

export function getGalleryState(clientId = '') {
  const currentStudy = study();
  const viewer = getGalleryViewer(clientId);
  const viewerCode = viewer?.code || '';
  const apps = (db.prepare(`
    SELECT a.*,
      iv.code AS initial_code, iv.summary AS initial_summary,
      cv.code AS current_code, cv.summary AS current_summary, cv.version_number AS current_version_number,
      fv.code AS final_code, fv.summary AS final_summary,
      (SELECT COUNT(*) FROM gallery_app_likes l WHERE l.app_id = a.id AND l.stage = 'showcase') AS showcase_like_count,
      (SELECT COUNT(*) FROM gallery_app_likes l WHERE l.app_id = a.id AND l.stage = 'final') AS final_like_count,
      EXISTS(SELECT 1 FROM gallery_app_likes l WHERE l.app_id = a.id AND l.stage = 'showcase' AND l.voter_code = ?) AS viewer_showcase_liked,
      EXISTS(SELECT 1 FROM gallery_app_likes l WHERE l.app_id = a.id AND l.stage = 'final' AND l.voter_code = ?) AS viewer_final_liked
    FROM gallery_apps a
    LEFT JOIN gallery_versions iv ON iv.id = a.initial_version_id
    LEFT JOIN gallery_versions cv ON cv.id = a.current_version_id
    LEFT JOIN gallery_versions fv ON fv.id = a.final_version_id
    WHERE a.study_id = ?
    ORDER BY a.creator_code
  `).all(viewerCode, viewerCode, STUDY_ID) as any[])
    .filter((app) => app.status === 'published' || app.creator_code === viewerCode)
    .map((app) => {
      if (app.creator_code === viewerCode) return app;
      const { draft_code: _draftCode, draft_summary: _draftSummary, ...publicApp } = app;
      return publicApp;
    });

  const comments = db.prepare(`
    SELECT c.*,
      COUNT(l.id) AS like_count,
      EXISTS(SELECT 1 FROM gallery_comment_likes vl WHERE vl.comment_id = c.id AND vl.voter_code = ?) AS viewer_liked
    FROM gallery_comments c
    LEFT JOIN gallery_comment_likes l ON l.comment_id = c.id
    WHERE c.study_id = ? AND c.deleted_at IS NULL
    GROUP BY c.id
    ORDER BY c.round_number DESC, like_count DESC, c.created_at ASC
  `).all(viewerCode, STUDY_ID) as any[];

  const versions = db.prepare(`SELECT * FROM gallery_versions WHERE study_id = ? ORDER BY app_id, version_number`).all(
    STUDY_ID,
  );
  const rounds = db.prepare(`SELECT * FROM gallery_rounds WHERE study_id = ? ORDER BY round_number`).all(STUDY_ID);
  const lotteries = db.prepare(`
    SELECT r.*, c.content AS selected_comment, c.author_code AS selected_author,
      c.parent_comment_id AS selected_parent_comment_id,
      parent.content AS selected_parent_comment, parent.author_code AS selected_parent_author
    FROM gallery_lottery_results r
    LEFT JOIN gallery_comments c ON c.id = r.selected_comment_id
    LEFT JOIN gallery_comments parent ON parent.id = c.parent_comment_id
    WHERE r.study_id = ? ORDER BY r.round_number, r.app_id
  `).all(STUDY_ID);
  const generationJobs = db.prepare(`
    SELECT j.*, a.title AS app_title, a.creator_code AS app_creator_code FROM gallery_generation_jobs j
    JOIN gallery_apps a ON a.id = j.app_id
    WHERE j.study_id = ? ORDER BY j.round_number, j.id
  `).all(STUDY_ID);
  const sessions = db.prepare(`
    SELECT role, code, joined_at, last_seen_at FROM gallery_sessions WHERE study_id = ? ORDER BY code
  `).all(STUDY_ID);
  const roundOpenings = db.prepare(`
    SELECT * FROM gallery_round_openings WHERE study_id = ? ORDER BY round_number, app_id
  `).all(STUDY_ID);
  const developmentMessages = viewer?.role === 'creator'
    ? db.prepare(`
        SELECT m.* FROM gallery_development_messages m
        JOIN gallery_apps a ON a.id = m.app_id
        WHERE m.study_id = ? AND a.creator_code = ? ORDER BY m.id
      `).all(STUDY_ID, viewer.code)
    : [];

  return {
    study: currentStudy,
    viewer,
    apps,
    versions,
    rounds,
    comments,
    lotteries,
    generationJobs,
    roundOpenings,
    sessions,
    developmentMessages,
    aiProvider: getAIProvider() as StudyAIProvider,
    creatorCount: CREATOR_COUNT,
    publishedAppCount: publishedApps().length,
    serverNow: now(),
  };
}
