import { randomInt, randomUUID } from 'node:crypto';
import { db, getAIProvider } from './studyDb.js';
import type { DevelopmentAgentProgress } from './developmentAgent.js';

export type CommunityRole = 'host' | 'creator' | 'community';
export type CommunityCondition = 'control' | 'experimental';
export type CommunityStatus = 'setup' | 'active' | 'closed';
export type CommunitySourceType = 'comment' | 'synthesis';

const ACTIVE_STUDY_KEY = 'active_study_id';
const CREATOR_COUNT = 12;
const COMMUNITY_COUNT = 24;
const now = () => new Date().toISOString();

db.exec(`
  CREATE TABLE IF NOT EXISTS vg_async_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vg_async_studies (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'setup',
    workflow_stage TEXT NOT NULL DEFAULT 'synthesis_1',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    closed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS vg_async_participants (
    study_id TEXT NOT NULL,
    code TEXT NOT NULL,
    role TEXT NOT NULL,
    condition_name TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (study_id, code)
  );

  CREATE TABLE IF NOT EXISTS vg_async_sessions (
    study_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    participant_code TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    PRIMARY KEY (study_id, client_id)
  );

  CREATE TABLE IF NOT EXISTS vg_async_apps (
    id TEXT PRIMARY KEY,
    study_id TEXT NOT NULL,
    creator_code TEXT NOT NULL,
    condition_name TEXT NOT NULL,
    title TEXT NOT NULL,
    brief TEXT NOT NULL DEFAULT '',
    creator_prompt TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    initial_version_id INTEGER,
    community_version_id INTEGER,
    selected_synthesis_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT,
    community_published_at TEXT,
    UNIQUE (study_id, creator_code)
  );

  CREATE TABLE IF NOT EXISTS vg_async_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    code TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',
    synthesis_id INTEGER,
    base_version_id INTEGER,
    selection_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (app_id, version_number)
  );

  CREATE TABLE IF NOT EXISTS vg_async_drafts (
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',
    synthesis_id INTEGER,
    iteration_number INTEGER,
    base_version_id INTEGER,
    selection_reason TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (study_id, app_id)
  );

  CREATE TABLE IF NOT EXISTS vg_async_development_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vg_async_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    version_id INTEGER,
    target_type TEXT NOT NULL DEFAULT 'app',
    target_id TEXT NOT NULL,
    parent_comment_id INTEGER,
    author_code TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS vg_async_comment_likes (
    study_id TEXT NOT NULL,
    comment_id INTEGER NOT NULL,
    participant_code TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (study_id, comment_id, participant_code)
  );

  CREATE TABLE IF NOT EXISTS vg_async_app_likes (
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    participant_code TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (study_id, app_id, participant_code)
  );

  CREATE TABLE IF NOT EXISTS vg_async_basket_items (
    study_id TEXT NOT NULL,
    participant_code TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (study_id, participant_code, source_type, source_id)
  );

  CREATE TABLE IF NOT EXISTS vg_async_syntheses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    target_app_id TEXT NOT NULL,
    target_version_id INTEGER,
    layer INTEGER NOT NULL DEFAULT 1,
    author_code TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vg_async_synthesis_sources (
    study_id TEXT NOT NULL,
    synthesis_id INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    source_order INTEGER NOT NULL,
    contribution_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    PRIMARY KEY (synthesis_id, source_type, source_id)
  );

  CREATE TABLE IF NOT EXISTS vg_async_synthesis_votes (
    study_id TEXT NOT NULL,
    participant_code TEXT NOT NULL,
    target_app_id TEXT NOT NULL,
    layer INTEGER NOT NULL,
    withdrawn_synthesis_id INTEGER NOT NULL,
    synthesis_id INTEGER,
    created_at TEXT NOT NULL,
    voted_at TEXT,
    PRIMARY KEY (study_id, participant_code, target_app_id, layer)
  );

  CREATE TABLE IF NOT EXISTS vg_async_stage_selections (
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    iteration_number INTEGER NOT NULL,
    synthesis_id INTEGER NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    source_popularity_json TEXT NOT NULL DEFAULT '{}',
    selected_at TEXT NOT NULL,
    host_code TEXT NOT NULL,
    PRIMARY KEY (study_id, app_id, iteration_number)
  );

  CREATE TABLE IF NOT EXISTS vg_async_generation_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    synthesis_id INTEGER NOT NULL,
    iteration_number INTEGER NOT NULL DEFAULT 1,
    base_version_id INTEGER,
    selection_reason TEXT NOT NULL DEFAULT '',
    creator_instruction TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'running',
    error TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS vg_async_generation_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    job_id INTEGER NOT NULL,
    app_id TEXT NOT NULL,
    step_key TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (job_id, step_key)
  );

  CREATE TABLE IF NOT EXISTS vg_async_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    participant_code TEXT NOT NULL,
    type TEXT NOT NULL,
    app_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    synthesis_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source_count INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    read_at TEXT,
    celebrated_at TEXT,
    UNIQUE (study_id, participant_code, app_id, version_number, synthesis_id)
  );

  CREATE TABLE IF NOT EXISTS vg_async_assignments (
    study_id TEXT NOT NULL,
    participant_code TEXT NOT NULL,
    app_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    PRIMARY KEY (study_id, participant_code, app_id)
  );

  CREATE TABLE IF NOT EXISTS vg_async_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    participant_code TEXT,
    event_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    data_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_vg_async_apps_study_condition
    ON vg_async_apps (study_id, condition_name, status);
  CREATE INDEX IF NOT EXISTS idx_vg_async_comments_app
    ON vg_async_comments (study_id, app_id, target_type, target_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_vg_async_syntheses_app
    ON vg_async_syntheses (study_id, target_app_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_vg_async_synthesis_votes_app
    ON vg_async_synthesis_votes (study_id, target_app_id, layer, synthesis_id);
  CREATE INDEX IF NOT EXISTS idx_vg_async_events_study
    ON vg_async_events (study_id, event_type, created_at);
  CREATE INDEX IF NOT EXISTS idx_vg_async_notifications_participant
    ON vg_async_notifications (study_id, participant_code, created_at);
`);

