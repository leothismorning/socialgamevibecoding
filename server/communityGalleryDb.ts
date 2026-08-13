import { randomInt, randomUUID } from 'node:crypto';
import { db } from './studyDb.js';
import type { DevelopmentAgentProgress } from './developmentAgent.js';

export type CommunityRole = 'host' | 'creator';
export type CommunityStatus = 'setup' | 'active' | 'closed';
export type CommunitySourceType = 'comment' | 'synthesis';
export type CommunityWorkspace = 'regular' | 'test';
export type CommunityDevelopmentProvider = 'deepseek-pro' | 'codex';
export type CommunityAppFlowStage =
  | 'waiting_round_1'
  | 'round_1'
  | 'development_1'
  | 'waiting_round_2'
  | 'round_2'
  | 'development_2'
  | 'completed';

const ACTIVE_STUDY_KEY = 'active_study_id';
const NUMERIC_LOGIN_MIGRATION_KEY = 'numeric_account_password_login_v1';
const INDIVIDUAL_APP_FLOW_MIGRATION_KEY = 'individual_app_flow_v1';
const AUTOMATIC_APP_ROUNDS_MIGRATION_KEY = 'automatic_app_rounds_v2';
const CREATOR_COUNT = 50;
const LEGACY_UNIFIED_CREATOR_COUNT = 30;
const CREATOR_CODES = Array.from(
  { length: CREATOR_COUNT },
  (_, index) => `C${String(index + 1).padStart(2, '0')}`,
);
const now = () => new Date().toISOString();
export const CODEX_COMMUNITY_DEVELOPMENT_PROMPT = `保留原文件，生成新的平台兼容版本。
修改简单、快速，重点突出评论中的创意和交互。
必须能直接上传并展示在我的平台中。
使用单个 HTML，尽量采用原生 HTML/CSS/JS。
不依赖外部图片、脚本、接口或网络资源。
保证按钮和交互真实可用。
不要长时间检查或过度开发，完成后直接提供文件。`;
const TEST_RESET_CONFIRMATION = '清除测试角色数据';
const COMMUNITY_STUDY_DATA_TABLES = [
  'vg_async_participants',
  'vg_async_workspace_states',
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
  'vg_async_version_likes',
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
  'vg_async_wildcards',
  'vg_async_contributors',
  'vg_async_events',
] as const;

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

  CREATE TABLE IF NOT EXISTS vg_async_workspace_states (
    study_id TEXT NOT NULL,
    is_test INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'setup',
    workflow_stage TEXT NOT NULL DEFAULT 'synthesis_1',
    started_at TEXT,
    closed_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (study_id, is_test)
  );

  CREATE TABLE IF NOT EXISTS vg_async_participants (
    study_id TEXT NOT NULL,
    code TEXT NOT NULL,
    role TEXT NOT NULL,
    condition_name TEXT,
    is_test INTEGER NOT NULL DEFAULT 0,
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
    is_test INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    brief TEXT NOT NULL DEFAULT '',
    creator_prompt TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    flow_stage TEXT NOT NULL DEFAULT 'waiting_round_1',
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
    iteration_number INTEGER,
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

  CREATE TABLE IF NOT EXISTS vg_async_version_likes (
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    version_id INTEGER NOT NULL,
    participant_code TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (study_id, version_id, participant_code)
  );

  CREATE INDEX IF NOT EXISTS vg_async_version_likes_by_app
    ON vg_async_version_likes (study_id, app_id);

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

  CREATE TABLE IF NOT EXISTS vg_async_wildcards (
    study_id TEXT NOT NULL,
    creator_code TEXT NOT NULL,
    app_id TEXT NOT NULL,
    iteration_number INTEGER NOT NULL,
    source_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (study_id, creator_code)
  );

  CREATE TABLE IF NOT EXISTS vg_async_contributors (
    study_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    iteration_number INTEGER NOT NULL,
    participant_code TEXT NOT NULL,
    first_selected_iteration INTEGER NOT NULL,
    selected_in_current_iteration INTEGER NOT NULL DEFAULT 0,
    recorded_at TEXT NOT NULL,
    PRIMARY KEY (study_id, app_id, iteration_number, participant_code)
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

  CREATE TABLE IF NOT EXISTS vg_async_reset_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id TEXT NOT NULL,
    host_code TEXT NOT NULL,
    counts_json TEXT NOT NULL DEFAULT '{}',
    snapshot_json TEXT NOT NULL,
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
  CREATE INDEX IF NOT EXISTS idx_vg_async_wildcards_app
    ON vg_async_wildcards (study_id, app_id, iteration_number);
  CREATE INDEX IF NOT EXISTS idx_vg_async_contributors_app
    ON vg_async_contributors (study_id, app_id, iteration_number);
  CREATE INDEX IF NOT EXISTS idx_vg_async_reset_snapshots_study
    ON vg_async_reset_snapshots (study_id, created_at);
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
ensureColumn('vg_async_development_messages', 'iteration_number', 'INTEGER');
ensureColumn('vg_async_generation_jobs', 'iteration_number', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('vg_async_generation_jobs', 'base_version_id', 'INTEGER');
ensureColumn('vg_async_generation_jobs', 'selection_reason', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('vg_async_generation_jobs', 'selected_source_type', `TEXT NOT NULL DEFAULT 'synthesis'`);
ensureColumn('vg_async_generation_jobs', 'selected_source_id', 'INTEGER');
ensureColumn('vg_async_generation_jobs', 'execution_provider', `TEXT NOT NULL DEFAULT 'deepseek-pro'`);
ensureColumn('vg_async_generation_jobs', 'codex_task_id', 'TEXT');
ensureColumn('vg_async_generation_jobs', 'codex_claimed_at', 'TEXT');
ensureColumn('vg_async_studies', 'workflow_stage', `TEXT NOT NULL DEFAULT 'synthesis_1'`);
ensureColumn('vg_async_syntheses', 'layer', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('vg_async_syntheses', 'withdrawn_at', 'TEXT');
ensureColumn('vg_async_syntheses', 'withdrawn_for_vote', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('vg_async_syntheses', 'deleted_at', 'TEXT');
ensureColumn('vg_async_syntheses', 'is_development_brief', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('vg_async_apps', 'selected_source_type', 'TEXT');
ensureColumn('vg_async_apps', 'selected_source_id', 'INTEGER');
ensureColumn('vg_async_stage_selections', 'source_type', `TEXT NOT NULL DEFAULT 'synthesis'`);
ensureColumn('vg_async_stage_selections', 'source_id', 'INTEGER');
ensureColumn('vg_async_stage_selections', 'source_title', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('vg_async_stage_selections', 'source_content', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('vg_async_stage_selections', 'source_author_code', `TEXT NOT NULL DEFAULT ''`);
ensureColumn('vg_async_notifications', 'source_type', `TEXT NOT NULL DEFAULT 'synthesis'`);
ensureColumn('vg_async_notifications', 'source_id', 'INTEGER');
ensureColumn('vg_async_participants', 'is_test', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('vg_async_apps', 'is_test', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('vg_async_apps', 'flow_stage', `TEXT NOT NULL DEFAULT 'waiting_round_1'`);

// Preserve likes created before version-specific likes existed. Each legacy
// App like is assigned to the newest version that had already been published
// when the like was created (falling back to V0 for malformed old timestamps).
db.exec(`
  INSERT OR IGNORE INTO vg_async_version_likes
    (study_id, app_id, version_id, participant_code, created_at)
  SELECT legacy.study_id, legacy.app_id,
    COALESCE(
      (
        SELECT version.id
        FROM vg_async_versions version
        WHERE version.study_id = legacy.study_id
          AND version.app_id = legacy.app_id
          AND version.created_at <= legacy.created_at
        ORDER BY version.created_at DESC, version.version_number DESC
        LIMIT 1
      ),
      (
        SELECT version.id
        FROM vg_async_versions version
        WHERE version.study_id = legacy.study_id
          AND version.app_id = legacy.app_id
        ORDER BY version.version_number
        LIMIT 1
      )
    ),
    legacy.participant_code, legacy.created_at
  FROM vg_async_app_likes legacy
  WHERE EXISTS (
    SELECT 1 FROM vg_async_versions version
    WHERE version.study_id = legacy.study_id AND version.app_id = legacy.app_id
  );
`);

const individualAppFlowMigrated = db.prepare(`
  SELECT value FROM vg_async_settings WHERE key = ?
`).get(INDIVIDUAL_APP_FLOW_MIGRATION_KEY) as { value?: string } | undefined;
if (individualAppFlowMigrated?.value !== '1') {
  const timestamp = now();
  const migrateIndividualAppFlows = db.transaction(() => {
    db.prepare(`
      UPDATE vg_async_apps AS app
      SET flow_stage = CASE
        WHEN (SELECT COUNT(*) FROM vg_async_versions version
          WHERE version.study_id = app.study_id AND version.app_id = app.id
            AND version.kind = 'community') >= 2 THEN 'completed'
        WHEN EXISTS(SELECT 1 FROM vg_async_generation_jobs job
          WHERE job.study_id = app.study_id AND job.app_id = app.id
            AND job.iteration_number = 2) THEN 'development_2'
        WHEN EXISTS(SELECT 1 FROM vg_async_versions version
          WHERE version.study_id = app.study_id AND version.app_id = app.id
            AND version.kind = 'community') THEN 'round_2'
        WHEN EXISTS(SELECT 1 FROM vg_async_generation_jobs job
          WHERE job.study_id = app.study_id AND job.app_id = app.id
            AND job.iteration_number = 1) THEN 'development_1'
        WHEN COALESCE((SELECT workspace.status FROM vg_async_workspace_states workspace
          WHERE workspace.study_id = app.study_id AND workspace.is_test = app.is_test), 'setup') = 'active'
          THEN 'round_1'
        ELSE 'waiting_round_1'
      END
    `).run();
    db.prepare(`
      INSERT INTO vg_async_settings (key, value, updated_at)
      VALUES (?, '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(INDIVIDUAL_APP_FLOW_MIGRATION_KEY, timestamp);
  });
  migrateIndividualAppFlows();
}

const automaticAppRoundsMigrated = db.prepare(`
  SELECT value FROM vg_async_settings WHERE key = ?
`).get(AUTOMATIC_APP_ROUNDS_MIGRATION_KEY) as { value?: string } | undefined;
if (automaticAppRoundsMigrated?.value !== '1') {
  const timestamp = now();
  const migrateAutomaticAppRounds = db.transaction(() => {
    db.prepare(`
      UPDATE vg_async_apps AS app
      SET flow_stage = CASE
        WHEN app.status <> 'published' OR app.initial_version_id IS NULL THEN 'waiting_round_1'
        WHEN (SELECT COUNT(*) FROM vg_async_versions version
          WHERE version.study_id = app.study_id AND version.app_id = app.id
            AND version.kind = 'community') >= 2 THEN 'completed'
        WHEN EXISTS(SELECT 1 FROM vg_async_generation_jobs job
          WHERE job.study_id = app.study_id AND job.app_id = app.id
            AND job.iteration_number = 2) THEN 'development_2'
        WHEN EXISTS(SELECT 1 FROM vg_async_versions version
          WHERE version.study_id = app.study_id AND version.app_id = app.id
            AND version.kind = 'community') THEN 'round_2'
        WHEN EXISTS(SELECT 1 FROM vg_async_generation_jobs job
          WHERE job.study_id = app.study_id AND job.app_id = app.id
            AND job.iteration_number = 1) THEN 'development_1'
        ELSE 'round_1'
      END
    `).run();
    db.prepare(`
      INSERT INTO vg_async_settings (key, value, updated_at)
      VALUES (?, '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(AUTOMATIC_APP_ROUNDS_MIGRATION_KEY, timestamp);
  });
  migrateAutomaticAppRounds();
}

const numericLoginMigrated = db.prepare(`
  SELECT value FROM vg_async_settings WHERE key = ?
`).get(NUMERIC_LOGIN_MIGRATION_KEY) as { value?: string } | undefined;
if (numericLoginMigrated?.value !== '1') {
  const timestamp = now();
  const migrateSessions = db.transaction(() => {
    db.prepare(`DELETE FROM vg_async_sessions`).run();
    db.prepare(`
      INSERT INTO vg_async_settings (key, value, updated_at)
      VALUES (?, '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(NUMERIC_LOGIN_MIGRATION_KEY, timestamp);
  });
  migrateSessions();
}
// Older studies used Community Member as a separate role.  Keep their existing
// codes and contributions, but give every non-Host participant Creator access.
db.exec(`
  UPDATE vg_async_participants
  SET role = 'creator'
  WHERE role = 'community'
`);
// A legacy study already has 12 C-codes and 24 P-codes.  If it was opened
// once by the unified Creator build, C13-C36 may have been added before the
// legacy population was detected.  Those codes had no possible prior login;
// remove this temporary duplicate set while retaining every legacy record.
db.exec(`
  DELETE FROM vg_async_sessions
  WHERE participant_code GLOB 'C[0-9][0-9]'
    AND CAST(SUBSTR(participant_code, 2) AS INTEGER) BETWEEN 13 AND 36
    AND EXISTS (
      SELECT 1 FROM vg_async_participants legacy
      WHERE legacy.study_id = vg_async_sessions.study_id
        AND legacy.code GLOB 'P[0-9][0-9]'
    );
  DELETE FROM vg_async_participants
  WHERE code GLOB 'C[0-9][0-9]'
    AND CAST(SUBSTR(code, 2) AS INTEGER) BETWEEN 13 AND 36
    AND EXISTS (
      SELECT 1 FROM vg_async_participants legacy
      WHERE legacy.study_id = vg_async_participants.study_id
        AND legacy.code GLOB 'P[0-9][0-9]'
  );
`);

// Normalize empty legacy studies from the former C01–C12 + P01–P24 roster.
// No App data exists in these studies, so their participants can safely move to
// the current, Creator-only roster without losing project provenance.
const emptyLegacyStudies = db.prepare(`
  SELECT s.id
  FROM vg_async_studies s
  WHERE NOT EXISTS (
    SELECT 1 FROM vg_async_apps a WHERE a.study_id = s.id
  )
    AND EXISTS (
      SELECT 1 FROM vg_async_participants p
      WHERE p.study_id = s.id AND p.code GLOB 'P[0-9][0-9]'
    )
`).all() as Array<{ id: string }>;
emptyLegacyStudies.forEach(({ id: studyId }) => {
  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      DELETE FROM vg_async_sessions
      WHERE study_id = ? AND participant_code GLOB 'P[0-9][0-9]'
    `).run(studyId);
    db.prepare(`
      DELETE FROM vg_async_participants
      WHERE study_id = ? AND code GLOB 'P[0-9][0-9]'
    `).run(studyId);
    const insert = db.prepare(`
      INSERT OR IGNORE INTO vg_async_participants
        (study_id, code, role, condition_name, created_at)
      VALUES (?, ?, 'creator', 'experimental', ?)
    `);
    CREATOR_CODES.forEach((code) => insert.run(studyId, code, timestamp));
  });
  transaction();
});

// The active study can contain work created with the legacy C01–C12 + P01–P24
// roster. Keep the eighteen legacy Creator codes that have live work (and fill
// remaining seats by code order), then move them to C13–C30. This keeps current
// App, comment, synthesis, and session provenance while retiring six unused
// legacy slots.
const activeStudySetting = db.prepare(`
  SELECT value FROM vg_async_settings WHERE key = ?
`).get(ACTIVE_STUDY_KEY) as { value?: string } | undefined;
const activeLegacyStudyId = activeStudySetting?.value || '';
if (activeLegacyStudyId) {
  const legacyCodes = (db.prepare(`
    SELECT code FROM vg_async_participants
    WHERE study_id = ? AND code GLOB 'P[0-9][0-9]'
    ORDER BY CAST(SUBSTR(code, 2) AS INTEGER)
  `).all(activeLegacyStudyId) as Array<{ code: string }>).map(({ code }) => code);
  if (legacyCodes.length) {
    const referenceQueries = [
      `SELECT participant_code AS code FROM vg_async_sessions WHERE study_id = ? AND participant_code GLOB 'P[0-9][0-9]'`,
      `SELECT creator_code AS code FROM vg_async_apps WHERE study_id = ? AND creator_code GLOB 'P[0-9][0-9]'`,
      `SELECT author_code AS code FROM vg_async_comments WHERE study_id = ? AND author_code GLOB 'P[0-9][0-9]'`,
      `SELECT author_code AS code FROM vg_async_syntheses WHERE study_id = ? AND author_code GLOB 'P[0-9][0-9]'`,
      `SELECT participant_code AS code FROM vg_async_comment_likes WHERE study_id = ? AND participant_code GLOB 'P[0-9][0-9]'`,
      `SELECT participant_code AS code FROM vg_async_app_likes WHERE study_id = ? AND participant_code GLOB 'P[0-9][0-9]'`,
      `SELECT participant_code AS code FROM vg_async_version_likes WHERE study_id = ? AND participant_code GLOB 'P[0-9][0-9]'`,
      `SELECT participant_code AS code FROM vg_async_synthesis_likes WHERE study_id = ? AND participant_code GLOB 'P[0-9][0-9]'`,
      `SELECT participant_code AS code FROM vg_async_basket_items WHERE study_id = ? AND participant_code GLOB 'P[0-9][0-9]'`,
      `SELECT participant_code AS code FROM vg_async_synthesis_votes WHERE study_id = ? AND participant_code GLOB 'P[0-9][0-9]'`,
      `SELECT participant_code AS code FROM vg_async_assignments WHERE study_id = ? AND participant_code GLOB 'P[0-9][0-9]'`,
      `SELECT creator_code AS code FROM vg_async_creator_revisions WHERE study_id = ? AND creator_code GLOB 'P[0-9][0-9]'`,
      `SELECT creator_code AS code FROM vg_async_creator_operations WHERE study_id = ? AND creator_code GLOB 'P[0-9][0-9]'`,
    ];
    const referencedCodes = new Set(referenceQueries.flatMap((query) => (
      (db.prepare(query).all(activeLegacyStudyId) as Array<{ code: string }>).map(({ code }) => code)
    )));
    const retainedLegacyCodes = [
      ...legacyCodes.filter((code) => referencedCodes.has(code)),
      ...legacyCodes.filter((code) => !referencedCodes.has(code)),
    ].slice(0, LEGACY_UNIFIED_CREATOR_COUNT - 12).sort((left, right) => (
      Number(left.slice(1)) - Number(right.slice(1))
    ));
    if (retainedLegacyCodes.length === LEGACY_UNIFIED_CREATOR_COUNT - 12) {
      const codeColumns = [
        ['vg_async_sessions', 'participant_code'],
        ['vg_async_apps', 'creator_code'],
        ['vg_async_comments', 'author_code'],
        ['vg_async_syntheses', 'author_code'],
        ['vg_async_comment_likes', 'participant_code'],
        ['vg_async_app_likes', 'participant_code'],
        ['vg_async_version_likes', 'participant_code'],
        ['vg_async_synthesis_likes', 'participant_code'],
        ['vg_async_basket_items', 'participant_code'],
        ['vg_async_synthesis_votes', 'participant_code'],
        ['vg_async_assignments', 'participant_code'],
        ['vg_async_creator_revisions', 'creator_code'],
        ['vg_async_creator_operations', 'creator_code'],
        ['vg_async_events', 'participant_code'],
      ] as const;
      const transaction = db.transaction(() => {
        retainedLegacyCodes.forEach((legacyCode, index) => {
          const creatorCode = CREATOR_CODES[index + 12];
          codeColumns.forEach(([table, column]) => {
            db.prepare(`UPDATE ${table} SET ${column} = ? WHERE study_id = ? AND ${column} = ?`)
              .run(creatorCode, activeLegacyStudyId, legacyCode);
          });
          db.prepare(`UPDATE vg_async_participants SET code = ? WHERE study_id = ? AND code = ?`)
            .run(creatorCode, activeLegacyStudyId, legacyCode);
        });
        const retiredLegacyCodes = legacyCodes.filter((code) => !retainedLegacyCodes.includes(code));
        retiredLegacyCodes.forEach((legacyCode) => {
          db.prepare(`DELETE FROM vg_async_sessions WHERE study_id = ? AND participant_code = ?`)
            .run(activeLegacyStudyId, legacyCode);
          db.prepare(`DELETE FROM vg_async_participants WHERE study_id = ? AND code = ?`)
            .run(activeLegacyStudyId, legacyCode);
        });
      });
      transaction();
    }
  }
}
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

// AI work only lives in the current Node process. If Railway restarts or a new
// deployment replaces that process, any task still marked running can no
// longer finish and must be made retryable instead of spinning forever.
const interruptedAtStartup = now();
const interruptedAtStartupMessage = '服务在开发过程中重启，本轮开发失败，请重试。';
db.prepare(`
  UPDATE vg_async_creator_progress
  SET status = 'failed', title = '开发失败，请重试', detail = ?, updated_at = ?
  WHERE status IN ('pending', 'running')
    AND operation_id IN (
      SELECT id FROM vg_async_creator_operations WHERE status = 'running'
    )
`).run(interruptedAtStartupMessage, interruptedAtStartup);
db.prepare(`
  UPDATE vg_async_creator_operations
  SET status = 'failed', error = ?, completed_at = ?
  WHERE status = 'running'
`).run(interruptedAtStartupMessage, interruptedAtStartup);
db.prepare(`
  UPDATE vg_async_generation_events
  SET status = 'failed', title = '开发失败，请重试', detail = ?, updated_at = ?
  WHERE status IN ('pending', 'running')
    AND job_id IN (
      SELECT id FROM vg_async_generation_jobs WHERE status = 'running'
    )
`).run(interruptedAtStartupMessage, interruptedAtStartup);
db.prepare(`
  UPDATE vg_async_generation_jobs
  SET status = 'failed', error = ?, completed_at = ?
  WHERE status = 'running'
`).run(interruptedAtStartupMessage, interruptedAtStartup);

function seedParticipants(studyId: string) {
  const existingCodes = new Set((db.prepare(`
    SELECT code
    FROM vg_async_participants
    WHERE study_id = ?
  `).all(studyId) as Array<{ code: string }>).map(({ code }) => code));
  const missingCreatorCodes = CREATOR_CODES.filter((code) => !existingCodes.has(code));
  if (existingCodes.has('H01') && missingCreatorCodes.length === 0) return;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO vg_async_participants
      (study_id, code, role, condition_name, is_test, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `);
  const timestamp = now();
  const transaction = db.transaction(() => {
    if (!existingCodes.has('H01')) insert.run(studyId, 'H01', 'host', null, timestamp);
    missingCreatorCodes.forEach((code) => (
      insert.run(studyId, code, 'creator', 'experimental', timestamp)
    ));
  });
  transaction();
}

function testRoleAssignmentKey(studyId: string) {
  return `host_test_role_assignment_v1:${studyId}`;
}

function homeFeedOrderKey(studyId: string) {
  return `home_feed_order_v1:${studyId}`;
}

function participantHomeFeedOrderKey(studyId: string, participantCode: string) {
  return `home_feed_order_participant_v1:${studyId}:${participantCode}`;
}

function participantHomeFeedOrderPrefix(studyId: string) {
  return `home_feed_order_participant_v1:${studyId}:`;
}

type HomeFeedOrder = 'number_asc' | 'number_desc' | 'time_asc' | 'time_desc' | 'random';

function normalizeHomeFeedOrder(value?: string): HomeFeedOrder {
  if (value === 'desc') return 'number_desc';
  if (value === 'asc') return 'number_asc';
  if (
    value === 'number_asc'
    || value === 'number_desc'
    || value === 'time_asc'
    || value === 'time_desc'
    || value === 'random'
  ) return value;
  return 'number_asc';
}

function homeFeedShuffleSeedKey(studyId: string) {
  return `home_feed_shuffle_seed_v1:${studyId}`;
}

function homeFeedOrder(studyId: string): HomeFeedOrder {
  const setting = db.prepare(`
    SELECT value FROM vg_async_settings WHERE key = ?
  `).get(homeFeedOrderKey(studyId)) as { value?: string } | undefined;
  return normalizeHomeFeedOrder(setting?.value);
}

function homeFeedOrderForParticipant(
  studyId: string,
  participantCode?: string,
): HomeFeedOrder {
  if (!participantCode) return homeFeedOrder(studyId);
  const setting = db.prepare(`
    SELECT value FROM vg_async_settings WHERE key = ?
  `).get(participantHomeFeedOrderKey(studyId, participantCode)) as { value?: string } | undefined;
  return setting?.value ? normalizeHomeFeedOrder(setting.value) : homeFeedOrder(studyId);
}

function homeFeedShuffleSeed(studyId: string) {
  const setting = db.prepare(`
    SELECT value FROM vg_async_settings WHERE key = ?
  `).get(homeFeedShuffleSeedKey(studyId)) as { value?: string } | undefined;
  return setting?.value || '';
}

function testRolesConfigured(studyId: string) {
  const configured = db.prepare(`
    SELECT value FROM vg_async_settings WHERE key = ?
  `).get(testRoleAssignmentKey(studyId)) as { value?: string } | undefined;
  return configured?.value === '1';
}

export function setCommunityTestCreators(
  clientId: string,
  testCreatorCodes: string[],
) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = study();
  if (
    workspaceState(currentStudy.id, 0).status !== 'setup'
    || workspaceState(currentStudy.id, 1).status !== 'setup'
  ) throw new Error('只能在测试流程和正式流程都开始前修改测试角色。');
  const creators = [...new Set(
    testCreatorCodes.map((value) => String(value).trim().toUpperCase()).filter(Boolean),
  )].sort();
  if (creators.some((code) => !CREATOR_CODES.includes(code))) {
    throw new Error(`测试角色只能选择 C01–C${String(CREATOR_COUNT).padStart(2, '0')}。`);
  }
  const participantRows = db.prepare(`
    SELECT code, role FROM vg_async_participants WHERE study_id = ?
  `).all(currentStudy.id) as Array<{ code: string; role: CommunityRole }>;
  const roleByCode = new Map(participantRows.map((participant) => [
    participant.code,
    participant.role,
  ]));
  if (CREATOR_CODES.some((code) => roleByCode.get(code) !== 'creator')) {
    throw new Error('当前研究的创作者编号不完整，请新建研究后重试。');
  }
  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE vg_async_participants
      SET is_test = 0
      WHERE study_id = ? AND role = 'creator'
    `).run(currentStudy.id);
    const setTest = db.prepare(`
      UPDATE vg_async_participants
      SET is_test = 1
      WHERE study_id = ? AND code = ?
    `);
    creators.forEach((code) => setTest.run(currentStudy.id, code));
    db.prepare(`
      UPDATE vg_async_apps
      SET is_test = COALESCE((
        SELECT p.is_test
        FROM vg_async_participants p
        WHERE p.study_id = vg_async_apps.study_id
          AND p.code = vg_async_apps.creator_code
      ), 0),
      updated_at = ?
      WHERE study_id = ?
    `).run(timestamp, currentStudy.id);
    db.prepare(`
      INSERT INTO vg_async_settings (key, value, updated_at)
      VALUES (?, '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(testRoleAssignmentKey(currentStudy.id), timestamp);
  });
  transaction();
  recordEvent(viewer.code, 'configure_test_creators', 'study', currentStudy.id, {
    testCreatorCount: creators.length,
    testCreatorCodes: creators,
  });
  return getCommunityGalleryState(clientId);
}

export function setCommunityHomeFeedOrder(
  clientId: string,
  order: HomeFeedOrder | 'asc' | 'desc',
) {
  const viewer = requireViewer(clientId);
  const validOrders = new Set([
    'asc', 'desc', 'number_asc', 'number_desc', 'time_asc', 'time_desc', 'random',
  ]);
  if (!validOrders.has(order)) {
    throw new Error('首页排序方式无效。');
  }
  const normalizedOrder = normalizeHomeFeedOrder(order);
  if (viewer.role !== 'host' && normalizedOrder === 'random') {
    throw new Error('创作者只能选择按编号或发布时间排序。');
  }
  const currentStudy = study();
  const timestamp = now();
  const shuffleSeed = normalizedOrder === 'random'
    ? randomUUID()
    : homeFeedShuffleSeed(currentStudy.id);
  const upsert = db.prepare(`
      INSERT INTO vg_async_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
  const transaction = db.transaction(() => {
    if (viewer.role === 'host') {
      upsert.run(homeFeedOrderKey(currentStudy.id), normalizedOrder, timestamp);
      const preferencePrefix = participantHomeFeedOrderPrefix(currentStudy.id);
      db.prepare(`DELETE FROM vg_async_settings WHERE substr(key, 1, ?) = ?`).run(
        preferencePrefix.length,
        preferencePrefix,
      );
      if (normalizedOrder === 'random') {
        upsert.run(homeFeedShuffleSeedKey(currentStudy.id), shuffleSeed, timestamp);
      }
    } else {
      upsert.run(
        participantHomeFeedOrderKey(currentStudy.id, viewer.code),
        normalizedOrder,
        timestamp,
      );
    }
  });
  transaction();
  recordEvent(
    viewer.code,
    'set_home_feed_order',
    viewer.role === 'host' ? 'study' : 'participant',
    viewer.role === 'host' ? currentStudy.id : viewer.code,
    {
      order: normalizedOrder,
      scope: viewer.role === 'host' ? 'all_participants' : 'personal_homepage',
      shuffleSeed: normalizedOrder === 'random' ? shuffleSeed : null,
    },
  );
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
  seedWorkspaceStates(id);
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
  seedWorkspaceStates(studyId);
  return db.prepare(`SELECT * FROM vg_async_studies WHERE id = ?`).get(studyId) as any;
}

function seedWorkspaceStates(studyId: string) {
  const currentStudy = db.prepare(`SELECT * FROM vg_async_studies WHERE id = ?`).get(studyId) as any;
  if (!currentStudy) return;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO vg_async_workspace_states
      (study_id, is_test, status, workflow_stage, started_at, closed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(
    studyId,
    0,
    currentStudy.status || 'setup',
    currentStudy.workflow_stage || 'synthesis_1',
    currentStudy.started_at || null,
    currentStudy.closed_at || null,
    currentStudy.updated_at || now(),
  );
  insert.run(studyId, 1, 'setup', 'synthesis_1', null, null, now());
}

function workspaceState(studyId: string, isTest: number | boolean) {
  seedWorkspaceStates(studyId);
  return db.prepare(`
    SELECT * FROM vg_async_workspace_states WHERE study_id = ? AND is_test = ?
  `).get(studyId, Number(Boolean(isTest))) as any;
}

function updateWorkspaceState(
  studyId: string,
  isTest: number | boolean,
  values: { status?: CommunityStatus; workflowStage?: string; startedAt?: string | null; closedAt?: string | null },
) {
  const current = workspaceState(studyId, isTest);
  db.prepare(`
    UPDATE vg_async_workspace_states
    SET status = ?, workflow_stage = ?, started_at = ?, closed_at = ?, updated_at = ?
    WHERE study_id = ? AND is_test = ?
  `).run(
    values.status ?? current.status,
    values.workflowStage ?? current.workflow_stage,
    values.startedAt === undefined ? current.started_at : values.startedAt,
    values.closedAt === undefined ? current.closed_at : values.closedAt,
    now(),
    studyId,
    Number(Boolean(isTest)),
  );
  if (!isTest) {
    const next = workspaceState(studyId, 0);
    db.prepare(`
      UPDATE vg_async_studies
      SET status = ?, workflow_stage = ?, started_at = ?, closed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.status,
      next.workflow_stage,
      next.started_at || null,
      next.closed_at || null,
      next.updated_at,
      studyId,
    );
  }
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
    SELECT s.client_id AS clientId, p.code, p.role, p.is_test AS isTest
    FROM vg_async_sessions s
    JOIN vg_async_participants p
      ON p.study_id = s.study_id AND p.code = s.participant_code
    WHERE s.study_id = ? AND s.client_id = ?
  `).get(currentStudy.id, clientId) as any || null;
}

function requireViewer(clientId: string, role?: CommunityRole) {
  const viewer = getCommunityViewer(clientId);
  if (!viewer) throw new Error('请先选择实验身份。');
  if (role && viewer.role !== role) {
    throw new Error(`该操作需要${role === 'host' ? '主持人' : '创作者'}身份。`);
  }
  db.prepare(`
    UPDATE vg_async_sessions SET last_seen_at = ? WHERE study_id = ? AND client_id = ?
  `).run(now(), study().id, clientId);
  return viewer;
}

function requireParticipant(clientId: string) {
  const viewer = requireViewer(clientId);
  if (viewer.role === 'host') throw new Error('主持人不参与社区创作。');
  return viewer;
}

function requireOpenStudy(isTest: number | boolean = 0) {
  const currentStudy = study();
  const workspace = workspaceState(currentStudy.id, isTest);
  if (workspace.status === 'closed') throw new Error('该账号空间的研究已经结束，当前内容保持只读。');
  return { ...currentStudy, ...workspace };
}

function requireActiveStudy(clientId: string) {
  const viewer = requireParticipant(clientId);
  const currentStudy = requireOpenStudy(Number(viewer.isTest));
  if (currentStudy.status !== 'active') {
    throw new Error('主持人开始该账号空间的流程后才能发表评论。');
  }
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

export function joinCommunityGallery(clientId: string, account: string, password: string) {
  const cleanClientId = clientId.trim();
  const cleanAccount = account.trim();
  const cleanPassword = password.trim();
  if (!cleanClientId || cleanClientId.length > 160) throw new Error('缺少有效的浏览器会话。');
  const accountNumber = Number(cleanAccount);
  const hasValidAccountFormat = /^(0|[1-9][0-9]*)$/.test(cleanAccount);
  if (
    !hasValidAccountFormat
    || accountNumber < 0
    || accountNumber > CREATOR_COUNT
    || cleanPassword !== cleanAccount
  ) {
    throw new Error('账号或密码错误。');
  }
  const cleanCode = accountNumber === 0 ? 'H01' : `C${String(accountNumber).padStart(2, '0')}`;
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

const APP_FLOW_STAGES = new Set<CommunityAppFlowStage>([
  'waiting_round_1',
  'round_1',
  'development_1',
  'waiting_round_2',
  'round_2',
  'development_2',
  'completed',
]);

function appFlowStage(app: any): CommunityAppFlowStage {
  const value = String(app?.flow_stage || 'waiting_round_1') as CommunityAppFlowStage;
  return APP_FLOW_STAGES.has(value) ? value : 'waiting_round_1';
}

function updateAppFlowStage(appId: string, stage: CommunityAppFlowStage) {
  db.prepare(`
    UPDATE vg_async_apps SET flow_stage = ?, updated_at = ?
    WHERE study_id = ? AND id = ?
  `).run(stage, now(), study().id, appId);
}

function requireAppRoundOpen(app: any) {
  const currentStudy = requireOpenStudy(Number(app.is_test));
  if (currentStudy.status !== 'active') {
    throw new Error('请等待主持人开始该账号空间的流程。');
  }
  const iterationNumber = communityIterationCount(app.id) + 1;
  const expectedStage = iterationNumber === 1 ? 'round_1' : iterationNumber === 2 ? 'round_2' : null;
  if (!expectedStage || appFlowStage(app) !== expectedStage) {
    throw new Error(iterationNumber === 1
      ? '主持人尚未开启该应用的第一轮评论流程。'
      : iterationNumber === 2
        ? '主持人尚未开启该应用的第二轮评论流程。'
        : '该应用已经完成两轮开发。');
  }
  return iterationNumber as 1 | 2;
}

function versionById(versionId: number) {
  return db.prepare(`
    SELECT * FROM vg_async_versions WHERE study_id = ? AND id = ?
  `).get(study().id, versionId) as any;
}

function accessibleApp(clientId: string, appId: string) {
  const viewer = requireViewer(clientId);
  const app = appById(appId);
  if (!app) throw new Error('应用不存在。');
  if (viewer.role !== 'host' && Number(app.is_test) !== Number(viewer.isTest)) {
    throw new Error('应用不存在或当前账号无权查看。');
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
  if (!app || app.creator_code !== viewer.code) throw new Error('只有该应用的创作者可以执行此操作。');
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
  if (!input.title.trim()) throw new Error('请填写应用名称。');
  if (!input.code.trim()) throw new Error('初始版本代码不能为空。');
  const currentStudy = requireOpenStudy(Number(viewer.isTest));
  const existing = db.prepare(`
    SELECT * FROM vg_async_apps WHERE study_id = ? AND creator_code = ?
  `).get(currentStudy.id, viewer.code) as any;
  if (existing?.initial_version_id) throw new Error('初始版本已经发布，不能覆盖。');
  const appId = existing?.id || randomUUID();
  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO vg_async_apps
        (id, study_id, creator_code, condition_name, is_test, title, brief, creator_prompt, status, created_at, updated_at)
      VALUES (?, ?, ?, 'experimental', ?, ?, ?, ?, 'draft', ?, ?)
      ON CONFLICT(study_id, creator_code) DO UPDATE SET
        is_test = excluded.is_test,
        title = excluded.title,
        brief = excluded.brief,
        creator_prompt = excluded.creator_prompt,
        updated_at = excluded.updated_at
    `).run(
      appId,
      currentStudy.id,
      viewer.code,
      Number(viewer.isTest),
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
  phase: 'initial' | 'community' | 'project' = 'initial',
) {
  const viewer = requireViewer(clientId, 'creator');
  const currentStudy = requireOpenStudy(Number(viewer.isTest));
  if (phase === 'project') {
    throw new Error('创作者不能自行启动已发布项目的开发。请等待主持人启动下一轮开发。');
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
    developmentTrigger: phase === 'community'
      ? 'host_locked_draw_followup'
      : 'creator_initial_creation',
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
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.includes('请重试')
    ? rawMessage
    : `AI 开发过程中出现异常，本轮开发失败，请重试。错误信息：${rawMessage}`;
  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE vg_async_creator_operations
      SET status = 'failed', error = ?, completed_at = ?
      WHERE id = ?
    `).run(message, timestamp, operationId);
    db.prepare(`
      UPDATE vg_async_creator_progress
      SET status = 'failed', title = '开发失败，请重试', detail = ?, updated_at = ?
      WHERE operation_id = ? AND status IN ('pending', 'running')
    `).run(message, timestamp, operationId);
  });
  transaction();
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
    WHERE id = ? AND study_id = ? AND creator_code = ?
  `).get(operationId, currentStudy.id, viewer.code) as any;
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
  const currentStudy = requireOpenStudy(Number(viewer.isTest));
  const app = db.prepare(`
    SELECT * FROM vg_async_apps WHERE study_id = ? AND creator_code = ?
  `).get(currentStudy.id, viewer.code) as any;
  if (!app) throw new Error('请先创建或上传初始版本。');
  if (app.initial_version_id) return getCommunityGalleryState(clientId);
  const draft = db.prepare(`
    SELECT * FROM vg_async_drafts WHERE study_id = ? AND app_id = ? AND kind = 'initial'
  `).get(currentStudy.id, app.id) as any;
  if (!draft?.code) throw new Error('初始版本草稿为空。');
  const timestamp = now();
  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO vg_async_versions
        (study_id, app_id, version_number, kind, title, code, summary, prompt, created_at)
      VALUES (?, ?, 1, 'initial', ?, ?, ?, ?, ?)
    `).run(currentStudy.id, app.id, app.title, draft.code, draft.summary, draft.prompt, timestamp);
    db.prepare(`
      UPDATE vg_async_apps
      SET initial_version_id = ?, status = 'published', flow_stage = 'round_1',
        published_at = ?, updated_at = ?
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
  if (!app) throw new Error('请先创建应用。');
  const persistedDraft = db.prepare(`
    SELECT * FROM vg_async_drafts WHERE study_id = ? AND app_id = ?
  `).get(study().id, app.id) as any;
  if (!persistedDraft?.code) {
    throw new Error('当前没有可修改的开发草稿。请等待主持人锁定点赞并启动本轮开发。');
  }
  if (persistedDraft.kind === 'project') {
    throw new Error('创作者不能自行继续开发已发布项目。请等待主持人启动下一轮开发。');
  }
  const draft = persistedDraft;
  const messagePhase = draft.kind === 'initial'
    ? 'initial'
    : draft.kind === 'project'
      ? 'project'
      : 'community';
  const messageIterationNumber = messagePhase === 'community'
    ? Number(draft.iteration_number || 0)
    : 0;
  const messages = db.prepare(`
    SELECT * FROM vg_async_development_messages
    WHERE study_id = ? AND app_id = ? AND phase = ?
      AND (? = 0 OR iteration_number = ? OR iteration_number IS NULL)
    ORDER BY id DESC LIMIT 8
  `).all(
    study().id,
    app.id,
    messagePhase,
    messageIterationNumber,
    messageIterationNumber,
  ) as any[];
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
  const messageIterationNumber = context.messagePhase === 'community'
    ? Number(context.draft.iteration_number || 0) || null
    : null;
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
        (study_id, app_id, phase, iteration_number, role, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertMessage.run(
      study().id,
      context.app.id,
      context.messagePhase,
      messageIterationNumber,
      'creator',
      creatorMessage,
      timestamp,
    );
    insertMessage.run(
      study().id,
      context.app.id,
      context.messagePhase,
      messageIterationNumber,
      'assistant',
      assistantMessage,
      timestamp,
    );
  });
  transaction();
  recordEvent(context.viewer.code, 'refine_draft', 'app', context.app.id, {
    kind: context.draft.kind,
    developmentTrigger: context.draft.kind === 'community'
      ? 'host_locked_draw_followup'
      : 'creator_initial_creation',
    iterationNumber: context.draft.kind === 'community'
      ? Number(context.draft.iteration_number || 0)
      : 0,
    baseVersionId: context.draft.base_version_id || null,
    selectedSourceType: context.draft.selected_source_type || null,
    selectedSourceId: context.draft.selected_source_id || context.draft.synthesis_id || null,
  });
  return getCommunityGalleryState(clientId);
}

export function publishProjectDraft(clientId: string) {
  requireViewer(clientId, 'creator');
  throw new Error('创作者不能自行发布普通项目更新。请等待主持人启动下一轮开发。');
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

type ContributorSource = { source_type: CommunitySourceType; source_id: number };

function contributorCodesForSources(studyId: string, sources: ContributorSource[]) {
  const contributors = new Set<string>();
  const visitedSyntheses = new Set<number>();
  const creatorCodes = new Set((db.prepare(`
    SELECT code FROM vg_async_participants WHERE study_id = ? AND role = 'creator'
  `).all(studyId) as Array<{ code: string }>).map((participant) => participant.code));
  const visit = (sourceType: CommunitySourceType, sourceId: number) => {
    if (sourceType === 'comment') {
      const comment = db.prepare(`
        SELECT author_code FROM vg_async_comments WHERE study_id = ? AND id = ?
      `).get(studyId, sourceId) as { author_code?: string } | undefined;
      if (comment?.author_code && creatorCodes.has(comment.author_code)) {
        contributors.add(comment.author_code);
      }
      return;
    }
    if (visitedSyntheses.has(sourceId)) return;
    visitedSyntheses.add(sourceId);
    const synthesis = db.prepare(`
      SELECT author_code, COALESCE(is_development_brief, 0) AS is_development_brief
      FROM vg_async_syntheses WHERE study_id = ? AND id = ?
    `).get(studyId, sourceId) as { author_code?: string; is_development_brief?: number } | undefined;
    if (!synthesis) return;
    if (!synthesis.is_development_brief
      && synthesis.author_code
      && creatorCodes.has(synthesis.author_code)) {
      contributors.add(synthesis.author_code);
    }
    const nestedSources = db.prepare(`
      SELECT source_type, source_id FROM vg_async_synthesis_sources
      WHERE study_id = ? AND synthesis_id = ? ORDER BY source_order
    `).all(studyId, sourceId) as ContributorSource[];
    nestedSources.forEach((source) => visit(source.source_type, Number(source.source_id)));
  };
  sources.forEach((source) => visit(source.source_type, Number(source.source_id)));
  return contributors;
}

function recordContributorSnapshot(
  studyId: string,
  appId: string,
  iterationNumber: number,
  sources: ContributorSource[],
  recordedAt: string,
) {
  const selectedNow = contributorCodesForSources(studyId, sources);
  const previousRows = iterationNumber > 1
    ? db.prepare(`
        SELECT participant_code, first_selected_iteration
        FROM vg_async_contributors
        WHERE study_id = ? AND app_id = ? AND iteration_number = ?
      `).all(studyId, appId, iterationNumber - 1) as Array<{
        participant_code: string;
        first_selected_iteration: number;
      }>
    : [];
  const cumulative = new Map(previousRows.map((row) => [
    row.participant_code,
    Number(row.first_selected_iteration),
  ]));
  selectedNow.forEach((participantCode) => {
    if (!cumulative.has(participantCode)) cumulative.set(participantCode, iterationNumber);
  });
  db.prepare(`
    DELETE FROM vg_async_contributors
    WHERE study_id = ? AND app_id = ? AND iteration_number = ?
  `).run(studyId, appId, iterationNumber);
  const insert = db.prepare(`
    INSERT INTO vg_async_contributors
      (study_id, app_id, iteration_number, participant_code,
       first_selected_iteration, selected_in_current_iteration, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  cumulative.forEach((firstSelectedIteration, participantCode) => {
    insert.run(
      studyId,
      appId,
      iterationNumber,
      participantCode,
      firstSelectedIteration,
      selectedNow.has(participantCode) ? 1 : 0,
      recordedAt,
    );
  });
}

function backfillContributorSnapshots() {
  const selections = db.prepare(`
    SELECT study_id, app_id, iteration_number, source_type, source_id,
      source_popularity_json, selected_at
    FROM vg_async_stage_selections
    ORDER BY study_id, app_id, iteration_number, selected_at
  `).all() as any[];
  selections.forEach((selection) => {
    let sources: ContributorSource[] = [];
    try {
      const audit = JSON.parse(selection.source_popularity_json || '{}');
      if (Array.isArray(audit.developed_sources)) {
        sources = audit.developed_sources.map((source: any) => ({
          source_type: source.source_type,
          source_id: Number(source.source_id),
        })).filter((source: ContributorSource) => (
          (source.source_type === 'comment' || source.source_type === 'synthesis')
          && Number.isInteger(source.source_id)
        ));
      }
    } catch {
      sources = [];
    }
    if (!sources.length && selection.source_id) {
      sources = [{
        source_type: selection.source_type as CommunitySourceType,
        source_id: Number(selection.source_id),
      }];
    }
    recordContributorSnapshot(
      selection.study_id,
      selection.app_id,
      Number(selection.iteration_number),
      sources,
      selection.selected_at || now(),
    );
  });
}

backfillContributorSnapshots();

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
      `你的创意进入社区版本 ${iterationNumber} 开发`,
      `你的想法已在《${app.title}》中被纳入开发：“${selectedSource.title || selectedSource.content}”。你的 ${sources.size} 条创意贡献已经进入实际开发流程。`,
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

export function replayCelebratedContributionNotifications(clientId: string) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = study();
  const replayableCount = Number((db.prepare(`
    SELECT COUNT(*) AS count
    FROM vg_async_notifications
    WHERE study_id = ? AND type = 'contribution_selected' AND celebrated_at IS NOT NULL
  `).get(currentStudy.id) as { count?: number } | undefined)?.count || 0);
  if (replayableCount > 0) {
    db.prepare(`
      UPDATE vg_async_notifications
      SET celebrated_at = NULL
      WHERE study_id = ? AND type = 'contribution_selected' AND celebrated_at IS NOT NULL
    `).run(currentStudy.id);
  }
  recordEvent(viewer.code, 'replay_contribution_notifications', 'study', currentStudy.id, {
    notificationCount: replayableCount,
  });
  return getCommunityGalleryState(clientId);
}

function scoredSynthesisCandidates(appId: string, layer: 1 | 2) {
  const candidates = db.prepare(`
    SELECT * FROM vg_async_syntheses
    WHERE study_id = ? AND target_app_id = ? AND layer = ?
      AND withdrawn_at IS NULL AND deleted_at IS NULL
      AND COALESCE(is_development_brief, 0) = 0
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

function scoredAppCommentCandidates(appId: string, eligibleVersionIds: number[]) {
  const versionIds = [...new Set(eligibleVersionIds.map(Number).filter(Boolean))];
  if (!versionIds.length) return [];
  const placeholders = versionIds.map(() => '?').join(',');
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
      AND c.version_id IN (${placeholders})
    GROUP BY c.id
  `).all(study().id, appId, ...versionIds) as any[];
  return commentCandidates.map((candidate) => ({
    ...candidate,
    title: `普通评论 · ${candidate.author_code}`,
    source_popularity_json: JSON.stringify({
      like_count: Number(candidate.score || 0),
      source_count: 0,
    }),
  }));
}

function wildcardEligibleVersionIds(appId: string, iterationNumber: 1 | 2) {
  const app = appById(appId);
  if (!app) return [];
  const versionIds = [Number(app.initial_version_id || 0)];
  if (iterationNumber === 2) {
    versionIds.push(Number(
      versionsForApp(appId).find(
        (version) => version.kind === 'community' && Number(version.version_number) === 2,
      )?.id || 0,
    ));
  }
  return versionIds.filter(Boolean);
}

function scoredWildcardCommentCandidate(
  appId: string,
  iterationNumber: 1 | 2,
  commentId: number,
) {
  return scoredAppCommentCandidates(
    appId,
    wildcardEligibleVersionIds(appId, iterationNumber),
  ).find((candidate) => Number(candidate.source_id) === Number(commentId));
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
  const commentCandidates = scoredAppCommentCandidates(appId, [eligibleVersionId]);
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
      AND s.layer = ? AND s.target_version_id = ?
      AND COALESCE(s.is_development_brief, 0) = 0
      AND s.withdrawn_at IS NULL AND s.deleted_at IS NULL
    GROUP BY s.id
  `).all(study().id, appId, iterationNumber, eligibleVersionId) as any[];
  return [
    ...commentCandidates,
    ...synthesisCandidates.map((candidate) => ({
      ...candidate,
      source_popularity_json: JSON.stringify({
        like_count: Number(candidate.score || 0),
        source_count: Number(candidate.source_count || 0),
      }),
    })),
  ];
}

function drawWeightedDevelopmentCandidate(candidates: any[]) {
  const weightedCandidates = candidates.map((candidate) => ({
    candidate,
    likeCount: Math.max(0, Math.trunc(Number(candidate.score || 0))),
  })).map((entry) => ({
    ...entry,
    // A +1 smoothing weight keeps new ideas eligible while still making every
    // additional like increase their chance of being selected.
    weight: entry.likeCount + 1,
  }));
  const totalWeight = weightedCandidates.reduce((sum, entry) => sum + entry.weight, 0);
  const draw = randomInt(totalWeight);
  let cursor = draw;
  const selected = weightedCandidates.find((entry) => {
    cursor -= entry.weight;
    return cursor < 0;
  }) || weightedCandidates[weightedCandidates.length - 1];
  return {
    candidate: selected.candidate,
    audit: {
      method: 'weighted_random_like_count_plus_one',
      total_weight: totalWeight,
      draw,
      candidates: weightedCandidates.map((entry) => ({
        source_type: entry.candidate.source_type,
        source_id: Number(entry.candidate.source_id),
        like_count: entry.likeCount,
        weight: entry.weight,
      })),
      selected_source_type: selected.candidate.source_type,
      selected_source_id: Number(selected.candidate.source_id),
    },
  };
}

export function useCommunityWildcard(clientId: string, appId: string, commentId: number) {
  const { viewer, app } = ownedApp(clientId, appId);
  const currentStudy = requireOpenStudy(Number(app.is_test));
  if (app.status !== 'published') {
    throw new Error('万能卡只能用于已发布的应用。');
  }
  const iterationNumber = requireAppRoundOpen(app);
  const eligibleComment = scoredWildcardCommentCandidate(app.id, iterationNumber, commentId);
  if (!eligibleComment) {
    throw new Error('万能卡只能选择本应用第一轮或第二轮的一条普通评论。');
  }
  const existing = db.prepare(`
    SELECT 1 FROM vg_async_wildcards WHERE study_id = ? AND creator_code = ?
  `).get(currentStudy.id, viewer.code);
  if (existing) throw new Error('每位创作者在本研究中只能使用一次万能卡。');
  const timestamp = now();
  db.prepare(`
    INSERT INTO vg_async_wildcards
      (study_id, creator_code, app_id, iteration_number, source_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(currentStudy.id, viewer.code, app.id, iterationNumber, commentId, timestamp);
  recordEvent(viewer.code, 'use_community_wildcard', 'comment', commentId, {
    appId: app.id,
    iterationNumber,
  });
  return getCommunityGalleryState(clientId);
}

export function enterCommunityDevelopmentStage(
  clientId: string,
  iterationNumber: 1 | 2,
  isTest: boolean,
  requestedAppIds?: string[],
  executionProvider: CommunityDevelopmentProvider = 'deepseek-pro',
) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = requireOpenStudy(isTest);
  if (currentStudy.status !== 'active') throw new Error('请先记录正式研究开始。');
  const allPublishedApps = db.prepare(`
    SELECT * FROM vg_async_apps
    WHERE study_id = ? AND is_test = ? AND status = 'published'
    ORDER BY published_at, creator_code
  `).all(currentStudy.id, Number(isTest)) as any[];
  const selectedIds = [...new Set((requestedAppIds || []).map(String).filter(Boolean))];
  const publishedApps = selectedIds.length
    ? allPublishedApps.filter((app) => selectedIds.includes(app.id))
    : allPublishedApps;
  if (selectedIds.length && publishedApps.length !== selectedIds.length) {
    throw new Error('部分所选应用不存在、尚未发布，或不属于当前账号空间。');
  }
  if (!publishedApps.length) throw new Error('当前没有已发布的应用。');
  const expectedAppStage: CommunityAppFlowStage = iterationNumber === 1 ? 'round_1' : 'round_2';
  const invalidStageApps = publishedApps.filter((app) => appFlowStage(app) !== expectedAppStage);
  if (invalidStageApps.length) {
    throw new Error(`所选应用中有 ${invalidStageApps.length} 个尚未进入第 ${iterationNumber} 轮评论流程。`);
  }
  const runningApps = publishedApps.filter((app) => db.prepare(`
    SELECT 1 FROM vg_async_generation_jobs
    WHERE study_id = ? AND app_id = ?
      AND status IN ('running', 'waiting_codex', 'codex_processing')
  `).get(currentStudy.id, app.id));
  if (runningApps.length) throw new Error(`所选应用中有 ${runningApps.length} 个仍在开发中。`);

  const candidatesByApp = publishedApps.map((app) => {
    const candidates = scoredDevelopmentCandidates(app.id, iterationNumber);
    const wildcard = db.prepare(`
      SELECT * FROM vg_async_wildcards
      WHERE study_id = ? AND app_id = ? AND iteration_number = ?
    `).get(currentStudy.id, app.id, iterationNumber) as any;
    const wildcardSource = wildcard
      ? scoredWildcardCommentCandidate(app.id, iterationNumber, Number(wildcard.source_id))
      : undefined;
    if (wildcard && !wildcardSource) {
      throw new Error(`《${app.title}》的万能卡评论已不符合本轮开发条件。`);
    }
    return { app, candidates, wildcard, wildcardSource };
  });
  if (iterationNumber === 2) {
    const missingFirstVersion = publishedApps.filter((app) => communityIterationCount(app.id) < 1);
    if (missingFirstVersion.length) {
      throw new Error(`仍有 ${missingFirstVersion.length} 个应用未发布社区版本 1。`);
    }
  }
  const missingCandidates = candidatesByApp.filter((entry) => (
    entry.candidates.length === 0 && !entry.wildcardSource
  ));
  if (missingCandidates.length) {
    throw new Error(iterationNumber === 2
      ? `仍有 ${missingCandidates.length} 个应用没有针对社区版本 1 的第二轮普通评论或第二轮综合评论。`
      : `仍有 ${missingCandidates.length} 个应用没有可参与点赞评选的第一轮评论。`);
  }

  const winners = candidatesByApp.map(({ app, candidates, wildcard, wildcardSource }) => {
    const wildcardWasRandomCandidate = Boolean(wildcardSource && candidates.some((candidate) => (
      candidate.source_type === 'comment'
      && Number(candidate.source_id) === Number(wildcardSource.source_id)
    )));
    const randomCandidates = wildcardSource && wildcardWasRandomCandidate
      ? candidates.filter((candidate) => !(
          candidate.source_type === 'comment'
          && Number(candidate.source_id) === Number(wildcardSource.source_id)
        ))
      : candidates;
    const randomSelection = randomCandidates.length
      ? drawWeightedDevelopmentCandidate(randomCandidates)
      : null;
    const primarySource = randomSelection?.candidate || wildcardSource;
    if (!primarySource) throw new Error(`《${app.title}》没有可用于本轮开发的来源。`);
    const sources = [randomSelection?.candidate, wildcardSource]
      .filter(Boolean)
      .filter((candidate, index, list) => list.findIndex((item) => (
        item.source_type === candidate.source_type && Number(item.source_id) === Number(candidate.source_id)
      )) === index);
    const winner = {
      ...primarySource,
      source_popularity_json: JSON.stringify({
        ...(randomSelection?.audit || {
          method: 'weighted_random_like_count_plus_one',
          total_weight: 0,
          draw: null,
          candidates: [],
          selected_source_type: null,
          selected_source_id: null,
        }),
        wildcard_excluded_from_random_pool: wildcardWasRandomCandidate,
        random_pool_exhausted: Boolean(wildcardWasRandomCandidate && !randomSelection),
        wildcard: wildcard ? {
          creator_code: wildcard.creator_code,
          source_type: 'comment',
          source_id: Number(wildcard.source_id),
          excluded_from_random_pool: wildcardWasRandomCandidate,
        } : null,
        developed_sources: sources.map((source) => ({
          source_type: source.source_type,
          source_id: Number(source.source_id),
        })),
      }),
    };
    return { app, winner, sources, wildcardSource };
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
    winners.forEach(({ app, winner, sources }) => {
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
      recordContributorSnapshot(
        currentStudy.id,
        app.id,
        iterationNumber,
        sources.map((source) => ({
          source_type: source.source_type as CommunitySourceType,
          source_id: Number(source.source_id),
        })),
        timestamp,
      );
      sources.forEach((source) => {
        notificationCount += createContributionNotifications(
          app,
          source.source_type,
          Number(source.source_id),
          iterationNumber,
          app.creator_code,
        );
      });
    });
    winners.forEach(({ app }) => updateAppFlowStage(
      app.id,
      iterationNumber === 1 ? 'development_1' : 'development_2',
    ));
  });
  transaction();
  const codexTaskId = executionProvider === 'codex' ? randomUUID() : null;
  const jobIds = winners.map(({ app, winner, sources, wildcardSource }) => createCommunityGenerationJob({
    actorCode: viewer.code,
    app,
    sources: sources.map((source) => ({
      type: source.source_type as CommunitySourceType,
      id: Number(source.source_id),
    })),
    creatorInstruction: sources.map((source) => source.content).filter(Boolean).join('\n\n'),
    allowedCrossVersionCommentIds: wildcardSource
      ? [Number(wildcardSource.source_id)]
      : [],
    selectionReason: 'host_weighted_random_draw',
    automated: true,
    executionProvider,
    codexTaskId,
  }));
  recordEvent(viewer.code, `enter_development_${iterationNumber}`, 'study', currentStudy.id, {
    winners: winners.map(({ app, winner, sources }) => ({
      appId: app.id,
      sourceType: winner.source_type,
      sourceId: winner.source_id,
      score: winner.score,
      sourceCount: sources.length,
      rankingRule: 'weighted_random_like_count_plus_one',
      eligibleRound: iterationNumber,
      selectionAudit: JSON.parse(winner.source_popularity_json),
    })),
    notificationCount,
    jobIds,
    executionProvider,
    codexTaskId,
    workspace: isTest ? 'test' : 'regular',
  });
  return { jobIds, codexTaskId, executionProvider, state: getCommunityGalleryState(clientId) };
}

export function controlCommunityAppFlows(
  clientId: string,
  appIds: string[],
  action: 'rollback',
) {
  const viewer = requireViewer(clientId, 'host');
  if (action !== 'rollback') {
    throw new Error('无效的 App 流程操作。');
  }
  const currentStudy = study();
  const selectedIds = [...new Set(appIds.map(String).filter(Boolean))];
  if (!selectedIds.length) throw new Error('请至少选择一个 Creator。');
  const placeholders = selectedIds.map(() => '?').join(',');
  const apps = db.prepare(`
    SELECT * FROM vg_async_apps
    WHERE study_id = ? AND id IN (${placeholders}) AND status = 'published'
    ORDER BY creator_code
  `).all(currentStudy.id, ...selectedIds) as any[];
  if (apps.length !== selectedIds.length) throw new Error('部分所选 Creator 尚未发布 App。');
  apps.forEach((app) => {
    const workspace = workspaceState(currentStudy.id, Number(app.is_test));
    if (workspace.status !== 'active') {
      throw new Error(`${app.creator_code} 所属的${app.is_test ? '测试' : '正式'}流程尚未开始。`);
    }
  });

  const nextStages = apps.map((app) => {
    const currentStage = appFlowStage(app);
    const previousStage: Partial<Record<CommunityAppFlowStage, CommunityAppFlowStage>> = {
      development_1: 'round_1',
      development_2: 'round_2',
    };
    const nextStage = previousStage[currentStage];
    if (!nextStage) throw new Error(`${app.creator_code} 当前阶段不能安全回退。`);
    const running = db.prepare(`
      SELECT 1 FROM vg_async_generation_jobs
      WHERE study_id = ? AND app_id = ?
        AND status IN ('running', 'waiting_codex', 'codex_processing')
    `).get(currentStudy.id, app.id);
    if (running) throw new Error(`${app.creator_code} 正在开发，任务结束前不能回退。`);
    const draft = db.prepare(`
      SELECT 1 FROM vg_async_drafts
      WHERE study_id = ? AND app_id = ? AND kind = 'community'
    `).get(currentStudy.id, app.id);
    if (draft && (currentStage === 'development_1' || currentStage === 'development_2')) {
      throw new Error(`${app.creator_code} 已有本轮开发草稿，请发布或重新开发，不能直接回退。`);
    }
    return { app, currentStage, nextStage };
  });

  const timestamp = now();
  const transaction = db.transaction(() => {
    nextStages.forEach(({ app, nextStage }) => {
      db.prepare(`
        UPDATE vg_async_apps SET flow_stage = ?, updated_at = ?
        WHERE study_id = ? AND id = ?
      `).run(nextStage, timestamp, currentStudy.id, app.id);
    });
  });
  transaction();
  recordEvent(viewer.code, `host_${action}`, 'study', currentStudy.id, {
    apps: nextStages.map(({ app, currentStage, nextStage }) => ({
      appId: app.id,
      creatorCode: app.creator_code,
      fromStage: currentStage,
      toStage: nextStage,
    })),
  });
  return getCommunityGalleryState(clientId);
}

export function returnToPreviousCommunityStage(clientId: string) {
  void clientId;
  throw new Error('主持人的旧开发阶段控制已移除。');
  /* Legacy audit implementation retained below for migrated historical studies. */
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
        WHERE study_id = ?
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
        WHERE study_id = ?
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
  const { app } = accessibleApp(input.clientId, input.appId);
  requireAppRoundOpen(app);
  if (app.creator_code === viewer.code) {
    throw new Error('创作者不能在自己的应用中评论。');
  }
  const content = input.content.trim();
  if (!content) throw new Error('评论内容不能为空。');
  if (content.length > 3000) throw new Error('评论不能超过 3000 字。');
  const targetType = input.targetType || 'app';
  const targetId = input.targetId || app.id;
  if (targetType === 'synthesis') {
    const synthesis = synthesisById(Number(targetId));
    if (!synthesis || synthesis.target_app_id !== app.id) throw new Error('综合评论不存在。');
  } else if (targetId !== app.id) {
    throw new Error('普通评论必须属于当前应用。');
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
  requireActiveStudy(clientId);
  const comment = commentById(commentId);
  if (!comment || comment.author_code !== viewer.code) throw new Error('只能编辑自己的评论。');
  const { app } = accessibleApp(clientId, comment.app_id);
  requireAppRoundOpen(app);
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
  requireActiveStudy(clientId);
  const comment = commentById(commentId);
  if (!comment || comment.author_code !== viewer.code) throw new Error('只能删除自己的评论。');
  const wildcard = db.prepare(`
    SELECT 1 FROM vg_async_wildcards
    WHERE study_id = ? AND source_id = ?
  `).get(study().id, commentId);
  if (wildcard) throw new Error('这条评论已被万能卡选中，请先由应用创作者取消万能卡选择。');
  const { app } = accessibleApp(clientId, comment.app_id);
  requireAppRoundOpen(app);
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
  requireActiveStudy(clientId);
  const comment = commentById(commentId);
  if (!comment) throw new Error('评论不存在。');
  const { app } = accessibleApp(clientId, comment.app_id);
  requireAppRoundOpen(app);
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

export function toggleCommunityAppLike(clientId: string, appId: string, versionId: number) {
  const viewer = requireParticipant(clientId);
  const { app } = accessibleApp(clientId, appId);
  requireOpenStudy(Number(app.is_test));
  if (app.status !== 'published') throw new Error('只能点赞已经发布的应用。');
  if (app.creator_code === viewer.code) throw new Error('不能点赞自己的应用。');
  const version = db.prepare(`
    SELECT id, version_number, kind
    FROM vg_async_versions
    WHERE study_id = ? AND app_id = ? AND id = ?
  `).get(study().id, appId, versionId) as {
    id: number;
    version_number: number;
    kind: string;
  } | undefined;
  if (!version) throw new Error('只能点赞当前作品已经发布的版本。');
  const exists = db.prepare(`
    SELECT 1 FROM vg_async_version_likes
    WHERE study_id = ? AND version_id = ? AND participant_code = ?
  `).get(study().id, version.id, viewer.code);
  const transaction = db.transaction(() => {
    // A migrated legacy App like may remain as a compatibility backup. Once
    // this participant interacts again, remove it so it cannot be re-imported.
    db.prepare(`
      DELETE FROM vg_async_app_likes
      WHERE study_id = ? AND app_id = ? AND participant_code = ?
    `).run(study().id, appId, viewer.code);
    if (exists) {
      db.prepare(`
        DELETE FROM vg_async_version_likes
        WHERE study_id = ? AND version_id = ? AND participant_code = ?
      `).run(study().id, version.id, viewer.code);
    } else {
      db.prepare(`
        INSERT INTO vg_async_version_likes
          (study_id, app_id, version_id, participant_code, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(study().id, appId, version.id, viewer.code, now());
    }
  });
  transaction();
  recordEvent(
    viewer.code,
    exists ? 'unlike_app_version' : 'like_app_version',
    'version',
    version.id,
    {
      appId,
      versionNumber: Number(version.version_number),
      versionKind: version.kind,
    },
  );
  return getCommunityGalleryState(clientId);
}

export function toggleCreativeBasket(
  clientId: string,
  sourceType: CommunitySourceType,
  sourceId: number,
) {
  const viewer = requireParticipant(clientId);
  requireOpenStudy(Number(viewer.isTest));
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
  const completedIterations = communityIterationCount(app.id);
  if (completedIterations === 0) return 1;
  if (completedIterations === 1) return 2;
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
  requireOpenStudy(Number(viewer.isTest));
  const { app } = accessibleApp(input.clientId, input.targetAppId);
  requireAppRoundOpen(app);
  if (app.creator_code === viewer.code) {
    throw new Error('不能在自己的应用中创建综合评论。');
  }
  const currentStudy = requireActiveStudy(input.clientId);
  const layer = openSynthesisLayerForApp(app);
  if (!layer) throw new Error('当前阶段没有开放新的综合评论。');
  const existingSynthesis = db.prepare(`
    SELECT 1 FROM vg_async_syntheses
    WHERE study_id = ? AND author_code = ? AND target_app_id = ? AND layer = ?
      AND withdrawn_at IS NULL AND COALESCE(is_development_brief, 0) = 0
  `).get(currentStudy.id, viewer.code, app.id, layer);
  if (existingSynthesis) throw new Error('每个人在每个应用的本轮只能创建一条综合评论。');
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
  requireOpenStudy(Number(viewer.isTest));
  const synthesis = synthesisById(synthesisId);
  if (!synthesis || synthesis.author_code !== viewer.code) {
    throw new Error('只能编辑自己的综合评论。');
  }
  if (synthesis.is_development_brief) {
    throw new Error('已进入开发流程的开发方向不能编辑。');
  }
  const { app } = accessibleApp(clientId, synthesis.target_app_id);
  requireAppRoundOpen(app);
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
  requireOpenStudy(Number(viewer.isTest));
  const synthesis = synthesisById(synthesisId);
  if (!synthesis || synthesis.author_code !== viewer.code) {
    throw new Error('只能删除自己的综合评论。');
  }
  if (synthesis.is_development_brief) {
    throw new Error('已进入开发流程的开发方向不能删除。');
  }
  const { app } = accessibleApp(clientId, synthesis.target_app_id);
  requireAppRoundOpen(app);
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
  const viewer = requireParticipant(clientId);
  requireOpenStudy(Number(viewer.isTest));
  void synthesisId;
  throw new Error('综合评论提交后不能撤回；每个人可以直接给喜欢的综合评论点赞。');
}

export function voteForSynthesis(clientId: string, synthesisId: number) {
  const viewer = requireParticipant(clientId);
  const currentStudy = requireOpenStudy(Number(viewer.isTest));
  const synthesis = synthesisById(synthesisId);
  if (!synthesis) throw new Error('要点赞的综合评论不存在。');
  if (synthesis.is_development_brief) {
    throw new Error('开发方向不参与点赞。');
  }
  const { app } = accessibleApp(clientId, synthesis.target_app_id);
  requireAppRoundOpen(app);
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

type DevelopmentSourceInput = { type: CommunitySourceType; id: number };

function createCreatorDevelopmentBrief(input: {
  actorCode: string;
  app: any;
  iterationNumber: 1 | 2;
  baseVersionId: number;
  sources: DevelopmentSourceInput[];
  content: string;
  allowedCrossVersionCommentIds?: number[];
}) {
  const content = input.content.trim();
  if (!content) throw new Error('请先填写开发提示词。');
  const uniqueSources = input.sources.filter(
    (source, index, list) => (
      (source.type === 'comment' || source.type === 'synthesis')
      && Number.isInteger(Number(source.id))
      && Number(source.id) > 0
      && list.findIndex((candidate) => (
        candidate.type === source.type && Number(candidate.id) === Number(source.id)
      )) === index
    ),
  );
  if (!uniqueSources.length) throw new Error('请至少选择一条评论或综合评论。');
  const resolved = uniqueSources.map((source) => ({
    ...source,
    record: sourceRecord(source.type, Number(source.id)),
  }));
  if (resolved.some((source) => !source.record)) {
    throw new Error('所选评论已不存在，请重新选择。');
  }
  const allowedCrossVersionCommentIds = new Set(
    (input.allowedCrossVersionCommentIds || []).map(Number).filter(Boolean),
  );
  const eligibleWildcardVersionIds = new Set(
    wildcardEligibleVersionIds(input.app.id, input.iterationNumber),
  );
  const invalidSource = resolved.find((source) => {
    const record = source.record!;
    if (record.app_id !== input.app.id) return true;
    if (Number(record.version_id || 0) !== input.baseVersionId) {
      const isAllowedWildcardComment = source.type === 'comment'
        && allowedCrossVersionCommentIds.has(Number(source.id))
        && eligibleWildcardVersionIds.has(Number(record.version_id || 0));
      if (!isAllowedWildcardComment) return true;
    }
    if (source.type === 'synthesis') {
      const synthesis = synthesisById(Number(source.id));
      return !synthesis
        || Boolean(synthesis.is_development_brief)
        || Number(synthesis.layer) !== input.iterationNumber;
    }
    return false;
  });
  if (invalidSource) {
    throw new Error(input.iterationNumber === 2
      ? '第二轮只能选择针对社区版本 1 的评论或第二轮综合评论。'
      : '请选择针对初始版本的评论或第一轮综合评论。');
  }

  const firstLine = content.split(/\r?\n/).find((line) => line.trim())?.trim() || content;
  const title = firstLine.length > 30 ? `${firstLine.slice(0, 30)}…` : firstLine;
  const timestamp = now();
  let synthesisId = 0;
  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO vg_async_syntheses
        (study_id, target_app_id, target_version_id, layer, author_code, title, content,
         is_development_brief, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      study().id,
      input.app.id,
      input.baseVersionId,
      input.iterationNumber,
      input.actorCode,
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
        '创作者选择用于本轮开发',
        timestamp,
      );
    });
  });
  transaction();
  recordEvent(input.actorCode, 'select_sources_for_community_development', 'synthesis', synthesisId, {
    appId: input.app.id,
    iterationNumber: input.iterationNumber,
    sourceCount: resolved.length,
    sourceTypes: resolved.map((source) => source.type),
  });
  return synthesisId;
}

function createCommunityGenerationJob(input: {
  actorCode: string;
  app: any;
  sourceType?: CommunitySourceType;
  sourceId?: number;
  sources?: DevelopmentSourceInput[];
  creatorInstruction: string,
  requestedBaseVersionId?: number;
  selectionReason?: string;
  automated?: boolean;
  executionProvider?: CommunityDevelopmentProvider;
  codexTaskId?: string | null;
  allowedCrossVersionCommentIds?: number[];
}) {
  const currentStudy = requireOpenStudy(Number(input.app.is_test));
  if (currentStudy.status !== 'active') {
    throw new Error('请在主持人开始研究后进入社区开发流程。');
  }
  const { app } = input;
  const completedIterations = communityIterationCount(app.id);
  const iterationNumber = completedIterations + 1;
  if (iterationNumber > 2) throw new Error('该应用已经完成两次社区开发。');
  const firstCommunityVersion = versionsForApp(app.id)
    .find((version) => version.kind === 'community' && Number(version.version_number) === 2);
  const defaultBaseVersionId = iterationNumber === 1
    ? Number(app.initial_version_id)
    : Number(firstCommunityVersion?.id);
  const baseVersionId = Number(defaultBaseVersionId);
  const baseVersion = versionById(baseVersionId);
  if (!baseVersion || baseVersion.app_id !== app.id) {
    throw new Error(iterationNumber === 1
      ? '初始版本不存在。'
      : '社区版本 1 不存在。');
  }
  if (input.requestedBaseVersionId && Number(input.requestedBaseVersionId) !== baseVersionId) {
    throw new Error(iterationNumber === 1
      ? '第一次开发固定基于初始版本。'
      : '第二次开发固定基于社区版本 1。');
  }
  const running = db.prepare(`
    SELECT 1 FROM vg_async_generation_jobs
    WHERE study_id = ? AND app_id = ?
      AND status IN ('running', 'waiting_codex', 'codex_processing')
  `).get(study().id, app.id);
  if (running) throw new Error('当前已经有一个社区版本生成任务。');
  let sourceType = input.sourceType;
  let sourceId = Number(input.sourceId || 0);
  if (input.sources) {
    sourceId = createCreatorDevelopmentBrief({
      actorCode: input.actorCode,
      app,
      iterationNumber: iterationNumber as 1 | 2,
      baseVersionId,
      sources: input.sources,
      content: input.creatorInstruction,
      allowedCrossVersionCommentIds: input.allowedCrossVersionCommentIds,
    });
    sourceType = 'synthesis';
  }
  if (sourceType !== 'comment' && sourceType !== 'synthesis') {
    throw new Error('开发来源无效。');
  }
  const selectedSource = sourceRecord(sourceType, sourceId, {
    includeDeleted: true,
    revealDeletedContent: true,
  });
  if (!selectedSource || selectedSource.app_id !== app.id) throw new Error('请选择当前应用的开发来源。');
  const developmentPrompt = input.creatorInstruction.trim() || selectedSource.content.trim();
  if (!developmentPrompt) throw new Error('开发提示词不能为空。');
  const timestamp = now();
  const executionProvider = input.executionProvider || 'deepseek-pro';
  const initialStatus = executionProvider === 'codex' ? 'waiting_codex' : 'running';
  if (executionProvider === 'codex' && !input.codexTaskId) {
    throw new Error('Codex 任务缺少批次编号。');
  }
  let jobId = 0;
  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO vg_async_generation_jobs
        (study_id, app_id, synthesis_id, selected_source_type, selected_source_id,
         iteration_number, base_version_id, selection_reason, creator_instruction,
         execution_provider, codex_task_id, status, created_at, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      study().id,
      app.id,
      sourceType === 'synthesis' ? sourceId : 0,
      sourceType,
      sourceId,
      iterationNumber,
      baseVersionId,
      input.selectionReason?.trim() || '',
      developmentPrompt,
      executionProvider,
      input.codexTaskId || null,
      initialStatus,
      timestamp,
      timestamp,
    );
    jobId = Number(result.lastInsertRowid);
  });
  transaction();
  recordEvent(input.actorCode, 'start_community_generation', 'generation_job', jobId, {
    appId: app.id,
    sourceType,
    sourceId,
    iterationNumber,
    baseVersionId,
    baseVersionNumber: baseVersion.version_number,
    selectionReason: input.selectionReason?.trim() || '',
    promptSource: input.sources ? 'creator_selected_sources' : 'selected_source',
    automated: Boolean(input.automated),
    executionProvider,
    codexTaskId: input.codexTaskId || null,
  });
  return jobId;
}

export function startCommunityGeneration(
  clientId: string,
  appId: string,
  sources: Array<{ type: CommunitySourceType; id: number }> ,
  creatorInstruction: string,
  requestedBaseVersionId?: number,
): { jobId: number; state: ReturnType<typeof getCommunityGalleryState> } {
  void appId;
  void sources;
  void creatorInstruction;
  void requestedBaseVersionId;
  requireViewer(clientId, 'creator');
  throw new Error('开发来源由主持人锁定点赞后统一加权抽取，创作者不能直接启动社区开发。');
}

export function retryCommunityGeneration(clientId: string, failedJobId: number) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = study();
  const failedJob = db.prepare(`
    SELECT j.*, a.status AS app_status, a.is_test
    FROM vg_async_generation_jobs j
    JOIN vg_async_apps a ON a.id = j.app_id
    WHERE j.study_id = ? AND j.id = ?
  `).get(currentStudy.id, failedJobId) as any;
  if (!failedJob) throw new Error('要重新开发的任务不存在。');
  requireOpenStudy(Number(failedJob.is_test));
  if (['running', 'waiting_codex', 'codex_processing'].includes(failedJob.status)) {
    throw new Error('当前开发任务仍在运行，不能重复启动。');
  }
  if (failedJob.app_status !== 'published') {
    throw new Error('只有已发布的应用可以重新开发。');
  }
  const iterationNumber = Number(failedJob.iteration_number);
  if (iterationNumber !== 1 && iterationNumber !== 2) throw new Error('失败任务的开发阶段无效。');
  const latestJob = db.prepare(`
    SELECT id, status FROM vg_async_generation_jobs
    WHERE study_id = ? AND app_id = ? AND iteration_number = ?
    ORDER BY id DESC LIMIT 1
  `).get(currentStudy.id, failedJob.app_id, iterationNumber) as any;
  if (!latestJob || Number(latestJob.id) !== Number(failedJobId)) {
    throw new Error('该应用已经有更新的开发任务。');
  }
  const publishedVersion = db.prepare(`
    SELECT 1 FROM vg_async_versions
    WHERE study_id = ? AND app_id = ? AND kind = 'community' AND version_number = ?
  `).get(currentStudy.id, failedJob.app_id, iterationNumber + 1);
  if (publishedVersion) throw new Error(`社区版本 ${iterationNumber} 已经发布，不能重新开发。`);
  const app = appById(failedJob.app_id);
  if (!app) throw new Error('失败任务对应的应用不存在。');
  const jobId = createCommunityGenerationJob({
    actorCode: viewer.code,
    app,
    sourceType: failedJob.selected_source_type as CommunitySourceType,
    sourceId: Number(failedJob.selected_source_id || failedJob.synthesis_id),
    creatorInstruction: failedJob.creator_instruction || '',
    requestedBaseVersionId: Number(failedJob.base_version_id),
    selectionReason: failedJob.selection_reason || '',
    automated: false,
    executionProvider: failedJob.execution_provider === 'codex' ? 'codex' : 'deepseek-pro',
    codexTaskId: failedJob.execution_provider === 'codex' ? randomUUID() : null,
  });
  recordEvent(viewer.code, 'retry_community_generation', 'generation_job', jobId, {
    retryOfJobId: Number(failedJobId),
    appId: failedJob.app_id,
    iterationNumber,
  });
  return {
    jobId,
    executionProvider: failedJob.execution_provider === 'codex' ? 'codex' : 'deepseek-pro',
    state: getCommunityGalleryState(clientId),
  };
}

export function retryLatestCommunityGenerations(clientId: string, appIds: string[]) {
  requireViewer(clientId, 'host');
  const currentStudy = study();
  const selectedIds = [...new Set(appIds.map(String).filter(Boolean))];
  if (!selectedIds.length) throw new Error('请至少选择一个 Creator。');
  const jobs = selectedIds.map((appId) => {
    const app = appById(appId);
    if (!app || app.status !== 'published') throw new Error('部分所选 Creator 尚未发布 App。');
    const iterationNumber = appFlowStage(app) === 'development_1'
      ? 1
      : appFlowStage(app) === 'development_2'
        ? 2
        : null;
    if (!iterationNumber) throw new Error(`${app.creator_code} 当前不在开发阶段。`);
    const latestJob = db.prepare(`
      SELECT * FROM vg_async_generation_jobs
      WHERE study_id = ? AND app_id = ? AND iteration_number = ?
      ORDER BY id DESC LIMIT 1
    `).get(currentStudy.id, app.id, iterationNumber) as any;
    if (!latestJob || ['running', 'waiting_codex', 'codex_processing'].includes(latestJob.status)) {
      throw new Error(`${app.creator_code} 当前没有可重新启动的开发任务。`);
    }
    const publishedVersion = db.prepare(`
      SELECT 1 FROM vg_async_versions
      WHERE study_id = ? AND app_id = ? AND kind = 'community' AND version_number = ?
    `).get(currentStudy.id, app.id, iterationNumber + 1);
    if (publishedVersion) throw new Error(`${app.creator_code} 已发布本轮版本，不能重新开发。`);
    return latestJob;
  });
  const restarted = jobs.map((job) => retryCommunityGeneration(clientId, Number(job.id)));
  return {
    jobIds: restarted.map((item) => item.jobId),
    backgroundJobIds: restarted
      .filter((item) => item.executionProvider === 'deepseek-pro')
      .map((item) => item.jobId),
    state: getCommunityGalleryState(clientId),
  };
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
  if (!job) throw new Error('社区版本生成任务不存在。');
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

function requireCodexTaskId(taskId: string) {
  const normalized = String(taskId || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error('Codex 任务编号无效。');
  }
  return normalized;
}

export function getCodexCommunityDevelopmentTask(taskId: string) {
  const normalizedTaskId = requireCodexTaskId(taskId);
  const jobs = db.prepare(`
    SELECT j.id
    FROM vg_async_generation_jobs j
    WHERE j.study_id = ? AND j.codex_task_id = ? AND j.execution_provider = 'codex'
    ORDER BY j.id
  `).all(study().id, normalizedTaskId) as Array<{ id: number }>;
  if (!jobs.length) {
    const error = new Error('Codex 任务不存在，或已不属于当前研究。') as Error & { status?: number };
    error.status = 404;
    throw error;
  }
  const items = jobs.map(({ id }) => {
    const input = getCommunityGenerationInput(Number(id));
    return {
      jobId: Number(input.job.id),
      status: input.job.status,
      appId: input.job.app_id,
      creatorCode: input.job.creator_code,
      appTitle: input.job.app_title,
      appBrief: input.job.app_brief,
      iterationNumber: Number(input.job.iteration_number),
      baseVersionId: Number(input.job.base_version_id),
      baseVersionNumber: Number(input.job.base_version_number),
      basePrompt: input.job.base_prompt || '',
      baseCode: input.job.base_code,
      creatorInstruction: input.job.creator_instruction || input.selection.content,
      selectedIdeas: input.sources.map((source: any) => ({
        sourceType: source.source_type,
        sourceId: Number(source.source_id),
        authorCode: source.author_code,
        title: source.title || '',
        content: source.content,
        contributionNote: source.contribution_note || '',
      })),
      createdAt: input.job.created_at,
      claimedAt: input.job.codex_claimed_at || null,
      completedAt: input.job.completed_at || null,
      error: input.job.error || null,
      outputFilename: `${input.job.creator_code}-community-v${Number(input.job.iteration_number)}.html`,
    };
  });
  const completedCount = items.filter((item) => item.status === 'completed').length;
  const failedCount = items.filter((item) => ['failed', 'cancelled'].includes(item.status)).length;
  const processingCount = items.filter((item) => item.status === 'codex_processing').length;
  const status = completedCount === items.length
    ? 'completed'
    : completedCount + failedCount === items.length
      ? 'partial'
      : processingCount > 0
        ? 'processing'
        : 'waiting';
  return {
    taskId: normalizedTaskId,
    status,
    fixedPrompt: CODEX_COMMUNITY_DEVELOPMENT_PROMPT,
    itemCount: items.length,
    completedCount,
    items,
  };
}

export function claimCodexCommunityDevelopmentTask(taskId: string) {
  const task = getCodexCommunityDevelopmentTask(taskId);
  const timestamp = now();
  db.prepare(`
    UPDATE vg_async_generation_jobs
    SET status = 'codex_processing', codex_claimed_at = COALESCE(codex_claimed_at, ?)
    WHERE study_id = ? AND codex_task_id = ? AND execution_provider = 'codex'
      AND status = 'waiting_codex'
  `).run(timestamp, study().id, task.taskId);
  return getCodexCommunityDevelopmentTask(task.taskId);
}

export function submitCodexCommunityDevelopmentResult(
  taskId: string,
  jobId: number,
  code: string,
  summary = '',
) {
  const task = getCodexCommunityDevelopmentTask(taskId);
  const item = task.items.find((candidate) => Number(candidate.jobId) === Number(jobId));
  if (!item) throw new Error('该 App 不属于这个 Codex 任务。');
  if (item.status === 'completed') return getCodexCommunityDevelopmentTask(task.taskId);
  if (!['waiting_codex', 'codex_processing'].includes(item.status)) {
    throw new Error('该 App 的 Codex 任务已经停止，不能再回传结果。');
  }
  if (!code.trim() || Buffer.byteLength(code, 'utf8') > 8 * 1024 * 1024) {
    throw new Error('Codex 结果不能为空且不能超过 8MB。');
  }
  if (!/(?:<!doctype\s+html|<html\b)/i.test(code) || !/<\/html\s*>/i.test(code)) {
    throw new Error('Codex 必须回传包含完整 html 结构的单个 HTML 文件。');
  }
  completeCommunityGeneration(
    Number(jobId),
    code,
    summary.trim() || 'Codex 已根据本轮入选评论完成平台兼容版本。',
  );
  return getCodexCommunityDevelopmentTask(task.taskId);
}

export function recordCommunityGenerationProgress(jobId: number, progress: DevelopmentAgentProgress) {
  const input = getCommunityGenerationInput(jobId);
  if (input.job.status !== 'running') return;
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
  if (!['running', 'waiting_codex', 'codex_processing'].includes(input.job.status)) return;
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
      DELETE FROM vg_async_development_messages
      WHERE study_id = ? AND app_id = ? AND phase = 'community' AND iteration_number = ?
    `).run(study().id, input.job.app_id, Number(input.job.iteration_number || 1));
    const insertMessage = db.prepare(`
      INSERT INTO vg_async_development_messages
        (study_id, app_id, phase, iteration_number, role, content, created_at)
      VALUES (?, ?, 'community', ?, ?, ?, ?)
    `);
    insertMessage.run(
      study().id,
      input.job.app_id,
      Number(input.job.iteration_number || 1),
      'creator',
      input.job.creator_instruction || input.selection.content,
      timestamp,
    );
    insertMessage.run(
      study().id,
      input.job.app_id,
      Number(input.job.iteration_number || 1),
      'assistant',
      summary,
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
  if (input.job.status !== 'running') return;
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.includes('请重试')
    ? rawMessage
    : `AI 开发过程中出现异常，本轮开发失败，请重试。错误信息：${rawMessage}`;
  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE vg_async_generation_jobs
      SET status = 'failed', error = ?, completed_at = ?
      WHERE study_id = ? AND id = ?
    `).run(message, timestamp, study().id, jobId);
    db.prepare(`
      UPDATE vg_async_generation_events
      SET status = 'failed', title = '开发失败，请重试', detail = ?, updated_at = ?
      WHERE study_id = ? AND job_id = ? AND status IN ('pending', 'running')
    `).run(message, timestamp, study().id, jobId);
  });
  transaction();
  recordEvent(input.job.creator_code, 'fail_community_generation', 'generation_job', jobId);
}

function publishCommunityVersionForApp(actorCode: string, app: any, automated = false) {
  requireOpenStudy(Number(app.is_test));
  const completedIterations = communityIterationCount(app.id);
  if (completedIterations >= 2) return;
  const expectedFlowStage = completedIterations === 0 ? 'development_1' : 'development_2';
  if (appFlowStage(app) !== expectedFlowStage) {
    throw new Error('当前 App 不在可发布的系统开发阶段。');
  }
  const draft = db.prepare(`
    SELECT * FROM vg_async_drafts
    WHERE study_id = ? AND app_id = ? AND kind = 'community'
  `).get(study().id, app.id) as any;
  if (!draft?.code) throw new Error('请先生成社区版本草稿。');
  const iterationNumber = completedIterations + 1;
  if (Number(draft.iteration_number || iterationNumber) !== iterationNumber) {
    throw new Error('当前草稿不属于下一次社区开发，请重新选择方向。');
  }
  const baseVersion = versionById(Number(draft.base_version_id || app.initial_version_id));
  if (!baseVersion || baseVersion.app_id !== app.id) throw new Error('草稿的开发基础版本不存在。');
  const timestamp = now();
  const communityCreatorPrompts = draft.synthesis_id
    ? (db.prepare(`
        SELECT content FROM vg_async_development_messages
        WHERE study_id = ? AND app_id = ? AND phase = 'community'
          AND iteration_number = ? AND role = 'creator'
        ORDER BY id
      `).all(
        study().id,
        app.id,
        iterationNumber,
      ) as Array<{ content: string }>)
      .map((message) => message.content.trim())
      .filter(Boolean)
    : [];
  const followUpPrompts = communityCreatorPrompts[0] === String(draft.prompt || '').trim()
    ? communityCreatorPrompts.slice(1)
    : communityCreatorPrompts;
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
    if (draft.synthesis_id && followUpPrompts.length) {
      const developmentBrief = synthesisByIdIncludingDeleted(Number(draft.synthesis_id));
      if (developmentBrief?.is_development_brief) {
        const transcript = followUpPrompts.map(
          (prompt, index) => `第 ${index + 2} 轮提示词：${prompt}`,
        ).join('\n\n');
        db.prepare(`
          UPDATE vg_async_syntheses
          SET content = ?, updated_at = ?
          WHERE study_id = ? AND id = ?
        `).run(
          `${developmentBrief.content.trim()}\n\n后续开发提示词\n${transcript}`,
          timestamp,
          study().id,
          Number(draft.synthesis_id),
        );
      }
    }
    db.prepare(`
      DELETE FROM vg_async_drafts WHERE study_id = ? AND app_id = ?
    `).run(study().id, app.id);
    updateAppFlowStage(app.id, iterationNumber === 1 ? 'round_2' : 'completed');
  });
  transaction();
  if (draft.selected_source_type && draft.selected_source_id) {
    createContributionNotifications(
      app,
      draft.selected_source_type as CommunitySourceType,
      Number(draft.selected_source_id),
      iterationNumber,
      actorCode,
    );
  }
  recordEvent(actorCode, 'publish_community_version', 'app', app.id, {
    synthesisId: draft.synthesis_id || null,
    sourceType: draft.selected_source_type || null,
    sourceId: draft.selected_source_id || null,
    iterationNumber,
    baseVersionId: baseVersion.id,
    baseVersionNumber: baseVersion.version_number,
    selectionReason: draft.selection_reason || '',
    promptRounds: followUpPrompts.length + 1,
    automated,
  });
}

export function publishCommunityVersion(clientId: string, appId: string) {
  const { viewer, app } = ownedApp(clientId, appId);
  publishCommunityVersionForApp(viewer.code, app);
  return getCommunityGalleryState(clientId);
}

export function uploadAndPublishCommunityVersion(
  clientId: string,
  appId: string,
  code: string,
  filename = '',
) {
  const { viewer, app } = ownedApp(clientId, appId);
  const currentStudy = requireOpenStudy(Number(app.is_test));
  const completedIterations = communityIterationCount(app.id);
  const iterationNumber = completedIterations + 1;
  const expectedFlowStage = iterationNumber === 1
    ? 'development_1'
    : iterationNumber === 2
      ? 'development_2'
      : null;
  if (!expectedFlowStage || appFlowStage(app) !== expectedFlowStage) {
    throw new Error('只有主持人完成本轮抽取、且本轮社区版本尚未发布时才能上传 HTML。');
  }
  if (!app.initial_version_id) throw new Error('初始版本不存在，无法上传本轮社区版本。');
  if (!code.trim() || Buffer.byteLength(code, 'utf8') > 8 * 1024 * 1024) {
    throw new Error('HTML 文件不能为空且不能超过 8MB。');
  }
  if (!/(?:<!doctype\s+html|<html\b)/i.test(code) || !/<\/html\s*>/i.test(code)) {
    throw new Error('请选择包含完整 html 结构的 HTML 文件。');
  }
  const selection = db.prepare(`
    SELECT * FROM vg_async_stage_selections
    WHERE study_id = ? AND app_id = ? AND iteration_number = ?
  `).get(currentStudy.id, app.id, iterationNumber) as any;
  if (!selection?.source_type || !Number(selection.source_id)) {
    throw new Error(`第 ${iterationNumber} 轮抽取结果不存在，暂时不能上传本轮版本。`);
  }
  const latestJob = db.prepare(`
    SELECT * FROM vg_async_generation_jobs
    WHERE study_id = ? AND app_id = ? AND iteration_number = ?
    ORDER BY id DESC LIMIT 1
  `).get(currentStudy.id, app.id, iterationNumber) as any;
  const sourceType = String(
    latestJob?.selected_source_type || selection.source_type,
  ) as CommunitySourceType;
  const sourceId = Number(latestJob?.selected_source_id || selection.source_id);
  const selectedSource = sourceRecord(sourceType, sourceId, {
    includeDeleted: true,
    revealDeletedContent: true,
  });
  if (!selectedSource || selectedSource.app_id !== app.id) {
    throw new Error(`第 ${iterationNumber} 轮抽中的开发来源不存在。`);
  }
  const baseVersionId = Number(latestJob?.base_version_id || (
    iterationNumber === 1 ? app.initial_version_id : app.community_version_id
  ));
  const baseVersion = versionById(baseVersionId);
  if (!baseVersion || baseVersion.app_id !== app.id) {
    throw new Error(`社区版本 ${iterationNumber - 1} 不存在，无法上传本轮版本。`);
  }
  const timestamp = now();
  const normalizedFilename = filename.trim().slice(0, 180);
  const summary = normalizedFilename
    ? `创作者上传 ${normalizedFilename} 完成第 ${iterationNumber} 轮开发。`
    : `创作者上传 HTML 完成第 ${iterationNumber} 轮开发。`;
  const prompt = String(latestJob?.creator_instruction || selection.source_content || selectedSource.content || '').trim();
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE vg_async_generation_jobs
      SET status = 'cancelled', error = '创作者上传 HTML 后直接发布，AI 生成结果已停用。', completed_at = ?
      WHERE study_id = ? AND app_id = ? AND iteration_number = ?
        AND status IN ('running', 'waiting_codex', 'codex_processing')
    `).run(timestamp, currentStudy.id, app.id, iterationNumber);
    db.prepare(`
      UPDATE vg_async_generation_events
      SET status = 'cancelled', title = '作者已上传 HTML，本次 AI 开发停止',
        detail = ?, updated_at = ?
      WHERE study_id = ? AND app_id = ? AND status IN ('pending', 'running', 'warning')
        AND job_id IN (
          SELECT id FROM vg_async_generation_jobs
          WHERE study_id = ? AND app_id = ? AND iteration_number = ?
        )
    `).run(
      `作者上传的 HTML 已作为社区版本 ${iterationNumber} 发布。`,
      timestamp,
      currentStudy.id,
      app.id,
      currentStudy.id,
      app.id,
      iterationNumber,
    );
    db.prepare(`
      INSERT INTO vg_async_drafts
        (study_id, app_id, kind, code, summary, prompt, synthesis_id,
         selected_source_type, selected_source_id, iteration_number,
         base_version_id, selection_reason, updated_at)
      VALUES (?, ?, 'community', ?, ?, ?, ?, ?, ?, ?, ?, 'creator_html_upload', ?)
      ON CONFLICT(study_id, app_id) DO UPDATE SET
        kind = 'community', code = excluded.code, summary = excluded.summary,
        prompt = excluded.prompt, synthesis_id = excluded.synthesis_id,
        selected_source_type = excluded.selected_source_type,
        selected_source_id = excluded.selected_source_id,
        iteration_number = excluded.iteration_number, base_version_id = excluded.base_version_id,
        selection_reason = excluded.selection_reason, updated_at = excluded.updated_at
    `).run(
      currentStudy.id,
      app.id,
      code,
      summary,
      prompt,
      sourceType === 'synthesis' ? sourceId : null,
      sourceType,
      sourceId,
      iterationNumber,
      baseVersion.id,
      timestamp,
    );
  });
  transaction();
  recordEvent(
    viewer.code,
    iterationNumber === 1
      ? 'upload_first_community_version_html'
      : 'upload_second_community_version_html',
    'app',
    app.id,
    {
      filename: normalizedFilename || null,
      sourceType,
      sourceId,
      iterationNumber,
      baseVersionId: baseVersion.id,
      replacedGenerationJobId: latestJob?.id ? Number(latestJob.id) : null,
    },
  );
  publishCommunityVersionForApp(viewer.code, app);
  return getCommunityGalleryState(clientId);
}

export function uploadAndPublishFirstCommunityVersion(
  clientId: string,
  appId: string,
  code: string,
  filename = '',
) {
  return uploadAndPublishCommunityVersion(clientId, appId, code, filename);
}

export function replacePublishedCommunityVersionHtml(
  clientId: string,
  appId: string,
  versionId: number,
  code: string,
  filename = '',
) {
  const { viewer, app } = ownedApp(clientId, appId);
  const currentStudy = requireOpenStudy(Number(app.is_test));
  if (!code.trim() || Buffer.byteLength(code, 'utf8') > 8 * 1024 * 1024) {
    throw new Error('HTML 文件不能为空且不能超过 8MB。');
  }
  if (!/(?:<!doctype\s+html|<html\b)/i.test(code) || !/<\/html\s*>/i.test(code)) {
    throw new Error('请选择包含完整 html 结构的 HTML 文件。');
  }
  const version = db.prepare(`
    SELECT * FROM vg_async_versions
    WHERE study_id = ? AND app_id = ? AND id = ? AND kind = 'community'
  `).get(currentStudy.id, app.id, versionId) as any;
  if (!version) throw new Error('要重新上传的社区版本不存在。');
  if (Number(app.community_version_id) !== Number(version.id)) {
    throw new Error('只能重新上传当前最新的社区版本。');
  }
  const iterationNumber = Number(version.version_number) - 1;
  const expectedStage = iterationNumber === 1 ? 'round_2' : iterationNumber === 2 ? 'completed' : null;
  if (!expectedStage || appFlowStage(app) !== expectedStage) {
    throw new Error(iterationNumber === 1
      ? '第二轮开发已经锁定，不能再替换作为开发基础的社区版本 1。'
      : '当前社区版本不能重新上传。');
  }
  const normalizedFilename = filename.trim().slice(0, 180);
  const timestamp = now();
  const summary = normalizedFilename
    ? `创作者重新上传 ${normalizedFilename}，替换社区版本 ${iterationNumber}。`
    : `创作者重新上传 HTML，替换社区版本 ${iterationNumber}。`;
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE vg_async_versions
      SET code = ?, summary = ?, selection_reason = 'creator_html_upload'
      WHERE study_id = ? AND app_id = ? AND id = ?
    `).run(code, summary, currentStudy.id, app.id, version.id);
    db.prepare(`
      UPDATE vg_async_apps SET updated_at = ?
      WHERE study_id = ? AND id = ?
    `).run(timestamp, currentStudy.id, app.id);
  });
  transaction();
  recordEvent(viewer.code, 'replace_published_community_version_html', 'version', version.id, {
    appId: app.id,
    filename: normalizedFilename || null,
    iterationNumber,
    preservedVersionId: Number(version.id),
    preservedFlowStage: expectedStage,
  });
  return getCommunityGalleryState(clientId);
}

export function cancelCommunityWildcard(clientId: string, appId: string) {
  const { viewer, app } = ownedApp(clientId, appId);
  const currentStudy = requireOpenStudy(Number(app.is_test));
  const wildcard = db.prepare(`
    SELECT * FROM vg_async_wildcards
    WHERE study_id = ? AND creator_code = ? AND app_id = ?
  `).get(currentStudy.id, viewer.code, app.id) as any;
  if (!wildcard) throw new Error('当前没有已选择的万能卡评论。');
  const iterationNumber = requireAppRoundOpen(app);
  if (Number(wildcard.iteration_number) !== iterationNumber) {
    throw new Error('本轮开发已经开始，不能再取消万能卡选择。');
  }
  db.prepare(`
    DELETE FROM vg_async_wildcards
    WHERE study_id = ? AND creator_code = ? AND app_id = ?
  `).run(currentStudy.id, viewer.code, app.id);
  recordEvent(viewer.code, 'cancel_community_wildcard', 'comment', wildcard.source_id, {
    appId: app.id,
    iterationNumber,
  });
  return getCommunityGalleryState(clientId);
}

export function rollbackFirstCommunityVersion(clientId: string, appId: string) {
  const { viewer, app } = ownedApp(clientId, appId);
  const currentStudy = requireOpenStudy(Number(app.is_test));
  const completedIterations = communityIterationCount(app.id);
  if (completedIterations !== 1 || !app.community_version_id) {
    throw new Error('只有已经发布社区版本 1、且尚未发布社区版本 2 的应用可以回退。');
  }
  const publishedVersion = db.prepare(`
    SELECT * FROM vg_async_versions
    WHERE study_id = ? AND app_id = ? AND id = ? AND kind = 'community' AND version_number = 2
  `).get(currentStudy.id, app.id, Number(app.community_version_id)) as any;
  if (!publishedVersion) throw new Error('社区版本 1 不存在，无法回退。');
  const runningTaskCount = Number((db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM vg_async_generation_jobs
        WHERE study_id = ? AND app_id = ?
          AND status IN ('running', 'waiting_codex', 'codex_processing')) +
      (SELECT COUNT(*) FROM vg_async_creator_operations
        WHERE study_id = ? AND app_id = ? AND status = 'running') AS count
  `).get(
    currentStudy.id, app.id,
    currentStudy.id, app.id,
  ) as { count?: number } | undefined)?.count || 0);
  if (runningTaskCount > 0) throw new Error('该应用仍有开发任务正在运行，任务结束前不能回退。');

  const secondRoundSynthesisIds = (db.prepare(`
    SELECT id FROM vg_async_syntheses
    WHERE study_id = ? AND target_app_id = ?
      AND (target_version_id = ? OR layer = 2)
  `).all(currentStudy.id, app.id, publishedVersion.id) as Array<{ id: number }>)
    .map((row) => Number(row.id));
  const synthesisPlaceholders = secondRoundSynthesisIds.map(() => '?').join(',');
  const secondRoundCommentIds = (db.prepare(`
    SELECT id FROM vg_async_comments
    WHERE study_id = ? AND app_id = ? AND (
      version_id = ?
      ${secondRoundSynthesisIds.length
        ? `OR (target_type = 'synthesis' AND CAST(target_id AS INTEGER) IN (${synthesisPlaceholders}))`
        : ''}
    )
  `).all(
    currentStudy.id,
    app.id,
    publishedVersion.id,
    ...secondRoundSynthesisIds,
  ) as Array<{ id: number }>).map((row) => Number(row.id));
  const secondRoundJobIds = (db.prepare(`
    SELECT id FROM vg_async_generation_jobs
    WHERE study_id = ? AND app_id = ? AND iteration_number = 2
  `).all(currentStudy.id, app.id) as Array<{ id: number }>).map((row) => Number(row.id));
  const timestamp = now();
  const deleteByIds = (table: string, column: string, ids: number[]) => {
    if (!ids.length) return;
    db.prepare(`DELETE FROM ${table} WHERE study_id = ? AND ${column} IN (${ids.map(() => '?').join(',')})`)
      .run(currentStudy.id, ...ids);
  };

  const transaction = db.transaction(() => {
    deleteByIds('vg_async_comment_likes', 'comment_id', secondRoundCommentIds);
    deleteByIds('vg_async_synthesis_likes', 'synthesis_id', secondRoundSynthesisIds);
    if (secondRoundCommentIds.length || secondRoundSynthesisIds.length) {
      const conditions: string[] = [];
      const values: Array<string | number> = [currentStudy.id];
      if (secondRoundCommentIds.length) {
        conditions.push(`(source_type = 'comment' AND source_id IN (${secondRoundCommentIds.map(() => '?').join(',')}))`);
        values.push(...secondRoundCommentIds);
      }
      if (secondRoundSynthesisIds.length) {
        conditions.push(`(source_type = 'synthesis' AND source_id IN (${secondRoundSynthesisIds.map(() => '?').join(',')}))`);
        values.push(...secondRoundSynthesisIds);
      }
      db.prepare(`DELETE FROM vg_async_basket_items WHERE study_id = ? AND (${conditions.join(' OR ')})`)
        .run(...values);
    }
    if (secondRoundCommentIds.length || secondRoundSynthesisIds.length) {
      const conditions: string[] = [];
      const values: number[] = [];
      if (secondRoundSynthesisIds.length) {
        conditions.push(`synthesis_id IN (${synthesisPlaceholders})`);
        values.push(...secondRoundSynthesisIds);
        conditions.push(`(source_type = 'synthesis' AND source_id IN (${synthesisPlaceholders}))`);
        values.push(...secondRoundSynthesisIds);
      }
      if (secondRoundCommentIds.length) {
        conditions.push(`(source_type = 'comment' AND source_id IN (${secondRoundCommentIds.map(() => '?').join(',')}))`);
        values.push(...secondRoundCommentIds);
      }
      db.prepare(`
        DELETE FROM vg_async_synthesis_sources
        WHERE study_id = ? AND (${conditions.join(' OR ')})
      `).run(currentStudy.id, ...values);
    }
    deleteByIds('vg_async_comments', 'id', secondRoundCommentIds);
    deleteByIds('vg_async_syntheses', 'id', secondRoundSynthesisIds);
    deleteByIds('vg_async_generation_events', 'job_id', secondRoundJobIds);
    db.prepare(`DELETE FROM vg_async_generation_jobs
      WHERE study_id = ? AND app_id = ? AND iteration_number = 2`)
      .run(currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_stage_selections
      WHERE study_id = ? AND app_id = ? AND iteration_number = 2`)
      .run(currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_wildcards
      WHERE study_id = ? AND app_id = ? AND iteration_number = 2`)
      .run(currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_contributors
      WHERE study_id = ? AND app_id = ? AND iteration_number = 2`)
      .run(currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_notifications
      WHERE study_id = ? AND app_id = ? AND version_number = 2`)
      .run(currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_synthesis_votes
      WHERE study_id = ? AND target_app_id = ? AND layer = 2`)
      .run(currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_development_messages
      WHERE study_id = ? AND app_id = ? AND phase = 'community' AND iteration_number = 2`)
      .run(currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_creator_revisions
      WHERE study_id = ? AND app_id = ? AND version_id = ?`)
      .run(currentStudy.id, app.id, publishedVersion.id);
    db.prepare(`DELETE FROM vg_async_version_likes
      WHERE study_id = ? AND app_id = ? AND version_id = ?`)
      .run(currentStudy.id, app.id, publishedVersion.id);
    db.prepare(`
      INSERT INTO vg_async_drafts
        (study_id, app_id, kind, code, summary, prompt, synthesis_id,
         selected_source_type, selected_source_id, iteration_number,
         base_version_id, selection_reason, updated_at)
      VALUES (?, ?, 'community', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(study_id, app_id) DO UPDATE SET
        kind = 'community', code = excluded.code, summary = excluded.summary,
        prompt = excluded.prompt, synthesis_id = excluded.synthesis_id,
        selected_source_type = excluded.selected_source_type,
        selected_source_id = excluded.selected_source_id,
        iteration_number = 1, base_version_id = excluded.base_version_id,
        selection_reason = excluded.selection_reason, updated_at = excluded.updated_at
    `).run(
      currentStudy.id,
      app.id,
      publishedVersion.code,
      publishedVersion.summary || '',
      publishedVersion.prompt || '',
      publishedVersion.synthesis_id || null,
      publishedVersion.selected_source_type || null,
      publishedVersion.selected_source_id || null,
      publishedVersion.base_version_id || app.initial_version_id,
      publishedVersion.selection_reason || '',
      timestamp,
    );
    db.prepare(`DELETE FROM vg_async_versions WHERE study_id = ? AND app_id = ? AND id = ?`)
      .run(currentStudy.id, app.id, publishedVersion.id);
    db.prepare(`
      UPDATE vg_async_apps
      SET community_version_id = NULL, selected_synthesis_id = ?,
        selected_source_type = ?, selected_source_id = ?,
        flow_stage = 'development_1', community_published_at = NULL, updated_at = ?
      WHERE study_id = ? AND id = ?
    `).run(
      publishedVersion.synthesis_id || null,
      publishedVersion.selected_source_type || null,
      publishedVersion.selected_source_id || null,
      timestamp,
      currentStudy.id,
      app.id,
    );
  });
  transaction();
  recordEvent(viewer.code, 'rollback_community_version_1', 'app', app.id, {
    rolledBackVersionId: Number(publishedVersion.id),
    restoredPublishedVersionId: Number(app.initial_version_id),
    restoredAsDraft: true,
    removedSecondRoundComments: secondRoundCommentIds.length,
    removedSecondRoundSyntheses: secondRoundSynthesisIds.length,
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

  for (const isTest of [0, 1]) {
    const existing = db.prepare(`
      SELECT COUNT(*) AS count FROM vg_async_assignments a
      JOIN vg_async_participants p
        ON p.study_id = a.study_id AND p.code = a.participant_code
      WHERE a.study_id = ? AND p.role = 'creator' AND p.is_test = ?
    `).get(currentStudy.id, isTest) as { count: number };
    if (Number(existing.count) > 0) continue;
    const participants = db.prepare(`
      SELECT * FROM vg_async_participants
      WHERE study_id = ? AND role = 'creator' AND is_test = ?
      ORDER BY code
    `).all(currentStudy.id, isTest) as any[];
    const apps = db.prepare(`
      SELECT * FROM vg_async_apps
      WHERE study_id = ? AND is_test = ? AND status = 'published'
      ORDER BY creator_code
    `).all(currentStudy.id, isTest) as any[];
    if (!participants.length || apps.length !== participants.length) continue;
    assignBalanced(participants, apps);
  }
}

function collectCommunityStudyData(studyId: string, includeResetSnapshots = false) {
  const tables = includeResetSnapshots
    ? [...COMMUNITY_STUDY_DATA_TABLES, 'vg_async_reset_snapshots']
    : COMMUNITY_STUDY_DATA_TABLES;
  return Object.fromEntries(tables.map((table) => [
    table.replace('vg_async_', ''),
    db.prepare(`SELECT * FROM ${table} WHERE study_id = ? ORDER BY rowid`).all(studyId),
  ]));
}

function collectCommunityWorkspaceData(studyId: string, isTest: boolean) {
  const all = collectCommunityStudyData(studyId) as Record<string, any[]>;
  const workspaceFlag = Number(isTest);
  const workspaceName = isTest ? 'test' : 'regular';
  const creators = all.participants.filter((row) => (
    row.role === 'creator' && Number(row.is_test) === workspaceFlag
  ));
  const creatorCodes = new Set(creators.map((row) => row.code));
  const apps = all.apps.filter((row) => Number(row.is_test) === workspaceFlag);
  const appIds = new Set(apps.map((row) => row.id));
  const versions = all.versions.filter((row) => appIds.has(row.app_id));
  const comments = all.comments.filter((row) => appIds.has(row.app_id));
  const commentIds = new Set(comments.map((row) => Number(row.id)));
  const syntheses = all.syntheses.filter((row) => appIds.has(row.target_app_id));
  const synthesisIds = new Set(syntheses.map((row) => Number(row.id)));
  const creatorOperations = all.creator_operations.filter((row) => (
    creatorCodes.has(row.creator_code) || (row.app_id && appIds.has(row.app_id))
  ));
  const operationIds = new Set(creatorOperations.map((row) => row.id));
  const generationJobs = all.generation_jobs.filter((row) => appIds.has(row.app_id));
  const generationJobIds = new Set(generationJobs.map((row) => Number(row.id)));
  const relevantEvent = (row: any) => {
    if (creatorCodes.has(row.participant_code)) return true;
    if (row.entity_type === 'app' && appIds.has(row.entity_id)) return true;
    if (row.entity_type === 'comment' && commentIds.has(Number(row.entity_id))) return true;
    if (row.entity_type === 'synthesis' && synthesisIds.has(Number(row.entity_id))) return true;
    if (row.entity_type === 'generation_job' && generationJobIds.has(Number(row.entity_id))) return true;
    if (row.entity_type === 'creator_operation' && operationIds.has(row.entity_id)) return true;
    const dataJson = String(row.data_json || '');
    return dataJson.includes(`"workspace":"${workspaceName}"`)
      || [...appIds].some((appId) => dataJson.includes(String(appId)));
  };
  const host = all.participants.find((row) => row.role === 'host');
  return {
    participants: host ? [host, ...creators] : creators,
    workspace_states: all.workspace_states.filter((row) => Number(row.is_test) === workspaceFlag),
    sessions: all.sessions.filter((row) => creatorCodes.has(row.participant_code)),
    apps,
    versions,
    drafts: all.drafts.filter((row) => appIds.has(row.app_id)),
    development_messages: all.development_messages.filter((row) => appIds.has(row.app_id)),
    creator_revisions: all.creator_revisions.filter((row) => appIds.has(row.app_id)),
    creator_operations: creatorOperations,
    creator_progress: all.creator_progress.filter((row) => operationIds.has(row.operation_id)),
    comments,
    comment_likes: all.comment_likes.filter((row) => commentIds.has(Number(row.comment_id))),
    app_likes: all.app_likes.filter((row) => appIds.has(row.app_id)),
    version_likes: all.version_likes.filter((row) => appIds.has(row.app_id)),
    basket_items: all.basket_items.filter((row) => creatorCodes.has(row.participant_code)),
    syntheses,
    synthesis_sources: all.synthesis_sources.filter((row) => synthesisIds.has(Number(row.synthesis_id))),
    synthesis_votes: all.synthesis_votes.filter((row) => appIds.has(row.target_app_id)),
    synthesis_likes: all.synthesis_likes.filter((row) => synthesisIds.has(Number(row.synthesis_id))),
    stage_selections: all.stage_selections.filter((row) => appIds.has(row.app_id)),
    generation_jobs: generationJobs,
    generation_events: all.generation_events.filter((row) => generationJobIds.has(Number(row.job_id))),
    notifications: all.notifications.filter((row) => appIds.has(row.app_id)),
    assignments: all.assignments.filter((row) => appIds.has(row.app_id)),
    wildcards: all.wildcards.filter((row) => appIds.has(row.app_id)),
    contributors: all.contributors.filter((row) => appIds.has(row.app_id)),
    events: all.events.filter(relevantEvent),
  };
}

function communityTestDataPreview(studyId: string) {
  const count = (query: string, ...params: unknown[]) => Number((
    db.prepare(query).get(...params) as { count?: number } | undefined
  )?.count || 0);
  const testCreatorCount = count(`
    SELECT COUNT(*) AS count FROM vg_async_participants
    WHERE study_id = ? AND role = 'creator' AND is_test = 1
  `, studyId);
  const testSessionCount = count(`
    SELECT COUNT(*) AS count FROM vg_async_sessions s
    JOIN vg_async_participants p ON p.study_id = s.study_id AND p.code = s.participant_code
    WHERE s.study_id = ? AND p.is_test = 1
  `, studyId);
  const testAppCount = count(`
    SELECT COUNT(*) AS count FROM vg_async_apps WHERE study_id = ? AND is_test = 1
  `, studyId);
  const versionCount = count(`
    SELECT COUNT(*) AS count FROM vg_async_versions v
    JOIN vg_async_apps a ON a.id = v.app_id
    WHERE v.study_id = ? AND a.is_test = 1
  `, studyId);
  const commentCount = count(`
    SELECT COUNT(*) AS count FROM vg_async_comments c
    JOIN vg_async_apps a ON a.id = c.app_id
    WHERE c.study_id = ? AND a.is_test = 1
  `, studyId);
  const synthesisCount = count(`
    SELECT COUNT(*) AS count FROM vg_async_syntheses s
    JOIN vg_async_apps a ON a.id = s.target_app_id
    WHERE s.study_id = ? AND a.is_test = 1
  `, studyId);
  const likeCount = count(`
    SELECT
      (SELECT COUNT(*) FROM vg_async_comment_likes l
        JOIN vg_async_comments c ON c.id = l.comment_id JOIN vg_async_apps a ON a.id = c.app_id
        WHERE l.study_id = ? AND a.is_test = 1) +
      (SELECT COUNT(*) FROM vg_async_version_likes l JOIN vg_async_apps a ON a.id = l.app_id
        WHERE l.study_id = ? AND a.is_test = 1) +
      (SELECT COUNT(*) FROM vg_async_synthesis_likes l
        JOIN vg_async_syntheses s ON s.id = l.synthesis_id JOIN vg_async_apps a ON a.id = s.target_app_id
        WHERE l.study_id = ? AND a.is_test = 1) AS count
  `, studyId, studyId, studyId);
  const basketItemCount = count(`
    SELECT COUNT(*) AS count FROM vg_async_basket_items b
    JOIN vg_async_participants p ON p.study_id = b.study_id AND p.code = b.participant_code
    WHERE b.study_id = ? AND p.is_test = 1
  `, studyId);
  const generationJobCount = count(`
    SELECT COUNT(*) AS count FROM vg_async_generation_jobs j
    JOIN vg_async_apps a ON a.id = j.app_id
    WHERE j.study_id = ? AND a.is_test = 1
  `, studyId);
  const behaviorEventCount = count(`
    SELECT COUNT(*) AS count FROM vg_async_events e
    JOIN vg_async_participants p ON p.study_id = e.study_id AND p.code = e.participant_code
    WHERE e.study_id = ? AND p.is_test = 1
  `, studyId);
  const runningTaskCount = count(`
    SELECT
      (SELECT COUNT(*) FROM vg_async_generation_jobs j JOIN vg_async_apps a ON a.id = j.app_id
        WHERE j.study_id = ?
          AND j.status IN ('running', 'waiting_codex', 'codex_processing') AND a.is_test = 1) +
      (SELECT COUNT(*) FROM vg_async_creator_operations o
        JOIN vg_async_participants p ON p.study_id = o.study_id AND p.code = o.creator_code
        WHERE o.study_id = ? AND o.status = 'running' AND p.is_test = 1) AS count
  `, studyId, studyId);
  return {
    testCreatorCount,
    testSessionCount,
    testAppCount,
    versionCount,
    commentCount,
    synthesisCount,
    likeCount,
    basketItemCount,
    generationJobCount,
    behaviorEventCount,
    runningTaskCount,
    hasTestData: testSessionCount + testAppCount + behaviorEventCount > 0,
  };
}

export function clearCommunityTestData(clientId: string, confirmation: string) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = study();
  if (confirmation.trim() !== TEST_RESET_CONFIRMATION) {
    throw new Error(`请输入“${TEST_RESET_CONFIRMATION}”确认操作。`);
  }
  const preview = communityTestDataPreview(currentStudy.id);
  if (preview.runningTaskCount > 0) {
    throw new Error('测试角色仍有 AI 开发任务正在运行，请等待任务完成或失败后再清除。');
  }
  if (!preview.hasTestData) throw new Error('当前没有需要清除的测试角色数据。');

  const timestamp = now();
  const transaction = db.transaction(() => {
    db.prepare(`
      DELETE FROM vg_async_events
      WHERE study_id = ?
        AND (
          participant_code IN (SELECT code FROM vg_async_participants WHERE study_id = ? AND is_test = 1)
          OR (entity_type = 'app' AND entity_id IN (SELECT id FROM vg_async_apps WHERE study_id = ? AND is_test = 1))
          OR (entity_type = 'comment' AND entity_id IN (
            SELECT CAST(c.id AS TEXT) FROM vg_async_comments c JOIN vg_async_apps a ON a.id = c.app_id
            WHERE c.study_id = ? AND a.is_test = 1
          ))
          OR (entity_type = 'synthesis' AND entity_id IN (
            SELECT CAST(s.id AS TEXT) FROM vg_async_syntheses s JOIN vg_async_apps a ON a.id = s.target_app_id
            WHERE s.study_id = ? AND a.is_test = 1
          ))
          OR (entity_type = 'generation_job' AND entity_id IN (
            SELECT CAST(j.id AS TEXT) FROM vg_async_generation_jobs j JOIN vg_async_apps a ON a.id = j.app_id
            WHERE j.study_id = ? AND a.is_test = 1
          ))
        )
    `).run(currentStudy.id, currentStudy.id, currentStudy.id, currentStudy.id, currentStudy.id, currentStudy.id);

    db.prepare(`DELETE FROM vg_async_sessions WHERE study_id = ? AND participant_code IN
      (SELECT code FROM vg_async_participants WHERE study_id = ? AND is_test = 1)`)
      .run(currentStudy.id, currentStudy.id);
    db.prepare(`DELETE FROM vg_async_creator_progress WHERE study_id = ? AND operation_id IN
      (SELECT o.id FROM vg_async_creator_operations o JOIN vg_async_participants p
       ON p.study_id = o.study_id AND p.code = o.creator_code WHERE o.study_id = ? AND p.is_test = 1)`)
      .run(currentStudy.id, currentStudy.id);
    db.prepare(`DELETE FROM vg_async_generation_events WHERE study_id = ? AND job_id IN
      (SELECT j.id FROM vg_async_generation_jobs j JOIN vg_async_apps a ON a.id = j.app_id
       WHERE j.study_id = ? AND a.is_test = 1)`).run(currentStudy.id, currentStudy.id);
    db.prepare(`DELETE FROM vg_async_comment_likes WHERE study_id = ? AND comment_id IN
      (SELECT c.id FROM vg_async_comments c JOIN vg_async_apps a ON a.id = c.app_id
       WHERE c.study_id = ? AND a.is_test = 1)`).run(currentStudy.id, currentStudy.id);
    db.prepare(`DELETE FROM vg_async_app_likes WHERE study_id = ? AND app_id IN
      (SELECT id FROM vg_async_apps WHERE study_id = ? AND is_test = 1)`).run(currentStudy.id, currentStudy.id);
    db.prepare(`DELETE FROM vg_async_version_likes WHERE study_id = ? AND app_id IN
      (SELECT id FROM vg_async_apps WHERE study_id = ? AND is_test = 1)`).run(currentStudy.id, currentStudy.id);
    db.prepare(`DELETE FROM vg_async_synthesis_likes WHERE study_id = ? AND synthesis_id IN
      (SELECT s.id FROM vg_async_syntheses s JOIN vg_async_apps a ON a.id = s.target_app_id
       WHERE s.study_id = ? AND a.is_test = 1)`).run(currentStudy.id, currentStudy.id);
    db.prepare(`DELETE FROM vg_async_synthesis_votes WHERE study_id = ? AND target_app_id IN
      (SELECT id FROM vg_async_apps WHERE study_id = ? AND is_test = 1)`).run(currentStudy.id, currentStudy.id);
    db.prepare(`DELETE FROM vg_async_basket_items WHERE study_id = ? AND participant_code IN
      (SELECT code FROM vg_async_participants WHERE study_id = ? AND is_test = 1)`).run(currentStudy.id, currentStudy.id);
    db.prepare(`DELETE FROM vg_async_synthesis_sources WHERE study_id = ? AND synthesis_id IN
      (SELECT s.id FROM vg_async_syntheses s JOIN vg_async_apps a ON a.id = s.target_app_id
       WHERE s.study_id = ? AND a.is_test = 1)`).run(currentStudy.id, currentStudy.id);
    for (const table of ['vg_async_stage_selections', 'vg_async_generation_jobs', 'vg_async_notifications',
      'vg_async_assignments', 'vg_async_wildcards', 'vg_async_contributors'] as const) {
      db.prepare(`DELETE FROM ${table} WHERE study_id = ? AND app_id IN
        (SELECT id FROM vg_async_apps WHERE study_id = ? AND is_test = 1)`)
        .run(currentStudy.id, currentStudy.id);
    }
    db.prepare(`
      DELETE FROM vg_async_creator_operations WHERE study_id = ? AND creator_code IN
        (SELECT code FROM vg_async_participants WHERE study_id = ? AND is_test = 1)
    `).run(currentStudy.id, currentStudy.id);
    for (const table of ['vg_async_creator_revisions', 'vg_async_development_messages',
      'vg_async_drafts', 'vg_async_versions', 'vg_async_comments', 'vg_async_syntheses'] as const) {
      const appColumn = table === 'vg_async_syntheses' ? 'target_app_id' : 'app_id';
      db.prepare(`DELETE FROM ${table} WHERE study_id = ? AND ${appColumn} IN
        (SELECT id FROM vg_async_apps WHERE study_id = ? AND is_test = 1)`)
        .run(currentStudy.id, currentStudy.id);
    }
    db.prepare(`DELETE FROM vg_async_apps WHERE study_id = ? AND is_test = 1`).run(currentStudy.id);
    updateWorkspaceState(currentStudy.id, 1, {
      status: 'setup',
      workflowStage: 'synthesis_1',
      startedAt: null,
      closedAt: null,
    });
  });
  transaction();
  recordEvent(viewer.code, 'clear_test_creator_data', 'study', currentStudy.id, preview);
  return getCommunityGalleryState(clientId);
}

export function deleteOwnInitialApp(clientId: string, appId: string) {
  const { viewer, app } = ownedApp(clientId, appId);
  const currentStudy = study();
  const isUnpublishedDraft = !app.initial_version_id && app.status === 'draft';
  const isPublishedApp = Boolean(app.initial_version_id) && app.status === 'published';
  if (!isUnpublishedDraft && !isPublishedApp) throw new Error('当前项目状态不允许删除。');

  const transaction = db.transaction(() => {
    const feedbackCounts = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM vg_async_comments
          WHERE study_id = ? AND app_id = ? AND parent_comment_id IS NULL) AS comment_count,
        (SELECT COUNT(*) FROM vg_async_comments
          WHERE study_id = ? AND app_id = ? AND parent_comment_id IS NOT NULL) AS reply_count,
        (SELECT COUNT(*) FROM vg_async_syntheses
          WHERE study_id = ? AND target_app_id = ?
            AND COALESCE(is_development_brief, 0) = 0) AS synthesis_count
    `).get(
      currentStudy.id, app.id,
      currentStudy.id, app.id,
      currentStudy.id, app.id,
    ) as { comment_count: number; reply_count: number; synthesis_count: number };
    if (
      Number(feedbackCounts.comment_count) > 0
      || Number(feedbackCounts.reply_count) > 0
      || Number(feedbackCounts.synthesis_count) > 0
    ) {
      throw new Error('作品已有评论，不能删除');
    }

    const runningTaskCount = Number((db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM vg_async_creator_operations
          WHERE study_id = ? AND app_id = ? AND status = 'running') +
        (SELECT COUNT(*) FROM vg_async_generation_jobs
          WHERE study_id = ? AND app_id = ?
            AND status IN ('running', 'waiting_codex', 'codex_processing')) AS count
    `).get(
      currentStudy.id, app.id,
      currentStudy.id, app.id,
    ) as { count?: number } | undefined)?.count || 0);
    if (runningTaskCount > 0) throw new Error('该应用仍有开发任务正在运行，暂时不能删除。');

    db.prepare(`
      DELETE FROM vg_async_events
      WHERE study_id = ? AND (
        (entity_type = 'app' AND entity_id = ?)
        OR (entity_type = 'comment' AND entity_id IN (
          SELECT CAST(id AS TEXT) FROM vg_async_comments WHERE study_id = ? AND app_id = ?
        ))
        OR (entity_type = 'synthesis' AND entity_id IN (
          SELECT CAST(id AS TEXT) FROM vg_async_syntheses WHERE study_id = ? AND target_app_id = ?
        ))
        OR (entity_type = 'generation_job' AND entity_id IN (
          SELECT CAST(id AS TEXT) FROM vg_async_generation_jobs WHERE study_id = ? AND app_id = ?
        ))
        OR (entity_type = 'creator_operation' AND entity_id IN (
          SELECT id FROM vg_async_creator_operations WHERE study_id = ? AND app_id = ?
        ))
      )
    `).run(
      currentStudy.id, app.id,
      currentStudy.id, app.id,
      currentStudy.id, app.id,
      currentStudy.id, app.id,
      currentStudy.id, app.id,
    );
    db.prepare(`DELETE FROM vg_async_creator_progress WHERE study_id = ? AND operation_id IN
      (SELECT id FROM vg_async_creator_operations WHERE study_id = ? AND app_id = ?)`)
      .run(currentStudy.id, currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_generation_events WHERE study_id = ? AND job_id IN
      (SELECT id FROM vg_async_generation_jobs WHERE study_id = ? AND app_id = ?)`)
      .run(currentStudy.id, currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_comment_likes WHERE study_id = ? AND comment_id IN
      (SELECT id FROM vg_async_comments WHERE study_id = ? AND app_id = ?)`)
      .run(currentStudy.id, currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_synthesis_likes WHERE study_id = ? AND synthesis_id IN
      (SELECT id FROM vg_async_syntheses WHERE study_id = ? AND target_app_id = ?)`)
      .run(currentStudy.id, currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_basket_items WHERE study_id = ? AND (
      (source_type = 'comment' AND source_id IN (SELECT id FROM vg_async_comments WHERE study_id = ? AND app_id = ?))
      OR (source_type = 'synthesis' AND source_id IN (SELECT id FROM vg_async_syntheses WHERE study_id = ? AND target_app_id = ?))
    )`).run(currentStudy.id, currentStudy.id, app.id, currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_synthesis_sources WHERE study_id = ? AND synthesis_id IN
      (SELECT id FROM vg_async_syntheses WHERE study_id = ? AND target_app_id = ?)`)
      .run(currentStudy.id, currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_synthesis_votes WHERE study_id = ? AND target_app_id = ?`)
      .run(currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_app_likes WHERE study_id = ? AND app_id = ?`)
      .run(currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_version_likes WHERE study_id = ? AND app_id = ?`)
      .run(currentStudy.id, app.id);
    for (const table of ['vg_async_stage_selections', 'vg_async_generation_jobs',
      'vg_async_notifications', 'vg_async_assignments', 'vg_async_wildcards',
      'vg_async_contributors', 'vg_async_creator_revisions',
      'vg_async_development_messages', 'vg_async_drafts', 'vg_async_versions',
      'vg_async_comments'] as const) {
      db.prepare(`DELETE FROM ${table} WHERE study_id = ? AND app_id = ?`)
        .run(currentStudy.id, app.id);
    }
    db.prepare(`DELETE FROM vg_async_syntheses WHERE study_id = ? AND target_app_id = ?`)
      .run(currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_creator_operations WHERE study_id = ? AND app_id = ?`)
      .run(currentStudy.id, app.id);
    db.prepare(`DELETE FROM vg_async_apps WHERE study_id = ? AND id = ?`)
      .run(currentStudy.id, app.id);
  });
  transaction();
  recordEvent(
    viewer.code,
    isUnpublishedDraft ? 'delete_own_initial_draft' : 'delete_own_initial_app',
    'participant',
    viewer.code,
    {
      deletedAppId: app.id,
      deletedAppTitle: app.title,
      deletedDraftOnly: isUnpublishedDraft,
    },
  );
  return getCommunityGalleryState(clientId);
}

export function startAsyncCommunityStudy(clientId: string, isTest: boolean) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = study();
  const workspace = workspaceState(currentStudy.id, isTest);
  if (workspace.status !== 'setup') throw new Error(`${isTest ? '测试' : '正式'}流程已经开始或结束。`);
  if (!testRolesConfigured(currentStudy.id)) {
    throw new Error('请先由主持人选择并保存测试角色。');
  }
  const creatorCount = db.prepare(`
    SELECT COUNT(*) AS count FROM vg_async_participants
    WHERE study_id = ? AND role = 'creator'
  `).get(currentStudy.id) as { count: number };
  if (Number(creatorCount.count) !== CREATOR_COUNT) {
    throw new Error('创作者账号数量不完整，请新建研究后重试。');
  }
  const published = db.prepare(`
    SELECT COUNT(*) AS count
    FROM vg_async_apps
    WHERE study_id = ? AND is_test = ? AND status = 'published'
  `).get(currentStudy.id, Number(isTest)) as { count: number };
  if (Number(published.count) < 1) throw new Error(`至少发布一个${isTest ? '测试' : '正式'}角色的初始应用后才能开始。`);
  ensureAssignments();
  const timestamp = now();
  updateWorkspaceState(currentStudy.id, isTest, {
    status: 'active',
    workflowStage: 'synthesis_1',
    startedAt: timestamp,
    closedAt: null,
  });
  recordEvent(viewer.code, 'start_async_workspace', 'study', currentStudy.id, {
    workspace: isTest ? 'test' : 'regular',
  });
  return getCommunityGalleryState(clientId);
}

export function closeAsyncCommunityStudy(clientId: string, isTest: boolean) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = study();
  const workspace = workspaceState(currentStudy.id, isTest);
  if (workspace.status === 'closed') throw new Error(`${isTest ? '测试' : '正式'}流程已经结束。`);
  const timestamp = now();
  updateWorkspaceState(currentStudy.id, isTest, { status: 'closed', closedAt: timestamp });
  recordEvent(viewer.code, 'close_async_workspace', 'study', currentStudy.id, {
    workspace: isTest ? 'test' : 'regular',
  });
  return getCommunityGalleryState(clientId);
}

function deleteRowsByValues(
  table: string,
  column: string,
  values: Array<string | number>,
) {
  if (!values.length) return;
  const placeholders = values.map(() => '?').join(',');
  db.prepare(`DELETE FROM ${table} WHERE study_id = ? AND ${column} IN (${placeholders})`)
    .run(study().id, ...values);
}

export function exportCommunityWorkspace(clientId: string, isTest: boolean) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = study();
  const workspace = workspaceState(currentStudy.id, isTest);
  if (workspace.status !== 'closed') {
    throw new Error(`请先结束${isTest ? '测试' : '正式'}流程，再新建研究。`);
  }
  recordEvent(viewer.code, 'export_workspace_archive', 'study', currentStudy.id, {
    workspace: isTest ? 'test' : 'regular',
  });
  return {
    exported_at: now(),
    scope: isTest ? 'test' : 'regular',
    study: currentStudy,
    workspace,
    ...collectCommunityWorkspaceData(currentStudy.id, isTest),
  };
}

export function startNewAsyncCommunityWorkspace(clientId: string, isTest: boolean) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = study();
  const workspace = workspaceState(currentStudy.id, isTest);
  if (workspace.status !== 'closed') {
    throw new Error(`请先结束${isTest ? '测试' : '正式'}流程。`);
  }
  const data = collectCommunityWorkspaceData(currentStudy.id, isTest);
  const runningJobs = data.generation_jobs.filter((row) => (
    ['running', 'waiting_codex', 'codex_processing'].includes(row.status)
  ));
  const runningOperations = data.creator_operations.filter((row) => row.status === 'running');
  if (runningJobs.length || runningOperations.length) {
    throw new Error(`${isTest ? '测试' : '正式'}流程仍有 AI 开发任务运行，暂时不能新建研究。`);
  }
  const participantCodes = data.participants
    .filter((row) => row.role === 'creator')
    .map((row) => row.code);
  const appIds = data.apps.map((row) => row.id);
  const commentIds = data.comments.map((row) => Number(row.id));
  const synthesisIds = data.syntheses.map((row) => Number(row.id));
  const operationIds = data.creator_operations.map((row) => row.id);
  const jobIds = data.generation_jobs.map((row) => Number(row.id));
  const eventIds = data.events.map((row) => Number(row.id));
  const timestamp = now();
  const transaction = db.transaction(() => {
    deleteRowsByValues('vg_async_events', 'id', eventIds);
    deleteRowsByValues('vg_async_sessions', 'participant_code', participantCodes);
    deleteRowsByValues('vg_async_creator_progress', 'operation_id', operationIds);
    deleteRowsByValues('vg_async_generation_events', 'job_id', jobIds);
    deleteRowsByValues('vg_async_comment_likes', 'comment_id', commentIds);
    deleteRowsByValues('vg_async_app_likes', 'app_id', appIds);
    deleteRowsByValues('vg_async_version_likes', 'app_id', appIds);
    deleteRowsByValues('vg_async_synthesis_likes', 'synthesis_id', synthesisIds);
    deleteRowsByValues('vg_async_synthesis_votes', 'target_app_id', appIds);
    deleteRowsByValues('vg_async_basket_items', 'participant_code', participantCodes);
    deleteRowsByValues('vg_async_synthesis_sources', 'synthesis_id', synthesisIds);
    for (const table of ['vg_async_stage_selections', 'vg_async_generation_jobs',
      'vg_async_notifications', 'vg_async_assignments', 'vg_async_wildcards',
      'vg_async_contributors', 'vg_async_creator_revisions',
      'vg_async_development_messages', 'vg_async_drafts', 'vg_async_versions',
      'vg_async_comments'] as const) {
      deleteRowsByValues(table, 'app_id', appIds);
    }
    deleteRowsByValues('vg_async_creator_operations', 'id', operationIds);
    deleteRowsByValues('vg_async_syntheses', 'target_app_id', appIds);
    deleteRowsByValues('vg_async_apps', 'id', appIds);
    updateWorkspaceState(currentStudy.id, isTest, {
      status: 'setup',
      workflowStage: 'synthesis_1',
      startedAt: null,
      closedAt: null,
    });
  });
  transaction();
  recordEvent(viewer.code, 'create_new_workspace_research', 'study', currentStudy.id, {
    workspace: isTest ? 'test' : 'regular',
    archivedAt: timestamp,
    creatorCount: participantCodes.length,
    appCount: appIds.length,
    versionCount: data.versions.length,
  });
  return getCommunityGalleryState(clientId);
}

export function startNewAsyncCommunityStudy(clientId: string) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = study();
  const regularWorkspace = workspaceState(currentStudy.id, 0);
  const testWorkspace = workspaceState(currentStudy.id, 1);
  if (regularWorkspace.status !== 'closed' || testWorkspace.status !== 'closed') {
    throw new Error('请先分别结束测试流程和正式流程。');
  }
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
  const data = collectCommunityStudyData(currentStudy.id, true);
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
    if (viewer.role !== 'creator' || viewer.code !== app.creator_code) throw new Error('只有创作者可以预览自己的草稿。');
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

export function getPublishedCommunityVersionDownload(
  clientId: string,
  appId: string,
  versionId: number,
) {
  const viewer = requireViewer(clientId, 'host');
  const currentStudy = study();
  const version = db.prepare(`
    SELECT v.*, a.title AS app_title, a.creator_code
    FROM vg_async_versions v
    JOIN vg_async_apps a ON a.id = v.app_id AND a.study_id = v.study_id
    WHERE v.study_id = ? AND v.app_id = ? AND v.id = ?
      AND a.status = 'published'
  `).get(currentStudy.id, appId, versionId) as any;
  if (!version?.code) throw new Error('该已发布版本不存在或代码为空。');
  recordEvent(viewer.code, 'download_published_app_code', 'version', String(version.id), {
    appId: version.app_id,
    creatorCode: version.creator_code,
    versionNumber: Number(version.version_number),
  });
  return version;
}

export function getCommunityGalleryState(clientId = '') {
  const currentStudy = study();
  const regularWorkspace = workspaceState(currentStudy.id, 0);
  const testWorkspace = workspaceState(currentStudy.id, 1);
  if (regularWorkspace.status === 'active' || testWorkspace.status === 'active') ensureAssignments();
  const viewer = getCommunityViewer(clientId);
  const hostStatus: CommunityStatus = regularWorkspace.status === 'active' || testWorkspace.status === 'active'
    ? 'active'
    : regularWorkspace.status === 'setup' || testWorkspace.status === 'setup'
      ? 'setup'
      : 'closed';
  const viewerWorkspace = viewer?.role === 'creator'
    ? (Number(viewer.isTest) ? testWorkspace : regularWorkspace)
    : { ...regularWorkspace, status: hostStatus };
  const apps = viewer
    ? db.prepare(`
        SELECT a.*,
          (SELECT COUNT(*) FROM vg_async_version_likes l
            WHERE l.study_id = a.study_id
              AND l.version_id = COALESCE(a.community_version_id, a.initial_version_id)) AS like_count,
          (SELECT COUNT(*) FROM vg_async_comments c
            WHERE c.study_id = a.study_id AND c.app_id = a.id AND c.target_type = 'app' AND c.deleted_at IS NULL) AS comment_count,
          (SELECT COUNT(*) FROM vg_async_syntheses s
            WHERE s.study_id = a.study_id AND s.target_app_id = a.id
              AND s.withdrawn_at IS NULL AND s.deleted_at IS NULL) AS synthesis_count,
          (SELECT COUNT(*) FROM vg_async_comments c
            WHERE c.study_id = a.study_id AND c.app_id = a.id
              AND c.parent_comment_id IS NULL) AS feedback_comment_count,
          (SELECT COUNT(*) FROM vg_async_comments c
            WHERE c.study_id = a.study_id AND c.app_id = a.id
              AND c.parent_comment_id IS NOT NULL) AS feedback_reply_count,
          (SELECT COUNT(*) FROM vg_async_syntheses s
            WHERE s.study_id = a.study_id AND s.target_app_id = a.id
              AND COALESCE(s.is_development_brief, 0) = 0) AS feedback_synthesis_count,
          (SELECT COUNT(*) FROM vg_async_comments c
            WHERE c.study_id = a.study_id AND c.app_id = a.id
              AND c.target_type = 'app' AND c.deleted_at IS NULL
              AND c.version_id = CASE
                WHEN a.flow_stage IN ('round_1', 'development_1') THEN a.initial_version_id
                WHEN a.flow_stage IN ('round_2', 'development_2') THEN a.community_version_id
                ELSE -1 END) AS current_round_comment_count,
          (SELECT COUNT(*) FROM vg_async_syntheses s
            WHERE s.study_id = a.study_id AND s.target_app_id = a.id
              AND s.withdrawn_at IS NULL AND s.deleted_at IS NULL
              AND COALESCE(s.is_development_brief, 0) = 0
              AND s.layer = CASE
                WHEN a.flow_stage IN ('round_1', 'development_1') THEN 1
                WHEN a.flow_stage IN ('round_2', 'development_2') THEN 2
                ELSE 0 END) AS current_round_synthesis_count,
          (SELECT COUNT(*) FROM vg_async_versions v
            WHERE v.study_id = a.study_id AND v.app_id = a.id AND v.kind = 'community') AS community_version_count,
          EXISTS(SELECT 1 FROM vg_async_version_likes l
            WHERE l.study_id = a.study_id
              AND l.version_id = COALESCE(a.community_version_id, a.initial_version_id)
              AND l.participant_code = ?) AS viewer_liked,
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
          AND (? = 'host' OR a.is_test = ?)
          AND (a.status = 'published' OR a.creator_code = ? OR ? = 'host')
        ORDER BY a.is_test, a.published_at, a.creator_code
      `).all(
        viewer.code,
        currentStudy.id,
        viewer.role,
        Number(viewer.isTest),
        viewer.code,
        viewer.role,
      ) as any[]
    : [];

  const appIds = apps.map((app) => app.id);
  const placeholders = appIds.map(() => '?').join(',');
  const versions = appIds.length
    ? db.prepare(`
        SELECT v.id, v.app_id, v.version_number, v.kind, v.title, v.summary, v.prompt, v.synthesis_id,
          selected_source_type, selected_source_id, base_version_id,
          selection_reason, v.created_at,
          (SELECT COUNT(*) FROM vg_async_version_likes l
            WHERE l.study_id = v.study_id AND l.version_id = v.id) AS like_count,
          EXISTS(SELECT 1 FROM vg_async_version_likes l
            WHERE l.study_id = v.study_id AND l.version_id = v.id
              AND l.participant_code = ?) AS viewer_liked
        FROM vg_async_versions v
        WHERE v.study_id = ? AND v.app_id IN (${placeholders})
        ORDER BY v.app_id, v.version_number
      `).all(viewer?.code || '', currentStudy.id, ...appIds) as any[]
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
  // Stage selections are retained in the database only as legacy-study audit data.
  // New studies never expose or use a Host-selected source.
  const stageSelections: any[] = [];
  // Wildcard choices are part of the public creative provenance: everyone who
  // can view the study should see which idea the app creator guaranteed.
  const wildcards = viewer && appIds.length
    ? db.prepare(`
        SELECT * FROM vg_async_wildcards
        WHERE study_id = ? AND app_id IN (${placeholders})
        ORDER BY created_at
      `).all(currentStudy.id, ...appIds) as any[]
    : [];
  const contributors = appIds.length
    ? db.prepare(`
        SELECT study_id, app_id, iteration_number, participant_code,
          first_selected_iteration, selected_in_current_iteration, recorded_at
        FROM vg_async_contributors
        WHERE study_id = ? AND app_id IN (${placeholders})
        ORDER BY app_id, iteration_number, participant_code
      `).all(currentStudy.id, ...appIds) as any[]
    : [];
  const selectedIterationBySource = new Map<string, number>();
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
      viewer_vote_available: !deleted && !synthesis.is_development_brief && viewer
        && viewer.role !== 'host'
        && viewerWorkspace.status !== 'closed'
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
        .filter((item) => item.content && appIds.includes(item.app_id))
    : [];

  const assignments = viewer
    ? db.prepare(`
        SELECT a.*, app.title AS app_title
        FROM vg_async_assignments a
        JOIN vg_async_apps app ON app.id = a.app_id
        WHERE a.study_id = ? AND (? = 'host' OR a.participant_code = ?)
          AND (? = 'host' OR app.is_test = ?)
        ORDER BY a.participant_code, a.position
      `).all(currentStudy.id, viewer.role, viewer.code, viewer.role, Number(viewer.isTest)) as any[]
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
  type CodexTaskSummary = {
    id: string;
    iteration_number: number;
    is_test: number;
    created_at: string;
    job_count: number;
    completed_count: number;
    processing_count: number;
    waiting_count: number;
    failed_count: number;
  };
  const codexTasks = viewer?.role === 'host'
    ? Array.from(generationJobs.reduce<Map<string, CodexTaskSummary>>((tasks, job) => {
        if (job.execution_provider !== 'codex' || !job.codex_task_id) return tasks;
        const existing = tasks.get(job.codex_task_id) || {
          id: job.codex_task_id,
          iteration_number: Number(job.iteration_number),
          is_test: Number(apps.find((app) => app.id === job.app_id)?.is_test || 0),
          created_at: job.created_at,
          job_count: 0,
          completed_count: 0,
          processing_count: 0,
          waiting_count: 0,
          failed_count: 0,
        };
        existing.job_count += 1;
        if (job.status === 'completed') existing.completed_count += 1;
        else if (job.status === 'codex_processing') existing.processing_count += 1;
        else if (job.status === 'waiting_codex') existing.waiting_count += 1;
        else if (job.status === 'failed' || job.status === 'cancelled') existing.failed_count += 1;
        tasks.set(job.codex_task_id, existing);
        return tasks;
      }, new Map<string, CodexTaskSummary>()).values()).map((task) => ({
        ...task,
        status: task.completed_count === task.job_count
          ? 'completed'
          : task.completed_count + task.failed_count === task.job_count
            ? 'partial'
            : task.processing_count > 0
              ? 'processing'
              : 'waiting',
      }))
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

  const latestCreatorOperation = viewer?.role === 'creator'
    ? db.prepare(`
        SELECT * FROM vg_async_creator_operations
        WHERE study_id = ? AND creator_code = ?
        ORDER BY started_at DESC LIMIT 1
      `).get(currentStudy.id, viewer.code) as any
    : null;
  const creatorDevelopment = latestCreatorOperation
    && latestCreatorOperation.status !== 'completed'
    ? {
        ...latestCreatorOperation,
        events: db.prepare(`
          SELECT step_key, sort_order, status, title, detail, updated_at
          FROM vg_async_creator_progress
          WHERE study_id = ? AND operation_id = ?
          ORDER BY sort_order, id
        `).all(currentStudy.id, latestCreatorOperation.id),
      }
    : null;

  const notifications = viewer && viewer.role !== 'host'
    ? db.prepare(`
        SELECT n.*, a.title AS app_title
        FROM vg_async_notifications n
        JOIN vg_async_apps a ON a.id = n.app_id
        WHERE n.study_id = ? AND n.participant_code = ?
          AND a.is_test = ?
        ORDER BY n.created_at DESC, n.id DESC
      `).all(currentStudy.id, viewer.code, Number(viewer.isTest)) as any[]
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
    : !viewer
      ? db.prepare(`
          SELECT code, role, is_test, 0 AS joined
          FROM vg_async_participants
          WHERE study_id = ?
          ORDER BY code
        `).all(currentStudy.id)
    : [];

  const publishedCounts = db.prepare(`
    SELECT is_test, COUNT(*) AS count
    FROM vg_async_apps
    WHERE study_id = ? AND status = 'published'
    GROUP BY is_test
  `).all(currentStudy.id) as any[];

  return {
    study: {
      ...currentStudy,
      ...viewerWorkspace,
      home_feed_order: homeFeedOrderForParticipant(currentStudy.id, viewer?.code),
      home_feed_shuffle_seed: homeFeedShuffleSeed(currentStudy.id),
      test_roles_configured: regularWorkspace.status !== 'setup' || testWorkspace.status !== 'setup'
        || testRolesConfigured(currentStudy.id),
    },
    workspaces: {
      regular: regularWorkspace,
      test: testWorkspace,
    },
    viewer,
    apps,
    versions,
    comments: enrichedComments,
    syntheses: enrichedSyntheses,
    synthesisSources,
    stageSelections,
    wildcards,
    contributors,
    basket,
    assignments,
    generationJobs,
    codexTasks,
    generationEvents,
    creatorDevelopment,
    notifications,
    developmentMessages,
    participants: participantRows,
    aiProvider: 'deepseek-pro',
    communityDevelopmentProvider: 'codex',
    counts: {
      creators: CREATOR_COUNT,
      regularApps: Number(publishedCounts.find((row) => Number(row.is_test) === 0)?.count || 0),
      testApps: Number(publishedCounts.find((row) => Number(row.is_test) === 1)?.count || 0),
    },
    testData: communityTestDataPreview(currentStudy.id),
    serverNow: now(),
  };
}
