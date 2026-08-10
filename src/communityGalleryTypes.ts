export type CommunityRole = 'host' | 'creator';
export type CommunityStatus = 'setup' | 'active' | 'closed';
export type CommunitySourceType = 'comment' | 'synthesis';
export type CommunityWorkflowStage = 'synthesis_1' | 'development_1' | 'development_2';
export type CommunityAppFlowStage =
  | 'waiting_round_1'
  | 'round_1'
  | 'development_1'
  | 'waiting_round_2'
  | 'round_2'
  | 'development_2'
  | 'completed';
export type CommunityWorkspaceState = {
  study_id: string;
  is_test: number;
  status: CommunityStatus;
  workflow_stage: CommunityWorkflowStage;
  started_at?: string;
  closed_at?: string;
  updated_at: string;
};

export type CommunityViewer = {
  clientId: string;
  code: string;
  role: CommunityRole;
  isTest: number;
};

export type CommunityApp = {
  id: string;
  creator_code: string;
  is_test: number;
  title: string;
  brief: string;
  creator_prompt: string;
  status: 'draft' | 'published';
  flow_stage: CommunityAppFlowStage;
  initial_version_id?: number;
  community_version_id?: number;
  selected_synthesis_id?: number;
  selected_source_type?: CommunitySourceType;
  selected_source_id?: number;
  published_at?: string;
  community_published_at?: string;
  community_version_count: number;
  like_count: number;
  comment_count: number;
  synthesis_count: number;
  current_round_comment_count: number;
  current_round_synthesis_count: number;
  viewer_liked: number;
  draft_kind?: 'initial' | 'community' | 'project';
  draft_code?: string;
  draft_summary?: string;
  draft_prompt?: string;
  draft_synthesis_id?: number;
  draft_selected_source_type?: CommunitySourceType;
  draft_selected_source_id?: number;
  draft_iteration_number?: number;
  draft_base_version_id?: number;
  draft_selection_reason?: string;
};

export type CommunityVersion = {
  id: number;
  app_id: string;
  version_number: number;
  kind: 'initial' | 'community';
  title: string;
  summary: string;
  prompt: string;
  synthesis_id?: number;
  selected_source_type?: CommunitySourceType;
  selected_source_id?: number;
  base_version_id?: number;
  selection_reason?: string;
  created_at: string;
  like_count: number;
  viewer_liked: number;
};

export type CommunityComment = {
  id: number;
  app_id: string;
  version_id?: number;
  target_type: 'app' | 'synthesis';
  target_id: string;
  parent_comment_id?: number;
  author_code: string;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  like_count: number;
  viewer_liked: number;
  viewer_in_basket: number;
  selected_for_iteration?: number;
};

export type CommunitySynthesis = {
  id: number;
  target_app_id: string;
  target_version_id?: number;
  layer: 1 | 2;
  author_code: string;
  title: string;
  content: string;
  is_development_brief?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  source_count: number;
  source_app_count: number;
  contributor_count: number;
  community_score: number;
  vote_count: number;
  viewer_voted: number;
  viewer_vote_available: number;
  selected_for_iteration?: number;
  viewer_in_basket: number;
};

export type CommunityStageSelection = {
  app_id: string;
  iteration_number: 1 | 2;
  synthesis_id: number;
  source_type: CommunitySourceType;
  source_id: number;
  source_title: string;
  source_content: string;
  source_author_code: string;
  score: number;
  source_popularity_json: string;
  selected_at: string;
};

export type CommunitySource = {
  synthesis_id: number;
  source_type: CommunitySourceType;
  source_id: number;
  source_order: number;
  contribution_note: string;
  app_id: string;
  app_title: string;
  author_code: string;
  title?: string;
  content: string;
  created_at: string;
  version_id?: number;
  version_kind?: 'initial' | 'community' | '';
  version_number?: number;
};

export type CreativeBasketItem = {
  participant_code: string;
  source_type: CommunitySourceType;
  source_id: number;
  added_at: string;
  app_id: string;
  app_title: string;
  author_code: string;
  title?: string;
  content: string;
  version_id?: number;
  version_kind?: 'initial' | 'community' | '';
  version_number?: number;
};