const versionsDefinition = db.prepare(`
  SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vg_async_versions'
`).get() as { sql?: string } | undefined;
if (/UNIQUE\s*\(\s*app_id\s*,\s*kind\s*\)/i.test(versionsDefinition?.sql || '')) {
  db.exec(`
    BEGIN;
    CREATE TABLE vg_async_versions_next (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      study_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      code TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL DEFAULT '',
      synthesis_id INTEGER,
      base_version_id INTEGER,
      selection_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE (app_id, version_number)
    );
    INSERT INTO vg_async_versions_next
      (id, study_id, app_id, version_number, kind, title, code, summary, prompt, synthesis_id, created_at)
    SELECT id, study_id, app_id, version_number, kind, title, code, summary, prompt, synthesis_id, created_at
    FROM vg_async_versions;
    DROP TABLE vg_async_versions;
    ALTER TABLE vg_async_versions_next RENAME TO vg_async_versions;
    COMMIT;
  `);
}

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('vg_async_versions', 'base_version_id', 'INTEGER');
ensureColumn('vg_async_versions', 'selection_reason', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('vg_async_drafts', 'iteration_number', 'INTEGER');
ensureColumn('vg_async_drafts', 'base_version_id', 'INTEGER');
ensureColumn('vg_async_drafts', 'selection_reason', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('vg_async_generation_jobs', 'iteration_number', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('vg_async_generation_jobs', 'base_version_id', 'INTEGER');
ensureColumn('vg_async_generation_jobs', 'selection_reason', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('vg_async_studies', 'workflow_stage', `TEXT NOT NULL DEFAULT 'synthesis_1'`);
ensureColumn('vg_async_syntheses', 'layer', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('vg_async_syntheses', 'withdrawn_at', 'TEXT');
ensureColumn('vg_async_syntheses', 'withdrawn_for_vote', 'INTEGER NOT NULL DEFAULT 0');
db.exec(`
  UPDATE vg_async_syntheses
  SET layer = CASE
    WHEN target_version_id IN (
      SELECT id FROM vg_async_versions WHERE kind = 'community'
    ) THEN 2
    ELSE 1
  END
`);

const synthesisColumns = db.prepare(`PRAGMA table_info(vg_async_syntheses)`).all() as Array<{ name: string }>;
if (!synthesisColumns.some((column) => column.name === 'target_version_id')) {
  db.exec(`ALTER TABLE vg_async_syntheses ADD COLUMN target_version_id INTEGER`);
}

function seedParticipants(studyId: string) {
  const existing = db.prepare(`
    SELECT COUNT(*) AS count FROM vg_async_participants WHERE study_id = ?
  `).get(studyId) as { count: number };
  const fullySeeded = Number(existing.count) >= CREATOR_COUNT + COMMUNITY_COUNT + 1;

  const shuffled = (values: string[]) => {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const selected = randomInt(index + 1);
      [result[index], result[selected]] = [result[selected], result[index]];
    }
    return result;
  };
  const insert = db.prepare(`
    INSERT OR IGNORE INTO vg_async_participants
      (study_id, code, role, condition_name, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const timestamp = now();
  const creatorCodes = Array.from(
    { length: CREATOR_COUNT },
    (_, index) => `C${String(index + 1).padStart(2, '0')}`,
  );
  const communityCodes = Array.from(
    { length: COMMUNITY_COUNT },
    (_, index) => `P${String(index + 1).padStart(2, '0')}`,
  );
  const controlCreators = new Set(shuffled(creatorCodes).slice(0, CREATOR_COUNT / 2));
  const controlCommunity = new Set(shuffled(communityCodes).slice(0, COMMUNITY_COUNT / 2));
  if (!fullySeeded) {
    insert.run(studyId, 'H01', 'host', null, timestamp);
    creatorCodes.forEach((code) => {
      insert.run(
        studyId,
        code,
        'creator',
        controlCreators.has(code) ? 'control' : 'experimental',
        timestamp,
      );
    });
    communityCodes.forEach((code) => {
      insert.run(
        studyId,
        code,
        'community',
        controlCommunity.has(code) ? 'control' : 'experimental',
        timestamp,
      );
    });
  }

  const assignmentMarker = `balanced_random_assignment_v1:${studyId}`;
  const randomized = db.prepare(`
    SELECT value FROM vg_async_settings WHERE key = ?
  `).get(assignmentMarker) as { value?: string } | undefined;
  if (randomized?.value === '1') return;
  const appCount = db.prepare(`
    SELECT COUNT(*) AS count FROM vg_async_apps WHERE study_id = ?
  `).get(studyId) as { count: number };
  const transaction = db.transaction(() => {
    if (Number(appCount.count) === 0) {
      const update = db.prepare(`
        UPDATE vg_async_participants
        SET condition_name = ?
        WHERE study_id = ? AND code = ?
      `);
      creatorCodes.forEach((code) => {
        update.run(controlCreators.has(code) ? 'control' : 'experimental', studyId, code);
      });
      communityCodes.forEach((code) => {
        update.run(controlCommunity.has(code) ? 'control' : 'experimental', studyId, code);
      });
    }
    db.prepare(`
      INSERT INTO vg_async_settings (key, value, updated_at)
      VALUES (?, '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(assignmentMarker, timestamp);
  });
  transaction();
}

function createStudy() {
  const id = `async_${randomUUID()}`;
  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO vg_async_studies (id, status, created_at, updated_at)
      VALUES (?, 'setup', ?, ?)
    `).run(id, timestamp, timestamp);
    db.prepare(`
      INSERT INTO vg_async_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(ACTIVE_STUDY_KEY, id, timestamp);
  });
  transaction();
  seedParticipants(id);
  return id;
}

function activeStudyId() {
  const setting = db.prepare(`SELECT value FROM vg_async_settings WHERE key = ?`).get(
    ACTIVE_STUDY_KEY,
  ) as { value?: string } | undefined;
  if (setting?.value) {
    const exists = db.prepare(`SELECT 1 FROM vg_async_studies WHERE id = ?`).get(setting.value);
    if (exists) return setting.value;
  }
  return createStudy();
}

function study() {
  const studyId = activeStudyId();
  seedParticipants(studyId);
  return db.prepare(`SELECT * FROM vg_async_studies WHERE id = ?`).get(studyId) as any;
}

function participant(studyId: string, code: string) {
  return db.prepare(`
    SELECT * FROM vg_async_participants WHERE study_id = ? AND code = ?
  `).get(studyId, code) as any;
}

export function getCommunityViewer(clientId = '') {
  if (!clientId) return null;
  const currentStudy = study();
  return db.prepare(`
    SELECT s.client_id AS clientId, p.code, p.role, p.condition_name AS condition
    FROM vg_async_sessions s
    JOIN vg_async_participants p
      ON p.study_id = s.study_id AND p.code = s.participant_code
    WHERE s.study_id = ? AND s.client_id = ?
  `).get(currentStudy.id, clientId) as any || null;
}

function requireViewer(clientId: string, role?: CommunityRole) {
  const viewer = getCommunityViewer(clientId);
  if (!viewer) throw new Error('请先选择实验身份。');
  if (role && viewer.role !== role) throw new Error(`该操作需要 ${role} 身份。`);
  db.prepare(`
    UPDATE vg_async_sessions SET last_seen_at = ? WHERE study_id = ? AND client_id = ?
  `).run(now(), study().id, clientId);
  return viewer;
}

function requireParticipant(clientId: string) {
  const viewer = requireViewer(clientId);
  if (viewer.role === 'host') throw new Error('Host 不参与社区创作。');
  return viewer;
}

function requireOpenStudy() {
  const currentStudy = study();
  if (currentStudy.status === 'closed') throw new Error('研究已经结束，当前内容保持只读。');
  return currentStudy;
}

function recordEvent(
  participantCode: string | null,
  eventType: string,
  entityType?: string,
  entityId?: string | number,
  data?: Record<string, unknown>,
) {
  db.prepare(`
    INSERT INTO vg_async_events
      (study_id, participant_code, event_type, entity_type, entity_id, data_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    study().id,
    participantCode,
    eventType,
    entityType || null,
    entityId == null ? null : String(entityId),
    JSON.stringify(data || {}),
    now(),
  );
}

export function joinCommunityGallery(clientId: string, requestedCode: string) {
  const cleanClientId = clientId.trim();
  const cleanCode = requestedCode.trim().toUpperCase();
  if (!cleanClientId || cleanClientId.length > 160) throw new Error('缺少有效的浏览器会话。');
  const currentStudy = study();
  const selectedParticipant = participant(currentStudy.id, cleanCode);
  if (!selectedParticipant) throw new Error('请选择有效的参与者编号。');

  const existing = getCommunityViewer(cleanClientId);
  if (existing && existing.code !== cleanCode) throw new Error(`当前标签页已经使用 ${existing.code}。`);
  if (!existing) {
    const timestamp = now();
    db.prepare(`
      INSERT INTO vg_async_sessions
        (study_id, client_id, participant_code, joined_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(currentStudy.id, cleanClientId, cleanCode, timestamp, timestamp);
    recordEvent(cleanCode, 'join_study', 'participant', cleanCode);
  }
  return getCommunityGalleryState(cleanClientId);
}

function appById(appId: string) {
  return db.prepare(`
    SELECT * FROM vg_async_apps WHERE study_id = ? AND id = ?
  `).get(study().id, appId) as any;
}

function versionsForApp(appId: string) {
  return db.prepare(`
    SELECT * FROM vg_async_versions
    WHERE study_id = ? AND app_id = ?
    ORDER BY version_number
  `).all(study().id, appId) as any[];
}

function communityIterationCount(appId: string) {
  return versionsForApp(appId).filter((version) => version.kind === 'community').length;
}

function versionById(versionId: number) {
  return db.prepare(`
    SELECT * FROM vg_async_versions WHERE study_id = ? AND id = ?
  `).get(study().id, versionId) as any;
}

function accessibleApp(clientId: string, appId: string) {
  const viewer = requireViewer(clientId);
  const app = appById(appId);
  if (!app) throw new Error('App 不存在。');
  if (viewer.role === 'creator' && viewer.condition !== app.condition_name) {
    throw new Error('不能访问另一实验条件的 App。');
  }
  return { viewer, app };
}

function ownedApp(clientId: string, appId?: string) {
  const viewer = requireViewer(clientId, 'creator');
  const app = appId
    ? appById(appId)
    : db.prepare(`
        SELECT * FROM vg_async_apps WHERE study_id = ? AND creator_code = ?
      `).get(study().id, viewer.code) as any;
  if (!app || app.creator_code !== viewer.code) throw new Error('只有 App Creator 可以执行该操作。');
  return { viewer, app };
}

export function saveInitialDraft(input: {
  clientId: string;
  title: string;
  brief: string;
  prompt: string;
  code: string;
  summary: string;
}) {
  const viewer = requireViewer(input.clientId, 'creator');
  if (!input.title.trim()) throw new Error('请填写 App 名称。');
  if (!input.code.trim()) throw new Error('Initial Version 代码不能为空。');
  const currentStudy = study();
  if (currentStudy.status === 'closed') throw new Error('研究已经结束，不能继续创建 Initial Version。');
  const existing = db.prepare(`
    SELECT * FROM vg_async_apps WHERE study_id = ? AND creator_code = ?
  `).get(currentStudy.id, viewer.code) as any;
  if (existing?.initial_version_id) throw new Error('Initial Version 已经发布，不能覆盖。');
  const appId = existing?.id || randomUUID();
  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO vg_async_apps
        (id, study_id, creator_code, condition_name, title, brief, creator_prompt, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
      ON CONFLICT(study_id, creator_code) DO UPDATE SET
        title = excluded.title,
        brief = excluded.brief,
        creator_prompt = excluded.creator_prompt,
        updated_at = excluded.updated_at
    `).run(
      appId,
      currentStudy.id,
      viewer.code,
      viewer.condition,
      input.title.trim(),
      input.brief.trim(),
      input.prompt.trim(),
      timestamp,
      timestamp,
    );
    db.prepare(`
      INSERT INTO vg_async_drafts
        (study_id, app_id, kind, code, summary, prompt, updated_at)
      VALUES (?, ?, 'initial', ?, ?, ?, ?)
      ON CONFLICT(study_id, app_id) DO UPDATE SET
        kind = 'initial',
        code = excluded.code,
        summary = excluded.summary,
        prompt = excluded.prompt,
        synthesis_id = NULL,
        iteration_number = NULL,
        base_version_id = NULL,
        selection_reason = '',
        updated_at = excluded.updated_at
    `).run(currentStudy.id, appId, input.code, input.summary, input.prompt.trim(), timestamp);
  });
  transaction();
  recordEvent(viewer.code, 'save_initial_draft', 'app', appId);
  return getCommunityGalleryState(input.clientId);
}

export function publishInitialVersion(clientId: string) {
  const viewer = requireViewer(clientId, 'creator');
  const currentStudy = study();
  if (currentStudy.status === 'closed') throw new Error('研究已经结束，不能继续发布 Initial Version。');
  const app = db.prepare(`
    SELECT * FROM vg_async_apps WHERE study_id = ? AND creator_code = ?
  `).get(currentStudy.id, viewer.code) as any;
  if (!app) throw new Error('请先创建或上传 Initial Version。');
  if (app.initial_version_id) return getCommunityGalleryState(clientId);
  const draft = db.prepare(`
    SELECT * FROM vg_async_drafts WHERE study_id = ? AND app_id = ? AND kind = 'initial'
  `).get(currentStudy.id, app.id) as any;
  if (!draft?.code) throw new Error('Initial Version 草稿为空。');
  const timestamp = now();
  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO vg_async_versions
        (study_id, app_id, version_number, kind, title, code, summary, prompt, created_at)
      VALUES (?, ?, 1, 'initial', ?, ?, ?, ?, ?)
    `).run(currentStudy.id, app.id, app.title, draft.code, draft.summary, draft.prompt, timestamp);
    db.prepare(`
      UPDATE vg_async_apps
      SET initial_version_id = ?, status = 'published', published_at = ?, updated_at = ?
      WHERE id = ?
    `).run(Number(result.lastInsertRowid), timestamp, timestamp, app.id);
    db.prepare(`
      DELETE FROM vg_async_drafts WHERE study_id = ? AND app_id = ? AND kind = 'initial'
    `).run(currentStudy.id, app.id);
  });
  transaction();
  recordEvent(viewer.code, 'publish_initial_version', 'app', app.id);
  return getCommunityGalleryState(clientId);
}

export function getCreatorDraftContext(clientId: string) {
  const viewer = requireViewer(clientId, 'creator');
  const app = db.prepare(`
    SELECT * FROM vg_async_apps WHERE study_id = ? AND creator_code = ?
  `).get(study().id, viewer.code) as any;
  if (!app) throw new Error('请先创建 App。');
  const draft = db.prepare(`
    SELECT * FROM vg_async_drafts WHERE study_id = ? AND app_id = ?
  `).get(study().id, app.id) as any;
  if (!draft?.code) throw new Error('当前没有可修改的草稿。');
  const messages = db.prepare(`
    SELECT * FROM vg_async_development_messages
    WHERE study_id = ? AND app_id = ? AND phase = ?
    ORDER BY id DESC LIMIT 8
  `).all(study().id, app.id, draft.kind) as any[];
  let synthesis = null;
  let sources: any[] = [];
  if (draft.synthesis_id) {
    synthesis = db.prepare(`SELECT * FROM vg_async_syntheses WHERE id = ?`).get(draft.synthesis_id) as any;
    sources = resolveSynthesisSources(Number(draft.synthesis_id));
  }
  return { viewer, app, draft, messages: messages.reverse(), synthesis, sources };
}

export function saveRefinedDraft(
  clientId: string,
  code: string,
  summary: string,
  creatorMessage: string,
  assistantMessage: string,
) {
  const context = getCreatorDraftContext(clientId);
  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE vg_async_drafts SET code = ?, summary = ?, updated_at = ?
      WHERE study_id = ? AND app_id = ?
    `).run(code, summary, timestamp, study().id, context.app.id);
    const insertMessage = db.prepare(`
      INSERT INTO vg_async_development_messages
        (study_id, app_id, phase, role, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertMessage.run(study().id, context.app.id, context.draft.kind, 'creator', creatorMessage, timestamp);
    insertMessage.run(study().id, context.app.id, context.draft.kind, 'assistant', assistantMessage, timestamp);
  });
  transaction();
  recordEvent(context.viewer.code, 'refine_draft', 'app', context.app.id, { kind: context.draft.kind });
  return getCommunityGalleryState(clientId);
}

