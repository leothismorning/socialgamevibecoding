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
const CONTROL_CREATOR_COUNT = CREATOR_COUNT / 2;
const CONTROL_COMMUNITY_COUNT = COMMUNITY_COUNT / 2;
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
    selected_source_type TEXT,
    selected_source_id INTEGER,
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
    selected_source_type TEXT,
    selected_source_id INTEGER,
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
    selected_source_type TEXT,
    selected_source_id INTEGER,
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

  CREATE TABLE IF NOT EXISTS vg_async_creator_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    version_id INTEGER NOT NULL,
    creator_code TEXT NOT NULL,
    code TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vg_async_creator_operations (
    id TEXT PRIMARY KEY,
    study_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    creator_code TEXT NOT NULL,
    app_id TEXT,
    phase TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    error TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS vg_async_creator_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    step_key TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (operation_id, step_key)
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

  CREATE TABLE IF NOT EXISTS vg_async_synthesis_likes (
    study_id TEXT NOT NULL,
    synthesis_id INTEGER NOT NULL,
    participant_code TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (study_id, synthesis_id, participant_code)
  );

  CREATE TABLE IF NOT EXISTS vg_async_stage_selections (
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    iteration_number INTEGER NOT NULL,
    synthesis_id INTEGER NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'synthesis',
    source_id INTEGER,
    source_title TEXT NOT NULL DEFAULT '',
    source_content TEXT NOT NULL DEFAULT '',
    source_author_code TEXT NOT NULL DEFAULT '',
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
    selected_source_type TEXT NOT NULL DEFAULT 'synthesis',
    selected_source_id INTEGER,
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
    source_type TEXT NOT NULL DEFAULT 'synthesis',
    source_id INTEGER,
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
ensureColumn('vg_async_versions', 'selected_source_type', 'TEXT');
ensureColumn('vg_async_versions', 'selected_source_id', 'INTEGER');
ensureColumn('vg_async_drafts', 'iteration_number', 'INTEGER');
ensureColumn('vg_async_drafts', 'base_version_id', 'INTEGER');
ensureColumn('vg_async_drafts', 'selection_reason', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('vg_async_drafts', 'selected_source_type', 'TEXT');
ensureColumn('vg_async_drafts', 'selected_source_id', 'INTEGER');
ensureColumn('vg_async_generation_jobs', 'iteration_number', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('vg_async_generation_jobs', 'base_version_id', 'INTEGER');
ensureColumn('vg_async_generation_jobs', 'selection_reason', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('vg_async_generation_jobs', 'selected_source_type', `TEXT NOT NULL DEFAULT 'synthesis'`);
ensureColumn('vg_async_generation_jobs', 'selected_source_id', 'INTEGER');
ensureColumn('vg_async_studies', 'workflow_stage', `TEXT NOT NULL DEFAULT 'synthesis_1'`);
ensureColumn('vg_async_syntheses', 'layer', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('vg_async_syntheses', 'withdrawn_at', 'TEXT');
ensureColumn('vg_async_syntheses', 'withdrawn_for_vote', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('vg_async_syntheses', 'deleted_at', 'TEXT');
ensureColumn('vg_async_apps', 'selected_source_type', 'TEXT');
ensureColumn('vg_async_apps', 'selected_source_id', 'INTEGER');
ensureColumn('vg_async_stage_selections', 'source_type', `TEXT NOT NULL DEFAULT 'synthesis'`);
ensureColumn('vg_async_stage_selections', 'source_id', 'INTEGER');
ensureColumn('vg_async_stage_selections', 'source_title', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('vg_async_stage_selections', 'source_content', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('vg_async_stage_selections', 'source_author_code', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('vg_async_notifications', 'source_type', `TEXT NOT NULL DEFAULT 'synthesis'`);
ensureColumn('vg_async_notifications', 'source_id', 'INTEGER');
db.exec(`
  UPDATE vg_async_stage_selections
  SET source_id = synthesis_id
  WHERE source_id IS NULL;
  UPDATE vg_async_generation_jobs
  SET selected_source_id = synthesis_id
  WHERE selected_source_id IS NULL;
  UPDATE vg_async_drafts
  SET selected_source_type = 'synthesis', selected_source_id = synthesis_id
  WHERE synthesis_id IS NOT NULL AND selected_source_id IS NULL;
  UPDATE vg_async_versions
  SET selected_source_type = 'synthesis', selected_source_id = synthesis_id
  WHERE synthesis_id IS NOT NULL AND selected_source_id IS NULL;
  UPDATE vg_async_apps
  SET selected_source_type = 'synthesis', selected_source_id = selected_synthesis_id
  WHERE selected_synthesis_id IS NOT NULL AND selected_source_id IS NULL;
  UPDATE vg_async_notifications
  SET source_id = synthesis_id
  WHERE source_id IS NULL;
`);
db.exec(`
  UPDATE vg_async_syntheses
  SET layer = CASE
    WHEN target_version_id IN (
      SELECT id FROM vg_async_versions WHERE kind = 'community'
    ) THEN 2
    ELSE 1
  END
`);
db.exec(`
  INSERT OR IGNORE INTO vg_async_synthesis_likes
    (study_id, synthesis_id, participant_code, created_at)
  SELECT study_id, synthesis_id, participant_code, COALESCE(voted_at, created_at)
  FROM vg_async_synthesis_votes
  WHERE synthesis_id IS NOT NULL
`);

const synthesisColumns = db.prepare(`PRAGMA table_info(vg_async_syntheses)`).all() as Array<{ name: string }>;
if (!synthesisColumns.some((column) => column.name === 'target_version_id')) {
  db.exec(`ALTER TABLE vg_async_syntheses ADD COLUMN target_version_id INTEGER`);
}

function seedParticipants(studyId: string) {
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
  insert.run(studyId, 'H01', 'host', null, timestamp);
  creatorCodes.forEach((code) => insert.run(studyId, code, 'creator', 'experimental', timestamp));
  communityCodes.forEach((code) => insert.run(studyId, code, 'community', 'experimental', timestamp));
}

function conditionAssignmentKey(studyId: string) {
  return `host_condition_assignment_v1:${studyId}`;
}

function conditionsConfigured(studyId: string) {
  const configured = db.prepare(`
    SELECT value FROM vg_async_settings WHERE key = ?
  `).get(conditionAssignmentKey(studyId)) as { value?: string } | undefined;
  return configured?.value === '1';
}

export function setCommunityStudyConditions(
  clientId: string,
  controlCreatorCodes: string[],
  controlCommunityCodes: string[],
) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = study();
  if (currentStudy.status !== 'setup') throw new Error('研究开始后不能修改实验分组。');
  const normalize = (values: string[]) => [...new Set(
    values.map((value) => String(value).trim().toUpperCase()).filter(Boolean),
  )].sort();
  const creators = normalize(controlCreatorCodes);
  const communityMembers = normalize(controlCommunityCodes);
  if (creators.length !== CONTROL_CREATOR_COUNT) {
    throw new Error(`请选择恰好 ${CONTROL_CREATOR_COUNT} 名 Creator 作为对照组。`);
  }
  if (communityMembers.length !== CONTROL_COMMUNITY_COUNT) {
    throw new Error(`请选择恰好 ${CONTROL_COMMUNITY_COUNT} 名 Community Member 作为对照组。`);
  }
  const participantRows = db.prepare(`
    SELECT code, role FROM vg_async_participants WHERE study_id = ?
  `).all(currentStudy.id) as Array<{ code: string; role: CommunityRole }>;
  const roleByCode = new Map(participantRows.map((participant) => [
    participant.code,
    participant.role,
  ]));
  if (creators.some((code) => roleByCode.get(code) !== 'creator')) {
    throw new Error('对照组 Creator 列表中包含无效编号。');
  }
  if (communityMembers.some((code) => roleByCode.get(code) !== 'community')) {
    throw new Error('对照组 Community Member 列表中包含无效编号。');
  }
  const advancedActivity = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM vg_async_syntheses WHERE study_id = ?) +
      (SELECT COUNT(*) FROM vg_async_versions WHERE study_id = ? AND kind = 'community') +
      (SELECT COUNT(*) FROM vg_async_generation_jobs WHERE study_id = ?) AS count
  `).get(currentStudy.id, currentStudy.id, currentStudy.id) as { count: number };
  if (Number(advancedActivity.count) > 0) {
    throw new Error('已经产生综合评论或 Community Version，不能再修改实验分组。');
  }
  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE vg_async_participants
      SET condition_name = 'experimental'
      WHERE study_id = ? AND role IN ('creator', 'community')
    `).run(currentStudy.id);
    const setControl = db.prepare(`
      UPDATE vg_async_participants
      SET condition_name = 'control'
      WHERE study_id = ? AND code = ?
    `);
    creators.forEach((code) => setControl.run(currentStudy.id, code));
    communityMembers.forEach((code) => setControl.run(currentStudy.id, code));
    db.prepare(`
      UPDATE vg_async_apps
      SET condition_name = (
        SELECT p.condition_name
        FROM vg_async_participants p
        WHERE p.study_id = vg_async_apps.study_id
          AND p.code = vg_async_apps.creator_code
      ),
      updated_at = ?
      WHERE study_id = ?
    `).run(timestamp, currentStudy.id);
    db.prepare(`
      INSERT INTO vg_async_settings (key, value, updated_at)
      VALUES (?, '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(conditionAssignmentKey(currentStudy.id), timestamp);
  });
  transaction();
  recordEvent(viewer.code, 'configure_study_conditions', 'study', currentStudy.id, {
    controlCreatorCodes: creators,
    controlCommunityCodes: communityMembers,
  });
  return getCommunityGalleryState(clientId);
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
  conversation?: {
    creator: string;
    assistant: string;
  };
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
    if (input.conversation) {
      db.prepare(`
        DELETE FROM vg_async_development_messages
        WHERE study_id = ? AND app_id = ? AND phase = 'initial'
      `).run(currentStudy.id, appId);
      const insertMessage = db.prepare(`
        INSERT INTO vg_async_development_messages
          (study_id, app_id, phase, role, content, created_at)
        VALUES (?, ?, 'initial', ?, ?, ?)
      `);
      insertMessage.run(
        currentStudy.id,
        appId,
        'creator',
        input.conversation.creator.trim(),
        timestamp,
      );
      insertMessage.run(
        currentStudy.id,
        appId,
        'assistant',
        input.conversation.assistant.trim(),
        timestamp,
      );
    }
  });
  transaction();
  recordEvent(viewer.code, 'save_initial_draft', 'app', appId);
  return getCommunityGalleryState(input.clientId);
}

export function startCreatorDevelopmentOperation(
  clientId: string,
  operationId: string,
  action: 'generate' | 'refine',
  phase: 'initial' | 'project' = 'initial',
) {
  const viewer = requireViewer(clientId, 'creator');
  const currentStudy = study();
  if (currentStudy.status === 'closed') {
    throw new Error('研究已经结束，不能继续修改项目。');
  }
  if (phase === 'initial' && currentStudy.status !== 'setup') {
    throw new Error('Initial Version 创作阶段已经结束。');
  }
  const normalizedId = operationId.trim();
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(normalizedId)) {
    throw new Error('无效的开发任务编号。');
  }
  const running = db.prepare(`
    SELECT id FROM vg_async_creator_operations
    WHERE study_id = ? AND creator_code = ? AND status = 'running'
  `).get(currentStudy.id, viewer.code) as { id?: string } | undefined;
  if (running) throw new Error('当前已有一个 AI 开发任务正在进行，请等待完成。');
  const app = db.prepare(`
    SELECT id FROM vg_async_apps WHERE study_id = ? AND creator_code = ?
  `).get(currentStudy.id, viewer.code) as { id?: string } | undefined;
  if (phase === 'project' && !app?.id) throw new Error('请先创建并发布项目。');
  const timestamp = now();
  db.prepare(`
    INSERT INTO vg_async_creator_operations
      (id, study_id, client_id, creator_code, app_id, phase, action, status, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?)
  `).run(
    normalizedId,
    currentStudy.id,
    clientId,
    viewer.code,
    app?.id || null,
    phase,
    action,
    timestamp,
  );
  recordEvent(viewer.code, 'start_creator_development', 'creator_operation', normalizedId, {
    action,
    phase,
  });
  return normalizedId;
}

export function recordCreatorDevelopmentProgress(
  operationId: string,
  progress: DevelopmentAgentProgress,
) {
  const operation = db.prepare(`
    SELECT * FROM vg_async_creator_operations WHERE id = ?
  `).get(operationId) as any;
  if (!operation || operation.status !== 'running') return;
  const timestamp = now();
  db.prepare(`
    INSERT INTO vg_async_creator_progress
      (study_id, operation_id, step_key, sort_order, status, title, detail, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(operation_id, step_key) DO UPDATE SET
      sort_order = excluded.sort_order,
      status = excluded.status,
      title = excluded.title,
      detail = excluded.detail,
      updated_at = excluded.updated_at
  `).run(
    operation.study_id,
    operationId,
    progress.step,
    progress.order,
    progress.status,
    progress.title,
    progress.detail || '',
    timestamp,
    timestamp,
  );
}

export function completeCreatorDevelopmentOperation(operationId: string, appId?: string) {
  const operation = db.prepare(`
    SELECT * FROM vg_async_creator_operations WHERE id = ?
  `).get(operationId) as any;
  if (!operation) return;
  db.prepare(`
    UPDATE vg_async_creator_operations
    SET status = 'completed', app_id = COALESCE(?, app_id), error = NULL, completed_at = ?
    WHERE id = ?
  `).run(appId || null, now(), operationId);
  recordEvent(
    operation.creator_code,
    'complete_creator_development',
    'creator_operation',
    operationId,
    { action: operation.action, phase: operation.phase },
  );
}

export function failCreatorDevelopmentOperation(operationId: string, error: unknown) {
  const operation = db.prepare(`
    SELECT * FROM vg_async_creator_operations WHERE id = ?
  `).get(operationId) as any;
  if (!operation) return;
  const message = error instanceof Error ? error.message : String(error);
  db.prepare(`
    UPDATE vg_async_creator_operations
    SET status = 'failed', error = ?, completed_at = ?
    WHERE id = ?
  `).run(message, now(), operationId);
  recordEvent(
    operation.creator_code,
    'fail_creator_development',
    'creator_operation',
    operationId,
    { action: operation.action, phase: operation.phase, error: message },
  );
}

export function getCreatorDevelopmentProgress(clientId: string, operationId: string) {
  const viewer = requireViewer(clientId, 'creator');
  const currentStudy = study();
  const operation = db.prepare(`
    SELECT * FROM vg_async_creator_operations
    WHERE id = ? AND study_id = ? AND client_id = ? AND creator_code = ?
  `).get(operationId, currentStudy.id, clientId, viewer.code) as any;
  if (!operation) throw new Error('开发任务不存在或已经失效。');
  const events = db.prepare(`
    SELECT step_key, sort_order, status, title, detail, updated_at
    FROM vg_async_creator_progress
    WHERE study_id = ? AND operation_id = ?
    ORDER BY sort_order, id
  `).all(currentStudy.id, operationId);
  return { ...operation, events };
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
  const persistedDraft = db.prepare(`
    SELECT * FROM vg_async_drafts WHERE study_id = ? AND app_id = ?
  `).get(study().id, app.id) as any;
  const latestPublishedVersion = db.prepare(`
    SELECT * FROM vg_async_versions
    WHERE study_id = ? AND app_id = ?
    ORDER BY version_number DESC, id DESC
    LIMIT 1
  `).get(study().id, app.id) as any;
  const draft = persistedDraft?.code
    ? persistedDraft
    : latestPublishedVersion?.code
      ? {
          ...latestPublishedVersion,
          kind: 'project',
          version_id: latestPublishedVersion.id,
          base_version_id: latestPublishedVersion.id,
        }
      : null;
  if (!draft?.code) throw new Error('当前没有可继续修改的项目。');
  const messagePhase = draft.kind === 'initial'
    ? 'initial'
    : draft.kind === 'project'
      ? 'project'
      : 'community';
  const messages = db.prepare(`
    SELECT * FROM vg_async_development_messages
    WHERE study_id = ? AND app_id = ? AND phase = ?
    ORDER BY id DESC LIMIT 8
  `).all(study().id, app.id, messagePhase) as any[];
  let synthesis = null;
  let selection = null;
  let sources: any[] = [];
  const selectedSourceType = draft.selected_source_type
    || (draft.synthesis_id ? 'synthesis' : null);
  const selectedSourceId = Number(draft.selected_source_id || draft.synthesis_id || 0);
  if (selectedSourceType && selectedSourceId) {
    selection = sourceRecord(selectedSourceType, selectedSourceId, {
      includeDeleted: true,
      revealDeletedContent: true,
    });
    if (selectedSourceType === 'synthesis') {
      synthesis = db.prepare(`SELECT * FROM vg_async_syntheses WHERE id = ?`).get(selectedSourceId) as any;
      sources = resolveSynthesisSources(selectedSourceId, true);
    } else if (selection) {
      sources = [selection];
    }
  }
  return {
    viewer,
    app,
    draft,
    messages: messages.reverse(),
    selection,
    synthesis,
    sources,
    messagePhase,
  };
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
    if (context.draft.kind === 'project') {
      const versionId = Number(
        context.draft.base_version_id
        || context.draft.version_id
        || context.draft.id,
      );
      if (!versionId) throw new Error('找不到当前修改所基于的已发布版本。');
      db.prepare(`
        INSERT INTO vg_async_drafts
          (study_id, app_id, kind, code, summary, prompt, synthesis_id,
           selected_source_type, selected_source_id, iteration_number,
           base_version_id, selection_reason, updated_at)
        VALUES (?, ?, 'project', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(study_id, app_id) DO UPDATE SET
          kind = 'project',
          code = excluded.code,
          summary = excluded.summary,
          prompt = excluded.prompt,
          synthesis_id = excluded.synthesis_id,
          selected_source_type = excluded.selected_source_type,
          selected_source_id = excluded.selected_source_id,
          iteration_number = excluded.iteration_number,
          base_version_id = excluded.base_version_id,
          selection_reason = excluded.selection_reason,
          updated_at = excluded.updated_at
      `).run(
        study().id,
        context.app.id,
        code,
        summary,
        context.draft.prompt || '',
        context.draft.synthesis_id || null,
        context.draft.selected_source_type || null,
        context.draft.selected_source_id || null,
        context.draft.version_number
          ? Math.max(0, Number(context.draft.version_number) - 1)
          : null,
        versionId,
        context.draft.selection_reason || '',
        timestamp,
      );
    } else {
      db.prepare(`
        UPDATE vg_async_drafts SET code = ?, summary = ?, updated_at = ?
        WHERE study_id = ? AND app_id = ?
      `).run(code, summary, timestamp, study().id, context.app.id);
    }
    const insertMessage = db.prepare(`
      INSERT INTO vg_async_development_messages
        (study_id, app_id, phase, role, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertMessage.run(study().id, context.app.id, context.messagePhase, 'creator', creatorMessage, timestamp);
    insertMessage.run(study().id, context.app.id, context.messagePhase, 'assistant', assistantMessage, timestamp);
  });
  transaction();
  recordEvent(context.viewer.code, 'refine_draft', 'app', context.app.id, {
    kind: context.draft.kind,
    publishedProjectUpdated: false,
    projectDraftSaved: context.draft.kind === 'project',
  });
  return getCommunityGalleryState(clientId);
}

export function publishProjectDraft(clientId: string) {
  const viewer = requireViewer(clientId, 'creator');
  const currentStudy = study();
  if (currentStudy.status === 'closed') {
    throw new Error('研究已经结束，不能继续发布项目更新。');
  }
  const app = db.prepare(`
    SELECT * FROM vg_async_apps
    WHERE study_id = ? AND creator_code = ? AND status = 'published'
  `).get(currentStudy.id, viewer.code) as any;
  if (!app) throw new Error('当前没有可以更新的已发布项目。');
  const draft = db.prepare(`
    SELECT * FROM vg_async_drafts
    WHERE study_id = ? AND app_id = ? AND kind = 'project'
  `).get(currentStudy.id, app.id) as any;
  if (!draft?.code) throw new Error('请先发送更新并生成项目草稿。');
  const latestVersion = db.prepare(`
    SELECT * FROM vg_async_versions
    WHERE study_id = ? AND app_id = ?
    ORDER BY version_number DESC, id DESC
    LIMIT 1
  `).get(currentStudy.id, app.id) as any;
  const versionId = Number(draft.base_version_id || 0);
  if (!latestVersion || Number(latestVersion.id) !== versionId) {
    throw new Error('项目已经出现更新版本，请刷新后基于最新版本重新修改。');
  }
  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE vg_async_versions SET code = ?, summary = ?
      WHERE study_id = ? AND app_id = ? AND id = ?
    `).run(draft.code, draft.summary, currentStudy.id, app.id, versionId);
    db.prepare(`
      UPDATE vg_async_apps SET updated_at = ?
      WHERE study_id = ? AND id = ?
    `).run(timestamp, currentStudy.id, app.id);
    db.prepare(`
      INSERT INTO vg_async_creator_revisions
        (study_id, app_id, version_id, creator_code, code, summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      currentStudy.id,
      app.id,
      versionId,
      viewer.code,
      draft.code,
      draft.summary,
      timestamp,
    );
    db.prepare(`
      DELETE FROM vg_async_drafts
      WHERE study_id = ? AND app_id = ? AND kind = 'project'
    `).run(currentStudy.id, app.id);
  });
  transaction();
  recordEvent(viewer.code, 'publish_project_revision', 'app', app.id, {
    versionId,
  });
  return getCommunityGalleryState(clientId);
}

function commentById(commentId: number) {
  return db.prepare(`
    SELECT * FROM vg_async_comments
    WHERE study_id = ? AND id = ? AND deleted_at IS NULL
  `).get(study().id, commentId) as any;
}

function commentByIdIncludingDeleted(commentId: number) {
  return db.prepare(`
    SELECT * FROM vg_async_comments
    WHERE study_id = ? AND id = ?
  `).get(study().id, commentId) as any;
}

function synthesisById(synthesisId: number) {
  return db.prepare(`
    SELECT * FROM vg_async_syntheses
    WHERE study_id = ? AND id = ? AND withdrawn_at IS NULL AND deleted_at IS NULL
  `).get(study().id, synthesisId) as any;
}

function synthesisByIdIncludingDeleted(synthesisId: number) {
  return db.prepare(`
    SELECT * FROM vg_async_syntheses
    WHERE study_id = ? AND id = ? AND withdrawn_at IS NULL
  `).get(study().id, synthesisId) as any;
}

function sourceRecord(
  sourceType: CommunitySourceType,
  sourceId: number,
  options: { includeDeleted?: boolean; revealDeletedContent?: boolean } = {},
) {
  if (sourceType === 'comment') {
    const comment = options.includeDeleted
      ? commentByIdIncludingDeleted(sourceId)
      : commentById(sourceId);
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
      content: comment.deleted_at && !options.revealDeletedContent
        ? '该评论已由作者删除。'
        : comment.content,
      created_at: comment.created_at,
      updated_at: comment.updated_at,
      deleted_at: comment.deleted_at || null,
      version_id: comment.version_id || null,
      version_kind: version?.kind || '',
      version_number: version?.version_number || null,
    };
  }
  const synthesis = options.includeDeleted
    ? synthesisByIdIncludingDeleted(sourceId)
    : synthesisById(sourceId);
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
    title: synthesis.deleted_at && !options.revealDeletedContent
      ? '该综合评论已由作者删除'
      : synthesis.title,
    content: synthesis.deleted_at && !options.revealDeletedContent
      ? '该综合评论已由作者删除。'
      : synthesis.content,
    created_at: synthesis.created_at,
    updated_at: synthesis.updated_at,
    deleted_at: synthesis.deleted_at || null,
    version_id: synthesis.target_version_id || null,
    version_kind: version?.kind || '',
    version_number: version?.version_number || null,
  };
}

function resolveSynthesisSources(synthesisId: number, revealDeletedContent = false) {
  const links = db.prepare(`
    SELECT * FROM vg_async_synthesis_sources
    WHERE study_id = ? AND synthesis_id = ?
    ORDER BY source_order
  `).all(study().id, synthesisId) as any[];
  return links
    .map((link) => ({
      ...link,
      ...sourceRecord(link.source_type, Number(link.source_id), {
        includeDeleted: true,
        revealDeletedContent,
      }),
    }))
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
        const comment = commentByIdIncludingDeleted(Number(source.source_id));
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
  sourceType: CommunitySourceType,
  sourceId: number,
  iterationNumber: number,
  creatorCode: string,
) {
  const selectedSource = sourceRecord(sourceType, sourceId, {
    includeDeleted: true,
    revealDeletedContent: true,
  });
  if (!selectedSource) return 0;
  const contributions = sourceType === 'synthesis'
    ? synthesisContributionAuthors(sourceId)
    : new Map([[selectedSource.author_code, new Set([`comment:${sourceId}`])]]);
  const timestamp = now();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO vg_async_notifications
      (study_id, participant_code, type, app_id, version_number, synthesis_id,
       source_type, source_id, title, content, source_count, created_at)
    VALUES (?, ?, 'contribution_selected', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let created = 0;
  contributions.forEach((sources, participantCode) => {
    if (participantCode === creatorCode) return;
    const result = insert.run(
      study().id,
      participantCode,
      app.id,
      iterationNumber,
      sourceType === 'synthesis' ? sourceId : 0,
      sourceType,
      sourceId,
      `你的创意进入 Community Version ${iterationNumber} 开发`,
      `Creator 已在《${app.title}》中采用“${selectedSource.title || selectedSource.content}”。你的 ${sources.size} 条创意贡献已经进入实际开发流程。`,
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
    WHERE study_id = ? AND target_app_id = ? AND layer = ?
      AND withdrawn_at IS NULL AND deleted_at IS NULL
    ORDER BY created_at, id
  `).all(study().id, appId, layer) as any[];
  const candidateIds = new Set(candidates.map((candidate) => Number(candidate.id)));
  const sourceCounts = candidateIds.size
    ? db.prepare(`
        SELECT source.synthesis_id, COUNT(*) AS count
        FROM vg_async_synthesis_sources source
        JOIN vg_async_syntheses synthesis ON synthesis.id = source.synthesis_id
        WHERE source.study_id = ? AND synthesis.target_app_id = ?
          AND synthesis.layer = ? AND synthesis.withdrawn_at IS NULL
          AND synthesis.deleted_at IS NULL
        GROUP BY source.synthesis_id
      `).all(study().id, appId, layer) as Array<{ synthesis_id: number; count: number }>
    : [];
  const sourceCountBySynthesis = new Map(
    sourceCounts.map((item) => [Number(item.synthesis_id), Number(item.count)]),
  );
  const likes = candidateIds.size
    ? db.prepare(`
        SELECT participant_code, synthesis_id
        FROM vg_async_synthesis_likes
        WHERE study_id = ? AND synthesis_id IN (
          SELECT id FROM vg_async_syntheses
          WHERE study_id = ? AND target_app_id = ? AND layer = ?
            AND withdrawn_at IS NULL AND deleted_at IS NULL
        )
      `).all(study().id, study().id, appId, layer) as Array<{
        participant_code: string;
        synthesis_id: number;
      }>
    : [];
  return candidates.map((candidate) => {
    const likeCount = likes.filter(
      (like) => Number(like.synthesis_id) === Number(candidate.id),
    ).length;
    return {
      ...candidate,
      source_count: sourceCountBySynthesis.get(Number(candidate.id)) || 0,
      vote_count: likeCount,
      community_score: likeCount,
      source_popularity_json: '{}',
    };
  });
}

function scoredDevelopmentCandidates(appId: string, iterationNumber: 1 | 2) {
  const app = appById(appId);
  if (!app) return [];
  const eligibleVersionId = iterationNumber === 1
    ? Number(app.initial_version_id)
    : Number(
        versionsForApp(appId).find(
          (version) => version.kind === 'community' && Number(version.version_number) === 2,
        )?.id || 0,
      );
  if (!eligibleVersionId) return [];
  const commentCandidates = db.prepare(`
    SELECT c.*,
      'comment' AS source_type,
      c.id AS source_id,
      COUNT(l.participant_code) AS score,
      0 AS source_count
    FROM vg_async_comments c
    LEFT JOIN vg_async_comment_likes l
      ON l.study_id = c.study_id AND l.comment_id = c.id
    WHERE c.study_id = ? AND c.app_id = ?
      AND c.target_type = 'app' AND c.deleted_at IS NULL
      AND c.version_id = ?
    GROUP BY c.id
  `).all(study().id, appId, eligibleVersionId) as any[];
  const synthesisCandidates = db.prepare(`
    SELECT s.*,
      'synthesis' AS source_type,
      s.id AS source_id,
      COUNT(l.participant_code) AS score,
      (
        SELECT COUNT(*)
        FROM vg_async_synthesis_sources source
        WHERE source.study_id = s.study_id AND source.synthesis_id = s.id
      ) AS source_count
    FROM vg_async_syntheses s
    LEFT JOIN vg_async_synthesis_likes l
      ON l.study_id = s.study_id AND l.synthesis_id = s.id
    WHERE s.study_id = ? AND s.target_app_id = ?
      AND s.layer = ?
      AND s.withdrawn_at IS NULL AND s.deleted_at IS NULL
    GROUP BY s.id
  `).all(study().id, appId, iterationNumber) as any[];
  return [
    ...commentCandidates.map((candidate) => ({
      ...candidate,
      title: `普通评论 · ${candidate.author_code}`,
      source_popularity_json: JSON.stringify({
        like_count: Number(candidate.score || 0),
        source_count: 0,
      }),
    })),
    ...synthesisCandidates.map((candidate) => ({
      ...candidate,
      source_popularity_json: JSON.stringify({
        like_count: Number(candidate.score || 0),
        source_count: Number(candidate.source_count || 0),
      }),
    })),
  ];
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
    candidates: scoredDevelopmentCandidates(app.id, iterationNumber),
  }));
  if (iterationNumber === 2) {
    const missingFirstVersion = experimentalApps.filter((app) => communityIterationCount(app.id) < 1);
    if (missingFirstVersion.length) {
      throw new Error(`仍有 ${missingFirstVersion.length} 个 App 未发布 Community Version 1。`);
    }
  }
  const missingCandidates = candidatesByApp.filter((entry) => entry.candidates.length === 0);
  if (missingCandidates.length) {
    throw new Error(iterationNumber === 2
      ? `仍有 ${missingCandidates.length} 个 App 没有针对 Community V1 的第二轮普通评论或第二轮综合评论。`
      : `仍有 ${missingCandidates.length} 个 App 没有可参与点赞评选的第一轮评论。`);
  }

  const winners = candidatesByApp.map(({ app, candidates }) => {
    const highestLikeCount = Math.max(...candidates.map((candidate) => Number(candidate.score || 0)));
    const likeLeaders = candidates.filter(
      (candidate) => Number(candidate.score || 0) === highestLikeCount,
    );
    const highestSourceCount = Math.max(
      ...likeLeaders.map((candidate) => Number(candidate.source_count || 0)),
    );
    const finalists = likeLeaders.filter(
      (candidate) => Number(candidate.source_count || 0) === highestSourceCount,
    );
    const selectedIndex = finalists.length > 1 ? randomInt(finalists.length) : 0;
    const selected = finalists[selectedIndex];
    const winner = {
      ...selected,
      source_popularity_json: JSON.stringify({
        like_count: highestLikeCount,
        source_count: highestSourceCount,
        random_tie_break: finalists.length > 1,
        random_pool: finalists.map((candidate) => ({
          source_type: candidate.source_type,
          source_id: Number(candidate.source_id),
        })),
        selected_random_index: selectedIndex,
      }),
    };
    return { app, winner };
  });
  const timestamp = now();
  let notificationCount = 0;
  const transaction = db.transaction(() => {
    const insert = db.prepare(`
      INSERT INTO vg_async_stage_selections
        (study_id, app_id, iteration_number, synthesis_id, source_type, source_id,
         source_title, source_content, source_author_code,
         score, source_popularity_json, selected_at, host_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(study_id, app_id, iteration_number) DO UPDATE SET
        synthesis_id = excluded.synthesis_id,
        source_type = excluded.source_type,
        source_id = excluded.source_id,
        source_title = excluded.source_title,
        source_content = excluded.source_content,
        source_author_code = excluded.source_author_code,
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
        winner.source_type === 'synthesis' ? winner.source_id : 0,
        winner.source_type,
        winner.source_id,
        winner.title || '',
        winner.content,
        winner.author_code,
        winner.score,
        winner.source_popularity_json,
        timestamp,
        viewer.code,
      );
      db.prepare(`
        UPDATE vg_async_apps
        SET selected_synthesis_id = ?, selected_source_type = ?,
          selected_source_id = ?, updated_at = ?
        WHERE study_id = ? AND id = ?
      `).run(
        winner.source_type === 'synthesis' ? winner.source_id : null,
        winner.source_type,
        winner.source_id,
        timestamp,
        currentStudy.id,
        app.id,
      );
      notificationCount += createContributionNotifications(
        app,
        winner.source_type,
        Number(winner.source_id),
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
      sourceType: winner.source_type,
      sourceId: winner.source_id,
      score: winner.score,
      sourceCount: Number(winner.source_count || 0),
      rankingRule: 'like_count_desc,source_count_desc,random_tie_break',
      eligibleRound: iterationNumber,
      selectionAudit: JSON.parse(winner.source_popularity_json),
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
        SET selected_synthesis_id = NULL, selected_source_type = NULL,
          selected_source_id = NULL, updated_at = ?
        WHERE study_id = ? AND condition_name = 'experimental'
      `).run(timestamp, currentStudy.id);
    } else {
      db.prepare(`
        UPDATE vg_async_apps
        SET selected_synthesis_id = (
          SELECT CASE WHEN selection.source_type = 'synthesis'
            THEN selection.source_id ELSE NULL END
          FROM vg_async_stage_selections selection
          WHERE selection.study_id = vg_async_apps.study_id
            AND selection.app_id = vg_async_apps.id
            AND selection.iteration_number = 1
        ), selected_source_type = (
          SELECT selection.source_type
          FROM vg_async_stage_selections selection
          WHERE selection.study_id = vg_async_apps.study_id
            AND selection.app_id = vg_async_apps.id
            AND selection.iteration_number = 1
        ), selected_source_id = (
          SELECT selection.source_id
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

export function updateCommunityComment(clientId: string, commentId: number, nextContent: string) {
  const viewer = requireParticipant(clientId);
  requireOpenStudy();
  const comment = commentById(commentId);
  if (!comment || comment.author_code !== viewer.code) throw new Error('只能编辑自己的评论。');
  accessibleApp(clientId, comment.app_id);
  const content = nextContent.trim();
  if (!content) throw new Error('评论内容不能为空。');
  if (content.length > 3000) throw new Error('评论不能超过 3000 字。');
  if (content === comment.content) return getCommunityGalleryState(clientId);
  const timestamp = now();
  db.prepare(`
    UPDATE vg_async_comments SET content = ?, updated_at = ?
    WHERE study_id = ? AND id = ? AND deleted_at IS NULL
  `).run(content, timestamp, study().id, commentId);
  recordEvent(viewer.code, 'edit_comment', 'comment', commentId, {
    appId: comment.app_id,
    targetType: comment.target_type,
    targetId: comment.target_id,
    previousContent: comment.content,
    content,
  });
  return getCommunityGalleryState(clientId);
}

export function deleteCommunityComment(clientId: string, commentId: number) {
  const viewer = requireParticipant(clientId);
  requireOpenStudy();
  const comment = commentById(commentId);
  if (!comment || comment.author_code !== viewer.code) throw new Error('只能删除自己的评论。');
  accessibleApp(clientId, comment.app_id);
  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE vg_async_comments SET deleted_at = ?, updated_at = ?
      WHERE study_id = ? AND id = ? AND deleted_at IS NULL
    `).run(timestamp, timestamp, study().id, commentId);
    db.prepare(`
      DELETE FROM vg_async_comment_likes
      WHERE study_id = ? AND comment_id = ?
    `).run(study().id, commentId);
    db.prepare(`
      DELETE FROM vg_async_basket_items
      WHERE study_id = ? AND source_type = 'comment' AND source_id = ?
    `).run(study().id, commentId);
  });
  transaction();
  recordEvent(viewer.code, 'delete_comment', 'comment', commentId, {
    appId: comment.app_id,
    targetType: comment.target_type,
    targetId: comment.target_id,
    previousContent: comment.content,
  });
  return getCommunityGalleryState(clientId);
}

export function toggleCommunityCommentLike(clientId: string, commentId: number) {
  const viewer = requireParticipant(clientId);
  requireOpenStudy();
  const comment = commentById(commentId);
  if (!comment) throw new Error('评论不存在。');
  accessibleApp(clientId, comment.app_id);
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
  if (currentStudy.status !== 'active') throw new Error('Host 开始研究后才能创建综合评论。');
  const layer = openSynthesisLayerForApp(app);
  if (!layer) throw new Error('当前阶段没有开放新的综合评论。');
  const existingSynthesis = db.prepare(`
    SELECT 1 FROM vg_async_syntheses
    WHERE study_id = ? AND author_code = ? AND target_app_id = ? AND layer = ?
      AND withdrawn_at IS NULL
  `).get(currentStudy.id, viewer.code, app.id, layer);
  if (existingSynthesis) throw new Error('每个人在每个 App 的本轮只能创建一条综合评论。');
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) throw new Error('请填写综合评论标题和完整的新方向。');
  const uniqueSources = input.sources.filter(
    (source, index, list) => list.findIndex((candidate) => candidate.type === source.type && candidate.id === source.id) === index,
  );
  if (uniqueSources.length < 1) throw new Error('请至少选择一条要理解和发展的创意素材。');
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

export function updateCommunitySynthesis(
  clientId: string,
  synthesisId: number,
  nextContent: string,
) {
  const viewer = requireParticipant(clientId);
  requireOpenStudy();
  const synthesis = synthesisById(synthesisId);
  if (!synthesis || synthesis.author_code !== viewer.code) {
    throw new Error('只能编辑自己的综合评论。');
  }
  accessibleApp(clientId, synthesis.target_app_id);
  const content = nextContent.trim();
  if (!content) throw new Error('综合评论内容不能为空。');
  if (content.length > 3000) throw new Error('综合评论不能超过 3000 字。');
  if (content === synthesis.content) return getCommunityGalleryState(clientId);
  const firstLine = content.split(/\r?\n/).find((line) => line.trim())?.trim() || content;
  const title = firstLine.length > 30 ? `${firstLine.slice(0, 30)}…` : firstLine;
  const timestamp = now();
  db.prepare(`
    UPDATE vg_async_syntheses SET title = ?, content = ?, updated_at = ?
    WHERE study_id = ? AND id = ? AND withdrawn_at IS NULL AND deleted_at IS NULL
  `).run(title, content, timestamp, study().id, synthesisId);
  recordEvent(viewer.code, 'edit_synthesis', 'synthesis', synthesisId, {
    targetAppId: synthesis.target_app_id,
    layer: synthesis.layer,
    previousTitle: synthesis.title,
    previousContent: synthesis.content,
    title,
    content,
  });
  return getCommunityGalleryState(clientId);
}

export function deleteCommunitySynthesis(clientId: string, synthesisId: number) {
  const viewer = requireParticipant(clientId);
  requireOpenStudy();
  const synthesis = synthesisById(synthesisId);
  if (!synthesis || synthesis.author_code !== viewer.code) {
    throw new Error('只能删除自己的综合评论。');
  }
  accessibleApp(clientId, synthesis.target_app_id);
  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE vg_async_syntheses SET deleted_at = ?, updated_at = ?
      WHERE study_id = ? AND id = ? AND withdrawn_at IS NULL AND deleted_at IS NULL
    `).run(timestamp, timestamp, study().id, synthesisId);
    db.prepare(`
      DELETE FROM vg_async_synthesis_likes
      WHERE study_id = ? AND synthesis_id = ?
    `).run(study().id, synthesisId);
    db.prepare(`
      DELETE FROM vg_async_basket_items
      WHERE study_id = ? AND source_type = 'synthesis' AND source_id = ?
    `).run(study().id, synthesisId);
  });
  transaction();
  recordEvent(viewer.code, 'delete_synthesis', 'synthesis', synthesisId, {
    targetAppId: synthesis.target_app_id,
    layer: synthesis.layer,
    previousTitle: synthesis.title,
    previousContent: synthesis.content,
  });
  return getCommunityGalleryState(clientId);
}

export function withdrawSynthesisForVote(clientId: string, synthesisId: number) {
  requireParticipant(clientId);
  requireOpenStudy();
  void synthesisId;
  throw new Error('综合评论提交后不能撤回；每个人可以直接给喜欢的综合评论点赞。');
}

export function voteForSynthesis(clientId: string, synthesisId: number) {
  const viewer = requireParticipant(clientId);
  const currentStudy = requireOpenStudy();
  if (viewer.role !== 'community' && viewer.condition !== 'experimental') {
    throw new Error('综合评论点赞只对 Community Commenter 和 Vibe Gallery Creator 开放。');
  }
  const synthesis = synthesisById(synthesisId);
  if (!synthesis) throw new Error('要点赞的综合评论不存在。');
  const { app } = accessibleApp(clientId, synthesis.target_app_id);
  const existingLike = db.prepare(`
    SELECT 1 FROM vg_async_synthesis_likes
    WHERE study_id = ? AND synthesis_id = ? AND participant_code = ?
  `).get(currentStudy.id, synthesisId, viewer.code);
  if (existingLike) {
    db.prepare(`
      DELETE FROM vg_async_synthesis_likes
      WHERE study_id = ? AND synthesis_id = ? AND participant_code = ?
    `).run(currentStudy.id, synthesisId, viewer.code);
  } else {
    db.prepare(`
      INSERT INTO vg_async_synthesis_likes
        (study_id, synthesis_id, participant_code, created_at)
      VALUES (?, ?, ?, ?)
    `).run(currentStudy.id, synthesisId, viewer.code, now());
  }
  recordEvent(viewer.code, existingLike ? 'unlike_synthesis' : 'like_synthesis', 'synthesis', synthesisId, {
    targetAppId: app.id,
    layer: synthesis.layer,
  });
  return getCommunityGalleryState(clientId);
}

function createCommunityGenerationJob(input: {
  actorCode: string;
  app: any;
  sourceType: CommunitySourceType,
  sourceId: number,
  creatorInstruction: string,
  requestedBaseVersionId?: number;
  selectionReason?: string;
  automated?: boolean;
}) {
  const currentStudy = requireOpenStudy();
  const { app } = input;
  if (app.condition_name !== 'experimental') throw new Error('对照组不提供平台内 AI 原型化。');
  const completedIterations = communityIterationCount(app.id);
  const iterationNumber = completedIterations + 1;
  if (iterationNumber > 2) throw new Error('该 App 已经完成两次 Community 开发。');
  if (currentStudy.workflow_stage !== `development_${iterationNumber}`) {
    throw new Error(`Host 尚未进入第 ${iterationNumber} 次开发阶段。`);
  }
  if (!['comment', 'synthesis'].includes(input.sourceType)) throw new Error('入选评论类型无效。');
  const selectedSource = sourceRecord(input.sourceType, input.sourceId, {
    includeDeleted: true,
    revealDeletedContent: true,
  });
  if (!selectedSource || selectedSource.app_id !== app.id) throw new Error('请选择当前 App 的入选评论。');
  const stageSelection = db.prepare(`
    SELECT * FROM vg_async_stage_selections
    WHERE study_id = ? AND app_id = ? AND iteration_number = ?
  `).get(currentStudy.id, app.id, iterationNumber) as any;
  if (
    !stageSelection
    || stageSelection.source_type !== input.sourceType
    || Number(stageSelection.source_id) !== Number(input.sourceId)
  ) {
    throw new Error('只能开发 Host 在当前阶段锁定的最高赞评论。');
  }
  const developmentPrompt = input.creatorInstruction.trim()
    || String(stageSelection.source_content || '').trim()
    || selectedSource.content.trim();
  if (!developmentPrompt) throw new Error('入选评论缺少可用于开发的提示词。');
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
  if (input.requestedBaseVersionId && Number(input.requestedBaseVersionId) !== baseVersionId) {
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
        (study_id, app_id, synthesis_id, selected_source_type, selected_source_id,
         iteration_number, base_version_id, selection_reason, creator_instruction,
         status, created_at, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)
    `).run(
      study().id,
      app.id,
      input.sourceType === 'synthesis' ? input.sourceId : 0,
      input.sourceType,
      input.sourceId,
      iterationNumber,
      baseVersionId,
      input.selectionReason?.trim() || '',
      developmentPrompt,
      timestamp,
      timestamp,
    );
    jobId = Number(result.lastInsertRowid);
  });
  transaction();
  recordEvent(input.actorCode, 'start_community_generation', 'generation_job', jobId, {
    appId: app.id,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    iterationNumber,
    baseVersionId,
    baseVersionNumber: baseVersion.version_number,
    selectionReason: input.selectionReason?.trim() || '',
    promptSource: input.creatorInstruction.trim() ? 'creator_adjusted' : 'selected_comment',
    automated: Boolean(input.automated),
  });
  return jobId;
}

export function startCommunityGeneration(
  clientId: string,
  appId: string,
  sourceType: CommunitySourceType,
  sourceId: number,
  creatorInstruction: string,
  requestedBaseVersionId?: number,
  selectionReason = '',
) {
  const { viewer, app } = ownedApp(clientId, appId);
  requireOpenStudy();
  const jobId = createCommunityGenerationJob({
    actorCode: viewer.code,
    app,
    sourceType,
    sourceId,
    creatorInstruction,
    requestedBaseVersionId,
    selectionReason,
  });
  return { jobId, state: getCommunityGalleryState(clientId) };
}

export function startAutomaticCommunityGeneration(
  clientId: string,
  appId: string,
  iterationNumber: 1 | 2,
) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = requireOpenStudy();
  if (currentStudy.workflow_stage !== `development_${iterationNumber}`) {
    throw new Error(`当前不在第 ${iterationNumber} 次开发阶段。`);
  }
  const app = appById(appId);
  if (!app || app.condition_name !== 'experimental' || app.status !== 'published') {
    throw new Error('自动开发的实验组 App 不存在。');
  }
  const selection = db.prepare(`
    SELECT * FROM vg_async_stage_selections
    WHERE study_id = ? AND app_id = ? AND iteration_number = ?
  `).get(currentStudy.id, appId, iterationNumber) as any;
  if (!selection) throw new Error('该 App 还没有 Host 锁定的开发方向。');
  const existingJob = db.prepare(`
    SELECT id FROM vg_async_generation_jobs
    WHERE study_id = ? AND app_id = ? AND iteration_number = ?
  `).get(currentStudy.id, appId, iterationNumber) as { id: number } | undefined;
  if (existingJob) {
    return { jobId: Number(existingJob.id), state: getCommunityGalleryState(clientId), existing: true };
  }
  const jobId = createCommunityGenerationJob({
    actorCode: viewer.code,
    app,
    sourceType: selection.source_type,
    sourceId: Number(selection.source_id),
    creatorInstruction: '',
    automated: true,
  });
  return { jobId, state: getCommunityGalleryState(clientId), existing: false };
}

export function retryCommunityGeneration(clientId: string, failedJobId: number) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = requireOpenStudy();
  const failedJob = db.prepare(`
    SELECT j.*, a.status AS app_status, a.condition_name
    FROM vg_async_generation_jobs j
    JOIN vg_async_apps a ON a.id = j.app_id
    WHERE j.study_id = ? AND j.id = ?
  `).get(currentStudy.id, failedJobId) as any;
  if (!failedJob) throw new Error('要重新开发的任务不存在。');
  if (failedJob.status !== 'failed') throw new Error('只有失败的开发任务可以重新开发。');
  if (failedJob.condition_name !== 'experimental' || failedJob.app_status !== 'published') {
    throw new Error('只有已发布的实验组 App 可以重新开发。');
  }
  const iterationNumber = Number(failedJob.iteration_number);
  if (iterationNumber !== 1 && iterationNumber !== 2) throw new Error('失败任务的开发阶段无效。');
  if (currentStudy.workflow_stage !== `development_${iterationNumber}`) {
    throw new Error(`当前已经不在第 ${iterationNumber} 次开发阶段，不能重新开发。`);
  }
  const latestJob = db.prepare(`
    SELECT id, status FROM vg_async_generation_jobs
    WHERE study_id = ? AND app_id = ? AND iteration_number = ?
    ORDER BY id DESC LIMIT 1
  `).get(currentStudy.id, failedJob.app_id, iterationNumber) as any;
  if (!latestJob || Number(latestJob.id) !== Number(failedJobId)) {
    throw new Error('该 App 已经有更新的开发任务。');
  }
  const publishedVersion = db.prepare(`
    SELECT 1 FROM vg_async_versions
    WHERE study_id = ? AND app_id = ? AND kind = 'community' AND version_number = ?
  `).get(currentStudy.id, failedJob.app_id, iterationNumber + 1);
  if (publishedVersion) throw new Error(`Community V${iterationNumber} 已经发布，不能重新开发。`);
  const stageSelection = db.prepare(`
    SELECT * FROM vg_async_stage_selections
    WHERE study_id = ? AND app_id = ? AND iteration_number = ?
  `).get(currentStudy.id, failedJob.app_id, iterationNumber) as any;
  if (!stageSelection) throw new Error('该 App 当前没有已锁定的开发方向。');

  const app = appById(failedJob.app_id);
  if (!app) throw new Error('失败任务对应的 App 不存在。');
  const jobId = createCommunityGenerationJob({
    actorCode: viewer.code,
    app,
    sourceType: stageSelection.source_type,
    sourceId: Number(stageSelection.source_id),
    creatorInstruction: '',
    requestedBaseVersionId: Number(failedJob.base_version_id),
    selectionReason: failedJob.selection_reason || '',
    automated: true,
  });
  recordEvent(viewer.code, 'retry_community_generation', 'generation_job', jobId, {
    retryOfJobId: Number(failedJobId),
    appId: failedJob.app_id,
    iterationNumber,
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
  const sourceType = (job.selected_source_type || 'synthesis') as CommunitySourceType;
  const sourceId = Number(job.selected_source_id || job.synthesis_id);
  const selection = sourceRecord(sourceType, sourceId, {
    includeDeleted: true,
    revealDeletedContent: true,
  });
  if (!selection) throw new Error('进入开发的评论已经不存在。');
  const synthesis = sourceType === 'synthesis' ? synthesisByIdIncludingDeleted(sourceId) : null;
  const sources = synthesis ? resolveSynthesisSources(sourceId, true) : [selection];
  return { job, selection, synthesis, sources };
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
         selected_source_type, selected_source_id, iteration_number,
         base_version_id, selection_reason, updated_at)
      VALUES (?, ?, 'community', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(study_id, app_id) DO UPDATE SET
        kind = 'community',
        code = excluded.code,
        summary = excluded.summary,
        prompt = excluded.prompt,
        synthesis_id = excluded.synthesis_id,
        selected_source_type = excluded.selected_source_type,
        selected_source_id = excluded.selected_source_id,
        iteration_number = excluded.iteration_number,
        base_version_id = excluded.base_version_id,
        selection_reason = excluded.selection_reason,
        updated_at = excluded.updated_at
    `).run(
      study().id,
      input.job.app_id,
      code,
      summary,
      input.job.creator_instruction || input.selection.content,
      input.job.selected_source_type === 'synthesis'
        ? input.job.selected_source_id
        : null,
      input.job.selected_source_type,
      input.job.selected_source_id,
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
  const app = appById(input.job.app_id);
  if (!app) throw new Error('生成完成后找不到需要自动发布的 App。');
  publishCommunityVersionForApp(input.job.creator_code, app, true);
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

function publishCommunityVersionForApp(actorCode: string, app: any, automated = false) {
  requireOpenStudy();
  const completedIterations = communityIterationCount(app.id);
  if (completedIterations >= 2) return;
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
         synthesis_id, selected_source_type, selected_source_id, base_version_id,
         selection_reason, created_at)
      VALUES (?, ?, ?, 'community', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      study().id,
      app.id,
      iterationNumber + 1,
      app.title,
      draft.code,
      draft.summary,
      draft.prompt,
      draft.synthesis_id,
      draft.selected_source_type || null,
      draft.selected_source_id || null,
      baseVersion.id,
      draft.selection_reason || '',
      timestamp,
    );
    db.prepare(`
      UPDATE vg_async_apps
      SET community_version_id = ?, selected_synthesis_id = ?,
        selected_source_type = ?, selected_source_id = ?,
        community_published_at = ?, updated_at = ?
      WHERE study_id = ? AND id = ?
    `).run(
      Number(result.lastInsertRowid),
      draft.synthesis_id || null,
      draft.selected_source_type || null,
      draft.selected_source_id || null,
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
  recordEvent(actorCode, 'publish_community_version', 'app', app.id, {
    synthesisId: draft.synthesis_id || null,
    sourceType: draft.selected_source_type || null,
    sourceId: draft.selected_source_id || null,
    iterationNumber,
    baseVersionId: baseVersion.id,
    baseVersionNumber: baseVersion.version_number,
    selectionReason: draft.selection_reason || '',
    automated,
  });
}

export function publishCommunityVersion(clientId: string, appId: string) {
  const { viewer, app } = ownedApp(clientId, appId);
  publishCommunityVersionForApp(viewer.code, app);
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
  if (!conditionsConfigured(currentStudy.id)) {
    throw new Error('请先由 Host 选择并保存对照组成员。');
  }
  const conditionCounts = db.prepare(`
    SELECT role, condition_name, COUNT(*) AS count
    FROM vg_async_participants
    WHERE study_id = ? AND role IN ('creator', 'community')
    GROUP BY role, condition_name
  `).all(currentStudy.id) as Array<{
    role: CommunityRole;
    condition_name: CommunityCondition;
    count: number;
  }>;
  const countFor = (role: CommunityRole, condition: CommunityCondition) => Number(
    conditionCounts.find((row) => (
      row.role === role && row.condition_name === condition
    ))?.count || 0,
  );
  if (
    countFor('creator', 'control') !== CONTROL_CREATOR_COUNT
    || countFor('creator', 'experimental') !== CREATOR_COUNT - CONTROL_CREATOR_COUNT
    || countFor('community', 'control') !== CONTROL_COMMUNITY_COUNT
    || countFor('community', 'experimental') !== COMMUNITY_COUNT - CONTROL_COMMUNITY_COUNT
  ) {
    throw new Error('实验分组人数不完整，请重新保存对照组设置。');
  }
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
    'vg_async_creator_revisions',
    'vg_async_creator_operations',
    'vg_async_creator_progress',
    'vg_async_comments',
    'vg_async_comment_likes',
    'vg_async_app_likes',
    'vg_async_basket_items',
    'vg_async_syntheses',
    'vg_async_synthesis_sources',
    'vg_async_synthesis_votes',
    'vg_async_synthesis_likes',
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
              AND s.withdrawn_at IS NULL AND s.deleted_at IS NULL) AS synthesis_count,
          (SELECT COUNT(*) FROM vg_async_versions v
            WHERE v.study_id = a.study_id AND v.app_id = a.id AND v.kind = 'community') AS community_version_count,
          EXISTS(SELECT 1 FROM vg_async_app_likes l
            WHERE l.study_id = a.study_id AND l.app_id = a.id AND l.participant_code = ?) AS viewer_liked,
          d.kind AS draft_kind, d.code AS draft_code, d.summary AS draft_summary,
          d.prompt AS draft_prompt, d.synthesis_id AS draft_synthesis_id,
          d.selected_source_type AS draft_selected_source_type,
          d.selected_source_id AS draft_selected_source_id,
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
          selected_source_type, selected_source_id, base_version_id,
          selection_reason, created_at
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
        WHERE c.study_id = ?
          AND c.app_id IN (${placeholders})
          AND (
            c.deleted_at IS NULL
            OR EXISTS (
              SELECT 1 FROM vg_async_comments child
              WHERE child.study_id = c.study_id AND child.parent_comment_id = c.id
            )
            OR EXISTS (
              SELECT 1 FROM vg_async_synthesis_sources source
              WHERE source.study_id = c.study_id
                AND source.source_type = 'comment' AND source.source_id = c.id
            )
            OR EXISTS (
              SELECT 1 FROM vg_async_stage_selections selection
              WHERE selection.study_id = c.study_id
                AND selection.source_type = 'comment' AND selection.source_id = c.id
            )
          )
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
          AND (
            s.deleted_at IS NULL
            OR s.author_code = ?
            OR EXISTS (
              SELECT 1 FROM vg_async_synthesis_sources source
              WHERE source.study_id = s.study_id
                AND source.source_type = 'synthesis' AND source.source_id = s.id
            )
            OR EXISTS (
              SELECT 1 FROM vg_async_stage_selections selection
              WHERE selection.study_id = s.study_id
                AND selection.source_type = 'synthesis' AND selection.source_id = s.id
            )
            OR EXISTS (
              SELECT 1 FROM vg_async_versions version
              WHERE version.study_id = s.study_id
                AND version.selected_source_type = 'synthesis'
                AND version.selected_source_id = s.id
            )
          )
        ORDER BY s.created_at
      `).all(
        viewer?.code || '',
        currentStudy.id,
        ...appIds,
        viewer?.code || '',
      ) as any[]
    : [];
  const synthesisLikes = appIds.length
    ? db.prepare(`
        SELECT likes.*, synthesis.target_app_id, synthesis.layer
        FROM vg_async_synthesis_likes likes
        JOIN vg_async_syntheses synthesis ON synthesis.id = likes.synthesis_id
        WHERE likes.study_id = ? AND synthesis.target_app_id IN (${placeholders})
        ORDER BY likes.created_at
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
  const selectedIterationBySource = new Map(
    stageSelections.map((selection) => [
      `${selection.source_type}:${Number(selection.source_id)}`,
      Number(selection.iteration_number),
    ]),
  );
  const enrichedComments = comments.map((comment) => ({
    ...comment,
    content: comment.deleted_at ? '该评论已由作者删除。' : comment.content,
    like_count: comment.deleted_at ? 0 : Number(comment.like_count || 0),
    viewer_liked: comment.deleted_at ? 0 : Number(comment.viewer_liked || 0),
    viewer_in_basket: comment.deleted_at ? 0 : Number(comment.viewer_in_basket || 0),
    selected_for_iteration: selectedIterationBySource.get(`comment:${Number(comment.id)}`) || null,
  }));
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
    const viewerLike = synthesisLikes.find((like) => (
      like.participant_code === viewer?.code
      && Number(like.synthesis_id) === Number(synthesis.id)
    ));
    const deleted = Boolean(synthesis.deleted_at);
    return {
      ...synthesis,
      title: deleted ? '该综合评论已由作者删除' : synthesis.title,
      content: deleted ? '该综合评论已由作者删除。' : synthesis.content,
      source_count: synthesisSources.filter((source) => Number(source.synthesis_id) === Number(synthesis.id)).length,
      source_app_count: summary?.apps.size || 0,
      contributor_count: summary?.contributors.size || 0,
      community_score: deleted ? 0 : liveStats?.score || 0,
      vote_count: deleted ? 0 : liveStats?.votes || 0,
      viewer_voted: deleted ? 0 : viewerLike ? 1 : 0,
      viewer_vote_available: !deleted && viewer
        && viewer.role !== 'host'
        && currentStudy.status !== 'closed'
        ? 1
        : 0,
      selected_for_iteration: selectedIterationBySource.get(`synthesis:${Number(synthesis.id)}`) || null,
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
    study: {
      ...currentStudy,
      conditions_configured: currentStudy.status !== 'setup'
        || conditionsConfigured(currentStudy.id),
    },
    viewer,
    apps,
    versions,
    comments: enrichedComments,
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