export type CommunityGenerationJob = {
  id: number;
  app_id: string;
  app_title: string;
  synthesis_id: number;
  selected_source_type: CommunitySourceType;
  selected_source_id: number;
  iteration_number: number;
  base_version_id: number;
  selection_reason?: string;
  creator_instruction: string;
  status: 'running' | 'completed' | 'failed';
  error?: string;
  created_at: string;
  completed_at?: string;
};

export type CommunityNotification = {
  id: number;
  participant_code: string;
  type: 'contribution_selected';
  app_id: string;
  app_title: string;
  version_number: number;
  synthesis_id: number;
  source_type: CommunitySourceType;
  source_id: number;
  title: string;
  content: string;
  source_count: number;
  created_at: string;
  read_at?: string;
  celebrated_at?: string;
};

export type CommunityGenerationEvent = {
  id: number;
  job_id: number;
  app_id: string;
  step_key: string;
  sort_order: number;
  status: 'pending' | 'running' | 'completed' | 'warning' | 'failed' | 'cancelled';
  title: string;
  detail: string;
  updated_at: string;
};

export type CreatorDevelopmentProgress = {
  id: string;
  study_id: string;
  client_id: string;
  creator_code: string;
  app_id?: string;
  phase: 'initial' | 'community' | 'project';
  action: 'generate' | 'refine';
  status: 'running' | 'completed' | 'failed';
  error?: string;
  started_at: string;
  completed_at?: string;
  events: Array<{
    step_key: string;
    sort_order: number;
    status: 'pending' | 'running' | 'completed' | 'warning' | 'failed' | 'cancelled';
    title: string;
    detail: string;
    updated_at: string;
  }>;
};

export type CommunityGalleryState = {
  study: {
    id: string;
    status: CommunityStatus;
    workflow_stage: CommunityWorkflowStage;
    test_roles_configured: boolean;
    created_at: string;
    started_at?: string;
    closed_at?: string;
  };
  viewer: CommunityViewer | null;
  apps: CommunityApp[];
  versions: CommunityVersion[];
  comments: CommunityComment[];
  syntheses: CommunitySynthesis[];
  synthesisSources: CommunitySource[];
  stageSelections: CommunityStageSelection[];
  wildcards: Array<{
    creator_code: string;
    app_id: string;
    iteration_number: 1 | 2;
    source_id: number;
    created_at: string;
  }>;
  contributors: Array<{
    app_id: string;
    iteration_number: 1 | 2;
    participant_code: string;
    first_selected_iteration: 1 | 2;
    selected_in_current_iteration: number;
    recorded_at: string;
  }>;
  basket: CreativeBasketItem[];
  assignments: Array<{
    participant_code: string;
    app_id: string;
    app_title: string;
    position: number;
    completed_at?: string;
  }>;
  generationJobs: CommunityGenerationJob[];
  generationEvents: CommunityGenerationEvent[];
  creatorDevelopment: CreatorDevelopmentProgress | null;
  notifications: CommunityNotification[];
  developmentMessages: Array<{
    id: number;
    app_id: string;
    phase: 'initial' | 'community' | 'project';
    iteration_number?: number | null;
    role: 'creator' | 'assistant' | 'system';
    content: string;
    created_at: string;
  }>;
  participants: Array<{
    code: string;
    role: CommunityRole;
    is_test: number;
    joined: number;
  }>;
  aiProvider: 'deepseek' | 'deepseek-pro' | 'gemini' | 'glm' | 'gpt5';
  counts: {
    creators: number;
    regularApps: number;
    testApps: number;
  };
  workspaces: {
    regular: CommunityWorkspaceState;
    test: CommunityWorkspaceState;
  };
  testData: {
    testCreatorCount: number;
    testSessionCount: number;
    testAppCount: number;
    versionCount: number;
    commentCount: number;
    synthesisCount: number;
    likeCount: number;
    basketItemCount: number;
    generationJobCount: number;
    behaviorEventCount: number;
    runningTaskCount: number;
    hasTestData: boolean;
  };
  serverNow: string;
};