function commentById(commentId: number) {
  return db.prepare(`
    SELECT * FROM vg_async_comments
    WHERE study_id = ? AND id = ? AND deleted_at IS NULL
  `).get(study().id, commentId) as any;
}

function synthesisById(synthesisId: number) {
  return db.prepare(`
    SELECT * FROM vg_async_syntheses
    WHERE study_id = ? AND id = ? AND withdrawn_at IS NULL
  `).get(study().id, synthesisId) as any;
}

function sourceRecord(sourceType: CommunitySourceType, sourceId: number) {
  if (sourceType === 'comment') {
    const comment = commentById(sourceId);
    if (!comment) return null;
    const app = appById(comment.app_id);
    const version = comment.version_id
      ? db.prepare(`SELECT kind, version_number FROM vg_async_versions WHERE id = ?`).get(comment.version_id) as any
      : null;
    return {
      source_type: sourceType,
      source_id: sourceId,
      app_id: comment.app_id,
      app_title: app?.title || '',
      author_code: comment.author_code,
      title: '',
      content: comment.content,
      created_at: comment.created_at,
      version_id: comment.version_id || null,
      version_kind: version?.kind || '',
      version_number: version?.version_number || null,
    };
  }
  const synthesis = synthesisById(sourceId);
  if (!synthesis) return null;
  const app = appById(synthesis.target_app_id);
  const version = synthesis.target_version_id
    ? db.prepare(`SELECT kind, version_number FROM vg_async_versions WHERE id = ?`).get(synthesis.target_version_id) as any
    : null;
  return {
    source_type: sourceType,
    source_id: sourceId,
    app_id: synthesis.target_app_id,
    app_title: app?.title || '',
    author_code: synthesis.author_code,
    title: synthesis.title,
    content: synthesis.content,
    created_at: synthesis.created_at,
    version_id: synthesis.target_version_id || null,
    version_kind: version?.kind || '',
    version_number: version?.version_number || null,
  };
}

function resolveSynthesisSources(synthesisId: number) {
  const links = db.prepare(`
    SELECT * FROM vg_async_synthesis_sources
    WHERE study_id = ? AND synthesis_id = ?
    ORDER BY source_order
  `).all(study().id, synthesisId) as any[];
  return links
    .map((link) => ({ ...link, ...sourceRecord(link.source_type, Number(link.source_id)) }))
    .filter((source) => source.content);
}

function synthesisContributionAuthors(rootSynthesisId: number) {
  const contributions = new Map<string, Set<string>>();
  const visited = new Set<number>();
  const add = (authorCode: string, key: string) => {
    if (!authorCode) return;
    const keys = contributions.get(authorCode) || new Set<string>();
    keys.add(key);
    contributions.set(authorCode, keys);
  };
  const visit = (synthesisId: number) => {
    if (visited.has(synthesisId)) return;
    visited.add(synthesisId);
    const synthesis = synthesisById(synthesisId);
    if (!synthesis) return;
    add(synthesis.author_code, `synthesis:${synthesisId}`);
    const sources = db.prepare(`
      SELECT source_type, source_id
      FROM vg_async_synthesis_sources
      WHERE study_id = ? AND synthesis_id = ?
    `).all(study().id, synthesisId) as Array<{ source_type: CommunitySourceType; source_id: number }>;
    sources.forEach((source) => {
      if (source.source_type === 'comment') {
        const comment = commentById(Number(source.source_id));
        if (comment) add(comment.author_code, `comment:${comment.id}`);
      } else {
        visit(Number(source.source_id));
      }
    });
  };
  visit(rootSynthesisId);
  return contributions;
}

function createContributionNotifications(
  app: any,
  synthesis: any,
  iterationNumber: number,
  creatorCode: string,
) {
  const timestamp = now();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO vg_async_notifications
      (study_id, participant_code, type, app_id, version_number, synthesis_id,
       title, content, source_count, created_at)
    VALUES (?, ?, 'contribution_selected', ?, ?, ?, ?, ?, ?, ?)
  `);
  let created = 0;
  synthesisContributionAuthors(Number(synthesis.id)).forEach((sources, participantCode) => {
    if (participantCode === creatorCode) return;
    const result = insert.run(
      study().id,
      participantCode,
      app.id,
      iterationNumber,
      synthesis.id,
      `你的创意进入 Community Version ${iterationNumber} 开发`,
      `Creator 已在《${app.title}》中采用“${synthesis.title}”。你的 ${sources.size} 条创意贡献已经进入实际开发流程。`,
      sources.size,
      timestamp,
    );
    created += Number(result.changes);
  });
  return created;
}

export function markCommunityNotificationsRead(clientId: string) {
  const viewer = requireParticipant(clientId);
  db.prepare(`
    UPDATE vg_async_notifications
    SET read_at = COALESCE(read_at, ?)
    WHERE study_id = ? AND participant_code = ?
  `).run(now(), study().id, viewer.code);
  recordEvent(viewer.code, 'read_notifications', 'participant', viewer.code);
  return getCommunityGalleryState(clientId);
}

export function markCommunityNotificationsCelebrated(clientId: string, notificationIds: number[]) {
  const viewer = requireParticipant(clientId);
  const validIds = [...new Set(notificationIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (validIds.length) {
    const placeholders = validIds.map(() => '?').join(',');
    db.prepare(`
      UPDATE vg_async_notifications
      SET celebrated_at = COALESCE(celebrated_at, ?)
      WHERE study_id = ? AND participant_code = ? AND id IN (${placeholders})
    `).run(now(), study().id, viewer.code, ...validIds);
    recordEvent(viewer.code, 'celebrate_contribution_notifications', 'participant', viewer.code, {
      notificationIds: validIds,
    });
  }
  return getCommunityGalleryState(clientId);
}

function scoredSynthesisCandidates(appId: string, layer: 1 | 2) {
  const candidates = db.prepare(`
    SELECT * FROM vg_async_syntheses
    WHERE study_id = ? AND target_app_id = ? AND layer = ? AND withdrawn_at IS NULL
    ORDER BY created_at, id
  `).all(study().id, appId, layer) as any[];
  const candidateIds = new Set(candidates.map((candidate) => Number(candidate.id)));
  const links = candidateIds.size
    ? db.prepare(`
        SELECT ss.*, s.author_code
        FROM vg_async_synthesis_sources ss
        JOIN vg_async_syntheses s ON s.id = ss.synthesis_id
        WHERE ss.study_id = ? AND s.target_app_id = ? AND s.layer = ?
          AND s.withdrawn_at IS NULL
      `).all(study().id, appId, layer) as any[]
    : [];
  const votes = candidateIds.size
    ? db.prepare(`
        SELECT participant_code, synthesis_id
        FROM vg_async_synthesis_votes
        WHERE study_id = ? AND target_app_id = ? AND layer = ?
          AND synthesis_id IS NOT NULL
      `).all(study().id, appId, layer) as Array<{
        participant_code: string;
        synthesis_id: number;
      }>
    : [];
  const selectorsBySource = new Map<string, Set<string>>();
  links.forEach((link) => {
    const key = `${link.source_type}:${link.source_id}`;
    const selectors = selectorsBySource.get(key) || new Set<string>();
    selectors.add(link.author_code);
    selectorsBySource.set(key, selectors);
  });
  votes.forEach((vote) => {
    links
      .filter((link) => Number(link.synthesis_id) === Number(vote.synthesis_id))
      .forEach((link) => {
        const key = `${link.source_type}:${link.source_id}`;
        const selectors = selectorsBySource.get(key) || new Set<string>();
        selectors.add(vote.participant_code);
        selectorsBySource.set(key, selectors);
      });
  });
  return candidates.map((candidate) => {
    const sources = links.filter((link) => Number(link.synthesis_id) === Number(candidate.id));
    const popularity = Object.fromEntries(sources.map((source) => {
      const key = `${source.source_type}:${source.source_id}`;
      return [key, selectorsBySource.get(key)?.size || 0];
    }));
    return {
      ...candidate,
      source_count: sources.length,
      vote_count: votes.filter((vote) => Number(vote.synthesis_id) === Number(candidate.id)).length,
      community_score: Object.values(popularity).reduce(
        (total, count) => total + Number(count),
        0,
      ),
      source_popularity_json: JSON.stringify(popularity),
    };
  });
}

export function enterCommunityDevelopmentStage(clientId: string, iterationNumber: 1 | 2) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = requireOpenStudy();
  if (currentStudy.status !== 'active') throw new Error('请先记录正式研究开始。');
  const expectedStage = iterationNumber === 1 ? 'synthesis_1' : 'development_1';
  if (currentStudy.workflow_stage !== expectedStage) {
    throw new Error(iterationNumber === 1 ? '第一次综合已经结束。' : '当前不能进入第二次开发。');
  }
  const experimentalApps = db.prepare(`
    SELECT * FROM vg_async_apps
    WHERE study_id = ? AND condition_name = 'experimental' AND status = 'published'
    ORDER BY published_at, creator_code
  `).all(currentStudy.id) as any[];
  if (!experimentalApps.length) throw new Error('当前没有已发布的 Vibe Gallery App。');

  const candidatesByApp = experimentalApps.map((app) => ({
    app,
    candidates: scoredSynthesisCandidates(app.id, iterationNumber),
  }));
  if (iterationNumber === 2) {
    const missingFirstVersion = experimentalApps.filter((app) => communityIterationCount(app.id) < 1);
    if (missingFirstVersion.length) {
      throw new Error(`仍有 ${missingFirstVersion.length} 个 App 未发布 Community Version 1。`);
    }
  }
  const missingCandidates = candidatesByApp.filter((entry) => entry.candidates.length === 0);
  if (missingCandidates.length) {
    throw new Error(`仍有 ${missingCandidates.length} 个 App 没有第 ${iterationNumber} 次综合候选。`);
  }

  const winners = candidatesByApp.map(({ app, candidates }) => {
    const ranked = [...candidates].sort((left, right) => (
      Number(right.community_score) - Number(left.community_score)
      || Number(right.vote_count) - Number(left.vote_count)
      || Number(right.source_count) - Number(left.source_count)
      || Date.parse(left.created_at) - Date.parse(right.created_at)
      || Number(left.id) - Number(right.id)
    ));
    return { app, winner: ranked[0] };
  });
  const timestamp = now();
  let notificationCount = 0;
  const transaction = db.transaction(() => {
    const insert = db.prepare(`
      INSERT INTO vg_async_stage_selections
        (study_id, app_id, iteration_number, synthesis_id, score,
         source_popularity_json, selected_at, host_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(study_id, app_id, iteration_number) DO UPDATE SET
        synthesis_id = excluded.synthesis_id,
        score = excluded.score,
        source_popularity_json = excluded.source_popularity_json,
        selected_at = excluded.selected_at,
        host_code = excluded.host_code
    `);
    winners.forEach(({ app, winner }) => {
      insert.run(
        currentStudy.id,
        app.id,
        iterationNumber,
        winner.id,
        winner.community_score,
        winner.source_popularity_json,
        timestamp,
        viewer.code,
      );
      db.prepare(`
        UPDATE vg_async_apps
        SET selected_synthesis_id = ?, updated_at = ?
        WHERE study_id = ? AND id = ?
      `).run(winner.id, timestamp, currentStudy.id, app.id);
      notificationCount += createContributionNotifications(
        app,
        winner,
        iterationNumber,
        app.creator_code,
      );
    });
    db.prepare(`
      UPDATE vg_async_studies SET workflow_stage = ?, updated_at = ? WHERE id = ?
    `).run(`development_${iterationNumber}`, timestamp, currentStudy.id);
  });
  transaction();
  recordEvent(viewer.code, `enter_development_${iterationNumber}`, 'study', currentStudy.id, {
    winners: winners.map(({ app, winner }) => ({
      appId: app.id,
      synthesisId: winner.id,
      score: winner.community_score,
    })),
    notificationCount,
  });
  return getCommunityGalleryState(clientId);
}

export function returnToPreviousCommunityStage(clientId: string) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = requireOpenStudy();
  if (currentStudy.status !== 'active') throw new Error('当前研究不在进行中。');

  const iterationNumber = currentStudy.workflow_stage === 'development_1'
    ? 1
    : currentStudy.workflow_stage === 'development_2'
      ? 2
      : null;
  if (!iterationNumber) throw new Error('当前已经是第一次综合阶段，无法继续返回。');

  const generationCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM vg_async_generation_jobs
    WHERE study_id = ? AND iteration_number = ?
  `).get(currentStudy.id, iterationNumber) as { count: number };
  const draftCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM vg_async_drafts
    WHERE study_id = ? AND kind = 'community' AND iteration_number = ?
  `).get(currentStudy.id, iterationNumber) as { count: number };
  const versionCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM vg_async_versions
    WHERE study_id = ? AND kind = 'community' AND version_number = ?
  `).get(currentStudy.id, iterationNumber + 1) as { count: number };
  if (
    Number(generationCount.count) > 0
    || Number(draftCount.count) > 0
    || Number(versionCount.count) > 0
  ) {
    throw new Error(`第 ${iterationNumber} 次开发已经开始，不能返回上一阶段。`);
  }

  const previousStage = iterationNumber === 1 ? 'synthesis_1' : 'development_1';
  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      DELETE FROM vg_async_notifications
      WHERE study_id = ? AND type = 'contribution_selected' AND version_number = ?
    `).run(currentStudy.id, iterationNumber);
    db.prepare(`
      DELETE FROM vg_async_stage_selections
      WHERE study_id = ? AND iteration_number = ?
    `).run(currentStudy.id, iterationNumber);

    if (iterationNumber === 1) {
      db.prepare(`
        UPDATE vg_async_apps
        SET selected_synthesis_id = NULL, updated_at = ?
        WHERE study_id = ? AND condition_name = 'experimental'
      `).run(timestamp, currentStudy.id);
    } else {
      db.prepare(`
        UPDATE vg_async_apps
        SET selected_synthesis_id = (
          SELECT selection.synthesis_id
          FROM vg_async_stage_selections selection
          WHERE selection.study_id = vg_async_apps.study_id
            AND selection.app_id = vg_async_apps.id
            AND selection.iteration_number = 1
        ), updated_at = ?
        WHERE study_id = ? AND condition_name = 'experimental'
      `).run(timestamp, currentStudy.id);
    }

    db.prepare(`
      UPDATE vg_async_studies SET workflow_stage = ?, updated_at = ? WHERE id = ?
    `).run(previousStage, timestamp, currentStudy.id);
  });
  transaction();
  recordEvent(viewer.code, 'return_to_previous_stage', 'study', currentStudy.id, {
    fromStage: currentStudy.workflow_stage,
    toStage: previousStage,
    iterationNumber,
  });
  return getCommunityGalleryState(clientId);
}

export function saveCommunityComment(input: {
  clientId: string;
  appId: string;
  content: string;
  parentCommentId?: number;
  targetType?: 'app' | 'synthesis';
  targetId?: string;
}) {
  const viewer = requireParticipant(input.clientId);
  requireOpenStudy();
  const { app } = accessibleApp(input.clientId, input.appId);
  const content = input.content.trim();
  if (!content) throw new Error('评论内容不能为空。');
  if (content.length > 3000) throw new Error('评论不能超过 3000 字。');
  const targetType = input.targetType || 'app';
  const targetId = input.targetId || app.id;
  if (targetType === 'synthesis') {
    const synthesis = synthesisById(Number(targetId));
    if (!synthesis || synthesis.target_app_id !== app.id) throw new Error('综合评论不存在。');
  } else if (targetId !== app.id) {
    throw new Error('普通评论必须属于当前 App。');
  }
  if (input.parentCommentId) {
    const parent = commentById(input.parentCommentId);
    if (!parent || parent.target_type !== targetType || parent.target_id !== String(targetId)) {
      throw new Error('回复目标不存在或不属于当前讨论。');
    }
  }
  const timestamp = now();
  const result = db.prepare(`
    INSERT INTO vg_async_comments
      (study_id, app_id, version_id, target_type, target_id, parent_comment_id, author_code, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    study().id,
    app.id,
    app.community_version_id || app.initial_version_id,
    targetType,
    String(targetId),
    input.parentCommentId || null,
    viewer.code,
    content,
    timestamp,
    timestamp,
  );
  const commentId = Number(result.lastInsertRowid);
  db.prepare(`
    UPDATE vg_async_assignments
    SET completed_at = COALESCE(completed_at, ?)
    WHERE study_id = ? AND participant_code = ? AND app_id = ?
  `).run(timestamp, study().id, viewer.code, app.id);
  recordEvent(viewer.code, input.parentCommentId ? 'reply_comment' : 'create_comment', 'comment', commentId, {
    appId: app.id,
    targetType,
    targetId,
  });
  return getCommunityGalleryState(input.clientId);
}

export function deleteCommunityComment(clientId: string, commentId: number) {
  const viewer = requireParticipant(clientId);
  const comment = commentById(commentId);
  if (!comment || comment.author_code !== viewer.code) throw new Error('只能删除自己的评论。');
  const used = db.prepare(`
    SELECT 1 FROM vg_async_synthesis_sources
    WHERE study_id = ? AND source_type = 'comment' AND source_id = ?
  `).get(study().id, commentId);
  if (used) throw new Error('该评论已经成为综合评论来源，不能删除。');
  db.prepare(`
    UPDATE vg_async_comments SET deleted_at = ?, updated_at = ?
    WHERE study_id = ? AND id = ?
  `).run(now(), now(), study().id, commentId);
  recordEvent(viewer.code, 'delete_comment', 'comment', commentId);
  return getCommunityGalleryState(clientId);
}

export function toggleCommunityCommentLike(clientId: string, commentId: number) {
  const viewer = requireParticipant(clientId);
  const comment = commentById(commentId);
  if (!comment) throw new Error('评论不存在。');
  accessibleApp(clientId, comment.app_id);
  if (comment.author_code === viewer.code) throw new Error('不能点赞自己的评论。');
  const exists = db.prepare(`
    SELECT 1 FROM vg_async_comment_likes
    WHERE study_id = ? AND comment_id = ? AND participant_code = ?
  `).get(study().id, commentId, viewer.code);
  if (exists) {
    db.prepare(`
      DELETE FROM vg_async_comment_likes
      WHERE study_id = ? AND comment_id = ? AND participant_code = ?
    `).run(study().id, commentId, viewer.code);
  } else {
    db.prepare(`
      INSERT INTO vg_async_comment_likes
        (study_id, comment_id, participant_code, created_at)
      VALUES (?, ?, ?, ?)
    `).run(study().id, commentId, viewer.code, now());
  }
  recordEvent(viewer.code, exists ? 'unlike_comment' : 'like_comment', 'comment', commentId);
  return getCommunityGalleryState(clientId);
}

export function toggleCommunityAppLike(clientId: string, appId: string) {
  const viewer = requireParticipant(clientId);
  const { app } = accessibleApp(clientId, appId);
  if (app.creator_code === viewer.code) throw new Error('不能点赞自己的 App。');
  const exists = db.prepare(`
    SELECT 1 FROM vg_async_app_likes
    WHERE study_id = ? AND app_id = ? AND participant_code = ?
  `).get(study().id, appId, viewer.code);
  if (exists) {
    db.prepare(`
      DELETE FROM vg_async_app_likes
      WHERE study_id = ? AND app_id = ? AND participant_code = ?
    `).run(study().id, appId, viewer.code);
  } else {
    db.prepare(`
      INSERT INTO vg_async_app_likes
        (study_id, app_id, participant_code, created_at)
      VALUES (?, ?, ?, ?)
    `).run(study().id, appId, viewer.code, now());
  }
  recordEvent(viewer.code, exists ? 'unlike_app' : 'like_app', 'app', appId);
  return getCommunityGalleryState(clientId);
}

export function toggleCreativeBasket(
  clientId: string,
  sourceType: CommunitySourceType,
  sourceId: number,
) {
  const viewer = requireParticipant(clientId);
  requireOpenStudy();
  if (viewer.role !== 'community' && viewer.condition !== 'experimental') {
    throw new Error('收藏夹只对 Community Commenter 和 Vibe Gallery Creator 开放。');
  }
  const source = sourceRecord(sourceType, sourceId);
  if (!source) throw new Error('创意素材不存在。');
  accessibleApp(clientId, source.app_id);
  const exists = db.prepare(`
    SELECT 1 FROM vg_async_basket_items
    WHERE study_id = ? AND participant_code = ? AND source_type = ? AND source_id = ?
  `).get(study().id, viewer.code, sourceType, sourceId);
  if (exists) {
    db.prepare(`
      DELETE FROM vg_async_basket_items
      WHERE study_id = ? AND participant_code = ? AND source_type = ? AND source_id = ?
    `).run(study().id, viewer.code, sourceType, sourceId);
  } else {
    db.prepare(`
      INSERT INTO vg_async_basket_items
        (study_id, participant_code, source_type, source_id, added_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(study().id, viewer.code, sourceType, sourceId, now());
  }
  recordEvent(viewer.code, exists ? 'remove_from_creative_basket' : 'add_to_creative_basket', sourceType, sourceId);
  return getCommunityGalleryState(clientId);
}

function openSynthesisLayerForApp(app: any): 1 | 2 | null {
  const currentStudy = study();
  const completedIterations = communityIterationCount(app.id);
  if (currentStudy.workflow_stage === 'synthesis_1') return 1;
  if (currentStudy.workflow_stage === 'development_1' && completedIterations >= 1) return 2;
  return null;
}

export function createSynthesis(input: {
  clientId: string;
  targetAppId: string;
  title: string;
  content: string;
  sources: Array<{ type: CommunitySourceType; id: number; note?: string }>;
}) {
  const viewer = requireParticipant(input.clientId);
  requireOpenStudy();
  if (viewer.role !== 'community' && viewer.condition !== 'experimental') {
    throw new Error('综合评论只对 Community Commenter 和 Vibe Gallery Creator 开放。');
  }
  const { app } = accessibleApp(input.clientId, input.targetAppId);
  if (app.condition_name !== 'experimental') throw new Error('综合评论只能发布到 Vibe Gallery App。');
  const currentStudy = study();
  if (currentStudy.status !== 'active') throw new Error('Host 开始研究后才能创建综合候选。');
  const layer = openSynthesisLayerForApp(app);
  if (!layer) throw new Error('当前阶段没有开放新的综合候选。');
  const swapped = db.prepare(`
    SELECT 1 FROM vg_async_synthesis_votes
    WHERE study_id = ? AND participant_code = ? AND target_app_id = ? AND layer = ?
  `).get(currentStudy.id, viewer.code, app.id, layer);
  if (swapped) throw new Error('你已将本轮综合候选换成赞同票，不能再次创建本轮候选。');
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) throw new Error('请填写综合评论标题和完整的新方向。');
  const uniqueSources = input.sources.filter(
    (source, index, list) => list.findIndex((candidate) => candidate.type === source.type && candidate.id === source.id) === index,
  );
  if (uniqueSources.length < 2) throw new Error('综合评论至少需要两条创意素材。');
  if (uniqueSources.length > 3) throw new Error('一条综合评论最多只能选择三条来源。');
  const resolved = uniqueSources.map((source) => ({
    ...source,
    record: sourceRecord(source.type, Number(source.id)),
  }));
  if (resolved.some((source) => !source.record)) throw new Error('部分创意素材已经不存在。');
  for (const source of resolved) accessibleApp(input.clientId, source.record!.app_id);
  if (layer === 1 && resolved.some((source) => source.type !== 'comment')) {
    throw new Error('第一次综合只能选择普通评论或回复。');
  }
  if (layer === 2) {
    const invalidSynthesis = resolved.find((source) => {
      if (source.type !== 'synthesis') return false;
      return Number(synthesisById(Number(source.id))?.layer || 0) !== 1;
    });
    if (invalidSynthesis) throw new Error('第二次综合只能选择第一次综合评论。');
  }
  if (!resolved.some((source) => source.record!.app_id === app.id)) {
    throw new Error('至少选择一条与目标 App 有关的创意素材。');
  }

  const timestamp = now();
  let synthesisId = 0;
  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO vg_async_syntheses
        (study_id, target_app_id, target_version_id, layer, author_code, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      study().id,
      app.id,
      app.community_version_id || app.initial_version_id,
      layer,
      viewer.code,
      title,
      content,
      timestamp,
      timestamp,
    );
    synthesisId = Number(result.lastInsertRowid);
    const insertSource = db.prepare(`
      INSERT INTO vg_async_synthesis_sources
        (study_id, synthesis_id, source_type, source_id, source_order, contribution_note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    resolved.forEach((source, index) => {
      insertSource.run(
        study().id,
        synthesisId,
        source.type,
        source.id,
        index,
        source.note?.trim() || '',
        timestamp,
      );
    });
  });
  transaction();
  recordEvent(viewer.code, 'create_synthesis', 'synthesis', synthesisId, {
    targetAppId: app.id,
    sourceCount: resolved.length,
    sourceApps: [...new Set(resolved.map((source) => source.record!.app_id))],
    layer,
  });
  return getCommunityGalleryState(input.clientId);
}

export function withdrawSynthesisForVote(clientId: string, synthesisId: number) {
  const viewer = requireParticipant(clientId);
  const currentStudy = requireOpenStudy();
  if (viewer.role !== 'community' && viewer.condition !== 'experimental') {
    throw new Error('综合候选换票只对 Community Commenter 和 Vibe Gallery Creator 开放。');
  }
  const synthesis = db.prepare(`
    SELECT * FROM vg_async_syntheses
    WHERE study_id = ? AND id = ? AND withdrawn_at IS NULL
  `).get(currentStudy.id, synthesisId) as any;
  if (!synthesis) throw new Error('综合候选不存在或已经撤回。');
  if (synthesis.author_code !== viewer.code) throw new Error('只能撤回自己的综合候选。');
  const { app } = accessibleApp(clientId, synthesis.target_app_id);
  const openLayer = openSynthesisLayerForApp(app);
  if (!openLayer || Number(synthesis.layer) !== openLayer) {
    throw new Error('只能撤回当前轮尚未锁定的综合候选。');
  }
  const selected = db.prepare(`
    SELECT 1 FROM vg_async_stage_selections
    WHERE study_id = ? AND synthesis_id = ?
  `).get(currentStudy.id, synthesisId);
  if (selected) throw new Error('该综合候选已经进入开发流程，不能撤回。');
  const usedByAnotherSynthesis = db.prepare(`
    SELECT 1
    FROM vg_async_synthesis_sources source
    JOIN vg_async_syntheses synthesis ON synthesis.id = source.synthesis_id
    WHERE source.study_id = ? AND source.source_type = 'synthesis'
      AND source.source_id = ? AND synthesis.withdrawn_at IS NULL
  `).get(currentStudy.id, synthesisId);
  if (usedByAnotherSynthesis) throw new Error('该综合候选已经成为其他综合的来源，不能撤回。');
  const existingSwap = db.prepare(`
    SELECT 1 FROM vg_async_synthesis_votes
    WHERE study_id = ? AND participant_code = ? AND target_app_id = ? AND layer = ?
  `).get(currentStudy.id, viewer.code, app.id, openLayer);
  if (existingSwap) throw new Error('本轮已经使用过一次综合换票机会。');

  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE vg_async_syntheses
      SET withdrawn_at = ?, withdrawn_for_vote = 1, updated_at = ?
      WHERE study_id = ? AND id = ?
    `).run(timestamp, timestamp, currentStudy.id, synthesisId);
    db.prepare(`
      DELETE FROM vg_async_basket_items
      WHERE study_id = ? AND source_type = 'synthesis' AND source_id = ?
    `).run(currentStudy.id, synthesisId);
    db.prepare(`
      INSERT INTO vg_async_synthesis_votes
        (study_id, participant_code, target_app_id, layer, withdrawn_synthesis_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(currentStudy.id, viewer.code, app.id, openLayer, synthesisId, timestamp);
  });
  transaction();
  recordEvent(viewer.code, 'withdraw_synthesis_for_vote', 'synthesis', synthesisId, {
    targetAppId: app.id,
    layer: openLayer,
  });
  return getCommunityGalleryState(clientId);
}

export function voteForSynthesis(clientId: string, synthesisId: number) {
  const viewer = requireParticipant(clientId);
  const currentStudy = requireOpenStudy();
  if (viewer.role !== 'community' && viewer.condition !== 'experimental') {
    throw new Error('综合候选赞同只对 Community Commenter 和 Vibe Gallery Creator 开放。');
  }
  const synthesis = synthesisById(synthesisId);
  if (!synthesis) throw new Error('要赞同的综合候选不存在。');
  const { app } = accessibleApp(clientId, synthesis.target_app_id);
  const openLayer = openSynthesisLayerForApp(app);
  if (!openLayer || Number(synthesis.layer) !== openLayer) {
    throw new Error('只能赞同当前轮尚未锁定的综合候选。');
  }
  if (synthesis.author_code === viewer.code) throw new Error('不能赞同自己的综合候选。');
  const credit = db.prepare(`
    SELECT * FROM vg_async_synthesis_votes
    WHERE study_id = ? AND participant_code = ? AND target_app_id = ? AND layer = ?
  `).get(currentStudy.id, viewer.code, app.id, openLayer) as any;
  if (!credit) throw new Error('请先撤回自己本轮的一条综合候选，获得一张赞同票。');
  if (credit.synthesis_id) throw new Error('本轮赞同票已经使用。');

  const timestamp = now();
  db.prepare(`
    UPDATE vg_async_synthesis_votes
    SET synthesis_id = ?, voted_at = ?
    WHERE study_id = ? AND participant_code = ? AND target_app_id = ? AND layer = ?
  `).run(
    synthesisId,
    timestamp,
    currentStudy.id,
    viewer.code,
    app.id,
    openLayer,
  );
  recordEvent(viewer.code, 'vote_for_synthesis', 'synthesis', synthesisId, {
    targetAppId: app.id,
    layer: openLayer,
    withdrawnSynthesisId: credit.withdrawn_synthesis_id,
  });
  return getCommunityGalleryState(clientId);
}

export function startCommunityGeneration(
  clientId: string,
  appId: string,
  synthesisId: number,
  creatorInstruction: string,
  requestedBaseVersionId?: number,
  selectionReason = '',
) {
  const { viewer, app } = ownedApp(clientId, appId);
  requireOpenStudy();
  if (viewer.condition !== 'experimental') throw new Error('对照组不提供平台内 AI 原型化。');
  const completedIterations = communityIterationCount(app.id);
  const iterationNumber = completedIterations + 1;
  if (iterationNumber > 2) throw new Error('该 App 已经完成两次 Community 开发。');
  const currentStudy = study();
  if (currentStudy.workflow_stage !== `development_${iterationNumber}`) {
    throw new Error(`Host 尚未进入第 ${iterationNumber} 次开发阶段。`);
  }
  const synthesis = synthesisById(synthesisId);
  if (!synthesis || synthesis.target_app_id !== app.id) throw new Error('请选择当前 App 的综合评论。');
  const developmentPrompt = creatorInstruction.trim() || synthesis.content.trim();
  if (!developmentPrompt) throw new Error('入选综合评论缺少可用于开发的提示词。');
  const stageSelection = db.prepare(`
    SELECT * FROM vg_async_stage_selections
    WHERE study_id = ? AND app_id = ? AND iteration_number = ?
  `).get(currentStudy.id, app.id, iterationNumber) as any;
  if (!stageSelection || Number(stageSelection.synthesis_id) !== Number(synthesisId)) {
    throw new Error('只能开发 Host 在当前阶段锁定的综合方向。');
  }
  const firstCommunityVersion = versionsForApp(app.id)
    .find((version) => version.kind === 'community' && Number(version.version_number) === 2);
  const defaultBaseVersionId = iterationNumber === 1
    ? Number(app.initial_version_id)
    : Number(firstCommunityVersion?.id);
  const baseVersionId = Number(defaultBaseVersionId);
  const baseVersion = versionById(baseVersionId);
  if (!baseVersion || baseVersion.app_id !== app.id) {
    throw new Error(iterationNumber === 1
      ? 'Initial Version 不存在。'
      : 'Community Version 1 不存在。');
  }
  if (requestedBaseVersionId && Number(requestedBaseVersionId) !== baseVersionId) {
    throw new Error(iterationNumber === 1
      ? '第一次开发固定基于 Initial Version。'
      : '第二次开发固定基于 Community Version 1。');
  }
  const running = db.prepare(`
    SELECT 1 FROM vg_async_generation_jobs
    WHERE study_id = ? AND app_id = ? AND status = 'running'
  `).get(study().id, app.id);
  if (running) throw new Error('当前已经有一个 Community Version 生成任务。');
  const timestamp = now();
  let jobId = 0;
  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO vg_async_generation_jobs
        (study_id, app_id, synthesis_id, iteration_number, base_version_id,
         selection_reason, creator_instruction, status, created_at, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)
    `).run(
      study().id,
      app.id,
      synthesisId,
      iterationNumber,
      baseVersionId,
      selectionReason.trim(),
      developmentPrompt,
      timestamp,
      timestamp,
    );
    jobId = Number(result.lastInsertRowid);
  });
  transaction();
  recordEvent(viewer.code, 'start_community_generation', 'generation_job', jobId, {
    appId,
    synthesisId,
    iterationNumber,
    baseVersionId,
    baseVersionNumber: baseVersion.version_number,
    selectionReason: selectionReason.trim(),
    promptSource: creatorInstruction.trim() ? 'creator_adjusted' : 'selected_synthesis',
  });
  return { jobId, state: getCommunityGalleryState(clientId) };
}

export function getCommunityGenerationInput(jobId: number) {
  const job = db.prepare(`
    SELECT j.*, a.title AS app_title, a.brief AS app_brief, a.creator_code,
      v.code AS base_code, v.prompt AS base_prompt, v.version_number AS base_version_number
    FROM vg_async_generation_jobs j
    JOIN vg_async_apps a ON a.id = j.app_id
    JOIN vg_async_versions v ON v.id = j.base_version_id
    WHERE j.study_id = ? AND j.id = ?
  `).get(study().id, jobId) as any;
  if (!job) throw new Error('Community Version 生成任务不存在。');
  const synthesis = synthesisById(Number(job.synthesis_id));
  return { job, synthesis, sources: resolveSynthesisSources(Number(job.synthesis_id)) };
}

export function recordCommunityGenerationProgress(jobId: number, progress: DevelopmentAgentProgress) {
  const input = getCommunityGenerationInput(jobId);
  const timestamp = now();
  db.prepare(`
    INSERT INTO vg_async_generation_events
      (study_id, job_id, app_id, step_key, sort_order, status, title, detail, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(job_id, step_key) DO UPDATE SET
      sort_order = excluded.sort_order,
      status = excluded.status,
      title = excluded.title,
      detail = excluded.detail,
      updated_at = excluded.updated_at
  `).run(
    study().id,
    jobId,
    input.job.app_id,
    progress.step,
    progress.order,
    progress.status,
    progress.title,
    progress.detail || '',
    timestamp,
    timestamp,
  );
}

export function completeCommunityGeneration(jobId: number, code: string, summary: string) {
  const input = getCommunityGenerationInput(jobId);
  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO vg_async_drafts
        (study_id, app_id, kind, code, summary, prompt, synthesis_id,
         iteration_number, base_version_id, selection_reason, updated_at)
      VALUES (?, ?, 'community', ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(study_id, app_id) DO UPDATE SET
        kind = 'community',
        code = excluded.code,
        summary = excluded.summary,
        prompt = excluded.prompt,
        synthesis_id = excluded.synthesis_id,
        iteration_number = excluded.iteration_number,
        base_version_id = excluded.base_version_id,
        selection_reason = excluded.selection_reason,
        updated_at = excluded.updated_at
    `).run(
      study().id,
      input.job.app_id,
      code,
      summary,
      input.job.creator_instruction || input.synthesis.content,
      input.synthesis.id,
      input.job.iteration_number,
      input.job.base_version_id,
      input.job.selection_reason || '',
      timestamp,
    );
    db.prepare(`
      UPDATE vg_async_generation_jobs
      SET status = 'completed', completed_at = ?, error = NULL
      WHERE study_id = ? AND id = ?
    `).run(timestamp, study().id, jobId);
  });
  transaction();
  recordEvent(input.job.creator_code, 'complete_community_generation', 'generation_job', jobId);
}

export function failCommunityGeneration(jobId: number, error: unknown) {
  const input = getCommunityGenerationInput(jobId);
  db.prepare(`
    UPDATE vg_async_generation_jobs
    SET status = 'failed', error = ?, completed_at = ?
    WHERE study_id = ? AND id = ?
  `).run(error instanceof Error ? error.message : String(error), now(), study().id, jobId);
  recordEvent(input.job.creator_code, 'fail_community_generation', 'generation_job', jobId);
}

export function uploadControlCommunityDraft(
  clientId: string,
  appId: string,
  code: string,
  summary: string,
  prompt: string,
  requestedBaseVersionId?: number,
  selectionReason = '',
) {
  const { viewer, app } = ownedApp(clientId, appId);
  requireOpenStudy();
  if (viewer.condition !== 'control') throw new Error('该入口仅用于对照组上传外部原型。');
  const completedIterations = communityIterationCount(app.id);
  const iterationNumber = completedIterations + 1;
  if (iterationNumber > 2) throw new Error('该 App 已经完成两次 Community 开发。');
  const currentStudy = study();
  if (currentStudy.workflow_stage !== `development_${iterationNumber}`) {
    throw new Error(`Host 尚未进入第 ${iterationNumber} 次开发阶段。`);
  }
  const firstCommunityVersion = versionsForApp(app.id)
    .find((version) => version.kind === 'community' && Number(version.version_number) === 2);
  const baseVersionId = Number(
    iterationNumber === 1 ? app.initial_version_id : firstCommunityVersion?.id,
  );
  const baseVersion = versionById(baseVersionId);
  if (!baseVersion || baseVersion.app_id !== app.id) {
    throw new Error('当前开发阶段的基础版本不存在。');
  }
  if (requestedBaseVersionId && Number(requestedBaseVersionId) !== baseVersionId) {
    throw new Error('当前开发阶段的基础版本由实验流程固定。');
  }
  db.prepare(`
    INSERT INTO vg_async_drafts
      (study_id, app_id, kind, code, summary, prompt, synthesis_id,
       iteration_number, base_version_id, selection_reason, updated_at)
    VALUES (?, ?, 'community', ?, ?, ?, NULL, ?, ?, ?, ?)
    ON CONFLICT(study_id, app_id) DO UPDATE SET
      kind = 'community',
      code = excluded.code,
      summary = excluded.summary,
      prompt = excluded.prompt,
      synthesis_id = NULL,
      iteration_number = excluded.iteration_number,
      base_version_id = excluded.base_version_id,
      selection_reason = excluded.selection_reason,
      updated_at = excluded.updated_at
  `).run(
    study().id,
    app.id,
    code,
    summary,
    prompt,
    iterationNumber,
    baseVersionId,
    selectionReason.trim(),
    now(),
  );
  recordEvent(viewer.code, 'upload_external_community_draft', 'app', app.id, {
    iterationNumber,
    baseVersionId,
    selectionReason: selectionReason.trim(),
  });
  return getCommunityGalleryState(clientId);
}

export function publishCommunityVersion(clientId: string, appId: string) {
  const { viewer, app } = ownedApp(clientId, appId);
  requireOpenStudy();
  const completedIterations = communityIterationCount(app.id);
  if (completedIterations >= 2) return getCommunityGalleryState(clientId);
  const draft = db.prepare(`
    SELECT * FROM vg_async_drafts
    WHERE study_id = ? AND app_id = ? AND kind = 'community'
  `).get(study().id, app.id) as any;
  if (!draft?.code) throw new Error('请先生成或上传 Community Version 草稿。');
  const iterationNumber = completedIterations + 1;
  if (Number(draft.iteration_number || iterationNumber) !== iterationNumber) {
    throw new Error('当前草稿不属于下一次 Community 开发，请重新选择方向。');
  }
  const baseVersion = versionById(Number(draft.base_version_id || app.initial_version_id));
  if (!baseVersion || baseVersion.app_id !== app.id) throw new Error('草稿的开发基础版本不存在。');
  const timestamp = now();
  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO vg_async_versions
        (study_id, app_id, version_number, kind, title, code, summary, prompt,
         synthesis_id, base_version_id, selection_reason, created_at)
      VALUES (?, ?, ?, 'community', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      study().id,
      app.id,
      iterationNumber + 1,
      app.title,
      draft.code,
      draft.summary,
      draft.prompt,
      draft.synthesis_id,
      baseVersion.id,
      draft.selection_reason || '',
      timestamp,
    );
    db.prepare(`
      UPDATE vg_async_apps
      SET community_version_id = ?, selected_synthesis_id = ?,
        community_published_at = ?, updated_at = ?
      WHERE study_id = ? AND id = ?
    `).run(
      Number(result.lastInsertRowid),
      draft.synthesis_id || null,
      timestamp,
      timestamp,
      study().id,
      app.id,
    );
    db.prepare(`
      DELETE FROM vg_async_drafts WHERE study_id = ? AND app_id = ?
    `).run(study().id, app.id);
  });
  transaction();
  recordEvent(viewer.code, 'publish_community_version', 'app', app.id, {
    synthesisId: draft.synthesis_id || null,
    iterationNumber,
    baseVersionId: baseVersion.id,
    baseVersionNumber: baseVersion.version_number,
    selectionReason: draft.selection_reason || '',
  });
  return getCommunityGalleryState(clientId);
}

function ensureAssignments() {
  const currentStudy = study();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO vg_async_assignments
      (study_id, participant_code, app_id, position, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const assignBalanced = (participants: any[], apps: any[]) => {
    const counts = new Map(apps.map((app) => [app.id, 0]));
    participants.forEach((person, personIndex) => {
      const candidates = apps
        .filter((app) => app.creator_code !== person.code)
        .sort((left, right) => {
          const countDifference = (counts.get(left.id) || 0) - (counts.get(right.id) || 0);
          if (countDifference) return countDifference;
          const leftIndex = apps.findIndex((app) => app.id === left.id);
          const rightIndex = apps.findIndex((app) => app.id === right.id);
          return ((leftIndex - personIndex + apps.length) % apps.length)
            - ((rightIndex - personIndex + apps.length) % apps.length);
        })
        .slice(0, 3);
      candidates.forEach((app, position) => {
        insert.run(currentStudy.id, person.code, app.id, position + 1, now());
        counts.set(app.id, (counts.get(app.id) || 0) + 1);
      });
    });
  };

  const communityExisting = db.prepare(`
    SELECT COUNT(*) AS count FROM vg_async_assignments a
    JOIN vg_async_participants p
      ON p.study_id = a.study_id AND p.code = a.participant_code
    WHERE a.study_id = ? AND p.role = 'community'
  `).get(currentStudy.id) as { count: number };
  if (Number(communityExisting.count) === 0) {
    const allApps = db.prepare(`
      SELECT * FROM vg_async_apps
      WHERE study_id = ? AND status = 'published'
      ORDER BY creator_code
    `).all(currentStudy.id) as any[];
    if (allApps.length === 12) {
      const communityMembers = db.prepare(`
        SELECT * FROM vg_async_participants
        WHERE study_id = ? AND role = 'community'
        ORDER BY code
      `).all(currentStudy.id) as any[];
      assignBalanced(communityMembers, allApps);
    }
  }

  for (const condition of ['control', 'experimental'] as CommunityCondition[]) {
    const existing = db.prepare(`
      SELECT COUNT(*) AS count FROM vg_async_assignments a
      JOIN vg_async_participants p
        ON p.study_id = a.study_id AND p.code = a.participant_code
      WHERE a.study_id = ? AND p.role = 'creator' AND p.condition_name = ?
    `).get(currentStudy.id, condition) as { count: number };
    if (Number(existing.count) > 0) continue;
    const apps = db.prepare(`
      SELECT * FROM vg_async_apps
      WHERE study_id = ? AND condition_name = ? AND status = 'published'
      ORDER BY creator_code
    `).all(currentStudy.id, condition) as any[];
    if (apps.length !== 6) continue;
    const participants = db.prepare(`
      SELECT * FROM vg_async_participants
      WHERE study_id = ? AND role = 'creator' AND condition_name = ?
      ORDER BY code
    `).all(currentStudy.id, condition) as any[];
    assignBalanced(participants, apps);
  }
}

export function startAsyncCommunityStudy(clientId: string) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = study();
  if (currentStudy.status !== 'setup') throw new Error('正式研究已经开始或结束。');
  const published = db.prepare(`
    SELECT COUNT(*) AS count
    FROM vg_async_apps
    WHERE study_id = ? AND status = 'published'
  `).get(currentStudy.id) as { count: number };
  if (Number(published.count) < 1) throw new Error('至少发布一个 Initial App 后才能记录正式研究开始。');
  ensureAssignments();
  const timestamp = now();
  db.prepare(`
    UPDATE vg_async_studies
    SET status = 'active', workflow_stage = 'synthesis_1', started_at = ?, updated_at = ?
    WHERE id = ?
  `).run(timestamp, timestamp, currentStudy.id);
  recordEvent(viewer.code, 'start_async_study', 'study', currentStudy.id);
  return getCommunityGalleryState(clientId);
}

export function closeAsyncCommunityStudy(clientId: string) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = study();
  if (currentStudy.status === 'closed') throw new Error('当前研究已经结束。');
  const timestamp = now();
  db.prepare(`
    UPDATE vg_async_studies
    SET status = 'closed', closed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(timestamp, timestamp, currentStudy.id);
  recordEvent(viewer.code, 'close_async_study', 'study', currentStudy.id);
  return getCommunityGalleryState(clientId);
}

export function startNewAsyncCommunityStudy(clientId: string) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = study();
  if (currentStudy.status !== 'closed') throw new Error('请先结束当前研究。');
  const nextId = createStudy();
  const timestamp = now();
  db.prepare(`
    INSERT INTO vg_async_sessions
      (study_id, client_id, participant_code, joined_at, last_seen_at)
    VALUES (?, ?, 'H01', ?, ?)
  `).run(nextId, clientId, timestamp, timestamp);
  recordEvent(viewer.code, 'create_async_study', 'study', nextId);
  return getCommunityGalleryState(clientId);
}

export function trackCommunityEvent(
  clientId: string,
  eventType: string,
  entityType?: string,
  entityId?: string,
  data?: Record<string, unknown>,
) {
  const viewer = requireParticipant(clientId);
  recordEvent(viewer.code, eventType, entityType, entityId, data);
  return { ok: true };
}

export function exportCommunityStudy(clientId: string) {
  requireViewer(clientId, 'host');
  const currentStudy = study();
  const tables = [
    'vg_async_participants',
    'vg_async_sessions',
    'vg_async_apps',
    'vg_async_versions',
    'vg_async_drafts',
    'vg_async_development_messages',
    'vg_async_comments',
    'vg_async_comment_likes',
    'vg_async_app_likes',
    'vg_async_basket_items',
    'vg_async_syntheses',
    'vg_async_synthesis_sources',
    'vg_async_synthesis_votes',
    'vg_async_stage_selections',
    'vg_async_generation_jobs',
    'vg_async_generation_events',
    'vg_async_notifications',
    'vg_async_assignments',
    'vg_async_events',
  ];
  const data = Object.fromEntries(tables.map((table) => [
    table.replace('vg_async_', ''),
    db.prepare(`SELECT * FROM ${table} WHERE study_id = ? ORDER BY rowid`).all(currentStudy.id),
  ]));
  recordEvent('H01', 'export_study_data', 'study', currentStudy.id);
  return {
    exported_at: now(),
    study: currentStudy,
    ...data,
  };
}

export function getCommunityPreview(
  clientId: string,
  appId: string,
  version: 'initial' | 'community' | 'draft',
  requestedVersionId?: number,
) {
  const { viewer, app } = accessibleApp(clientId, appId);
  if (version === 'draft') {
    if (viewer.role !== 'creator' || viewer.code !== app.creator_code) throw new Error('只有 Creator 可以预览草稿。');
    const draft = db.prepare(`
      SELECT code FROM vg_async_drafts WHERE study_id = ? AND app_id = ?
    `).get(study().id, app.id) as { code?: string } | undefined;
    return draft?.code || '';
  }
  const versionId = requestedVersionId || (
    version === 'community' ? app.community_version_id : app.initial_version_id
  );
  if (!versionId) return '';
  const row = db.prepare(`
    SELECT code FROM vg_async_versions WHERE study_id = ? AND app_id = ? AND id = ?
  `).get(study().id, app.id, versionId) as { code?: string } | undefined;
  return row?.code || '';
}

export function getCommunityGalleryState(clientId = '') {
  const currentStudy = study();
  if (currentStudy.status !== 'closed') ensureAssignments();
  const viewer = getCommunityViewer(clientId);
  const visibleCondition = viewer?.role === 'creator' ? viewer.condition : null;
  const apps = viewer
    ? db.prepare(`
        SELECT a.*,
          (SELECT COUNT(*) FROM vg_async_app_likes l WHERE l.study_id = a.study_id AND l.app_id = a.id) AS like_count,
          (SELECT COUNT(*) FROM vg_async_comments c
            WHERE c.study_id = a.study_id AND c.app_id = a.id AND c.target_type = 'app' AND c.deleted_at IS NULL) AS comment_count,
          (SELECT COUNT(*) FROM vg_async_syntheses s
            WHERE s.study_id = a.study_id AND s.target_app_id = a.id
              AND s.withdrawn_at IS NULL) AS synthesis_count,
          (SELECT COUNT(*) FROM vg_async_versions v
            WHERE v.study_id = a.study_id AND v.app_id = a.id AND v.kind = 'community') AS community_version_count,
          EXISTS(SELECT 1 FROM vg_async_app_likes l
            WHERE l.study_id = a.study_id AND l.app_id = a.id AND l.participant_code = ?) AS viewer_liked,
          d.kind AS draft_kind, d.code AS draft_code, d.summary AS draft_summary,
          d.prompt AS draft_prompt, d.synthesis_id AS draft_synthesis_id,
          d.iteration_number AS draft_iteration_number,
          d.base_version_id AS draft_base_version_id,
          d.selection_reason AS draft_selection_reason
        FROM vg_async_apps a
        LEFT JOIN vg_async_drafts d ON d.study_id = a.study_id AND d.app_id = a.id
        WHERE a.study_id = ?
          AND (? IS NULL OR a.condition_name = ?)
          AND (a.status = 'published' OR a.creator_code = ? OR ? = 'host')
        ORDER BY a.condition_name, a.published_at, a.creator_code
      `).all(
        viewer.code,
        currentStudy.id,
        visibleCondition,
        visibleCondition,
        viewer.code,
        viewer.role,
      ) as any[]
    : [];

  const appIds = apps.map((app) => app.id);
  const placeholders = appIds.map(() => '?').join(',');
  const versions = appIds.length
    ? db.prepare(`
        SELECT id, app_id, version_number, kind, title, summary, prompt, synthesis_id,
          base_version_id, selection_reason, created_at
        FROM vg_async_versions
        WHERE study_id = ? AND app_id IN (${placeholders})
        ORDER BY app_id, version_number
      `).all(currentStudy.id, ...appIds) as any[]
    : [];
  const comments = appIds.length
    ? db.prepare(`
        SELECT c.*,
          COUNT(l.participant_code) AS like_count,
          EXISTS(SELECT 1 FROM vg_async_comment_likes vl
            WHERE vl.study_id = c.study_id AND vl.comment_id = c.id AND vl.participant_code = ?) AS viewer_liked,
          EXISTS(SELECT 1 FROM vg_async_basket_items b
            WHERE b.study_id = c.study_id AND b.participant_code = ?
              AND b.source_type = 'comment' AND b.source_id = c.id) AS viewer_in_basket
        FROM vg_async_comments c
        LEFT JOIN vg_async_comment_likes l
          ON l.study_id = c.study_id AND l.comment_id = c.id
        WHERE c.study_id = ? AND c.deleted_at IS NULL
          AND c.app_id IN (${placeholders})
        GROUP BY c.id
        ORDER BY c.created_at
      `).all(viewer?.code || '', viewer?.code || '', currentStudy.id, ...appIds) as any[]
    : [];

  const syntheses = appIds.length
    ? db.prepare(`
        SELECT s.*,
          EXISTS(SELECT 1 FROM vg_async_basket_items b
            WHERE b.study_id = s.study_id AND b.participant_code = ?
              AND b.source_type = 'synthesis' AND b.source_id = s.id) AS viewer_in_basket
        FROM vg_async_syntheses s
        WHERE s.study_id = ? AND s.target_app_id IN (${placeholders})
          AND s.withdrawn_at IS NULL
        ORDER BY s.created_at
      `).all(viewer?.code || '', currentStudy.id, ...appIds) as any[]
    : [];
  const synthesisVotes = appIds.length
    ? db.prepare(`
        SELECT * FROM vg_async_synthesis_votes
        WHERE study_id = ? AND target_app_id IN (${placeholders})
        ORDER BY created_at
      `).all(currentStudy.id, ...appIds) as any[]
    : [];

  const synthesisSources = syntheses.flatMap((synthesis) =>
    resolveSynthesisSources(Number(synthesis.id)).map((source) => ({
      ...source,
      synthesis_id: synthesis.id,
    })),
  );
  const stageSelections = appIds.length
    ? db.prepare(`
        SELECT * FROM vg_async_stage_selections
        WHERE study_id = ? AND app_id IN (${placeholders})
        ORDER BY iteration_number, app_id
      `).all(currentStudy.id, ...appIds) as any[]
    : [];
  const selectedIterationBySynthesis = new Map(
    stageSelections.map((selection) => [
      Number(selection.synthesis_id),
      Number(selection.iteration_number),
    ]),
  );
  const liveStatsBySynthesis = new Map<number, { score: number; votes: number }>();
  appIds.forEach((appId) => {
    ([1, 2] as const).forEach((layer) => {
      scoredSynthesisCandidates(appId, layer).forEach((candidate) => {
        liveStatsBySynthesis.set(Number(candidate.id), {
          score: Number(candidate.community_score),
          votes: Number(candidate.vote_count),
        });
      });
    });
  });
  const synthesisSummary = new Map<number, { apps: Set<string>; contributors: Set<string> }>();
  synthesisSources.forEach((source) => {
    const current = synthesisSummary.get(Number(source.synthesis_id)) || {
      apps: new Set<string>(),
      contributors: new Set<string>(),
    };
    current.apps.add(source.app_id);
    current.contributors.add(source.author_code);
    synthesisSummary.set(Number(source.synthesis_id), current);
  });
  const enrichedSyntheses = syntheses.map((synthesis) => {
    const summary = synthesisSummary.get(Number(synthesis.id));
    const liveStats = liveStatsBySynthesis.get(Number(synthesis.id));
    const viewerVote = synthesisVotes.find((vote) => (
      vote.participant_code === viewer?.code
      && vote.target_app_id === synthesis.target_app_id
      && Number(vote.layer) === Number(synthesis.layer)
    ));
    return {
      ...synthesis,
      source_count: synthesisSources.filter((source) => Number(source.synthesis_id) === Number(synthesis.id)).length,
      source_app_count: summary?.apps.size || 0,
      contributor_count: summary?.contributors.size || 0,
      community_score: liveStats?.score || 0,
      vote_count: liveStats?.votes || 0,
      viewer_voted: Number(viewerVote?.synthesis_id) === Number(synthesis.id) ? 1 : 0,
      viewer_vote_available: viewerVote && !viewerVote.synthesis_id ? 1 : 0,
      selected_for_iteration: selectedIterationBySynthesis.get(Number(synthesis.id)) || null,
    };
  });

  const basket = viewer && viewer.role !== 'host'
    ? (db.prepare(`
        SELECT * FROM vg_async_basket_items
        WHERE study_id = ? AND participant_code = ?
        ORDER BY added_at
      `).all(currentStudy.id, viewer.code) as any[])
        .map((item) => ({ ...item, ...sourceRecord(item.source_type, Number(item.source_id)) }))
        .filter((item) => item.content)
    : [];

  const assignments = viewer
    ? db.prepare(`
        SELECT a.*, app.title AS app_title
        FROM vg_async_assignments a
        JOIN vg_async_apps app ON app.id = a.app_id
        WHERE a.study_id = ? AND (? = 'host' OR a.participant_code = ?)
        ORDER BY a.participant_code, a.position
      `).all(currentStudy.id, viewer.role, viewer.code) as any[]
    : [];

  const generationJobs = appIds.length
    ? db.prepare(`
        SELECT j.*, a.title AS app_title
        FROM vg_async_generation_jobs j
        JOIN vg_async_apps a ON a.id = j.app_id
        WHERE j.study_id = ? AND j.app_id IN (${placeholders})
        ORDER BY j.id DESC
      `).all(currentStudy.id, ...appIds) as any[]
    : [];
  const jobIds = generationJobs.map((job) => job.id);
  const jobPlaceholders = jobIds.map(() => '?').join(',');
  const generationEvents = jobIds.length
    ? db.prepare(`
        SELECT * FROM vg_async_generation_events
        WHERE study_id = ? AND job_id IN (${jobPlaceholders})
        ORDER BY job_id, sort_order, id
      `).all(currentStudy.id, ...jobIds) as any[]
    : [];

  const developmentMessages = viewer?.role === 'creator'
    ? db.prepare(`
        SELECT m.* FROM vg_async_development_messages m
        JOIN vg_async_apps a ON a.id = m.app_id
        WHERE m.study_id = ? AND a.creator_code = ?
        ORDER BY m.id
      `).all(currentStudy.id, viewer.code) as any[]
    : [];

  const notifications = viewer && viewer.role !== 'host'
    ? db.prepare(`
        SELECT n.*, a.title AS app_title
        FROM vg_async_notifications n
        JOIN vg_async_apps a ON a.id = n.app_id
        WHERE n.study_id = ? AND n.participant_code = ?
        ORDER BY n.created_at DESC, n.id DESC
      `).all(currentStudy.id, viewer.code) as any[]
    : [];

  const participantRows = viewer?.role === 'host'
    ? db.prepare(`
        SELECT p.*,
          EXISTS(SELECT 1 FROM vg_async_sessions s
            WHERE s.study_id = p.study_id AND s.participant_code = p.code) AS joined
        FROM vg_async_participants p
        WHERE p.study_id = ?
        ORDER BY p.role, p.code
      `).all(currentStudy.id)
    : [];

  const publishedCounts = db.prepare(`
    SELECT condition_name, COUNT(*) AS count
    FROM vg_async_apps
    WHERE study_id = ? AND status = 'published'
    GROUP BY condition_name
  `).all(currentStudy.id) as any[];

  return {
    study: currentStudy,
    viewer,
    apps,
    versions,
    comments,
    syntheses: enrichedSyntheses,
    synthesisSources,
    stageSelections,
    basket,
    assignments,
    generationJobs,
    generationEvents,
    notifications,
    developmentMessages,
    participants: participantRows,
    aiProvider: getAIProvider(),
    counts: {
      creators: CREATOR_COUNT,
      communityMembers: COMMUNITY_COUNT,
      controlApps: Number(publishedCounts.find((row) => row.condition_name === 'control')?.count || 0),
      experimentalApps: Number(publishedCounts.find((row) => row.condition_name === 'experimental')?.count || 0),
    },
    serverNow: now(),
  };
}
