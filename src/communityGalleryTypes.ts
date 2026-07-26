export type CommunityRole = 'host' | 'creator' | 'community';
export type CommunityCondition = 'control' | 'experimental';
export type CommunityStatus = 'setup' | 'active' | 'closed';
export type CommunitySourceType = 'comment' | 'synthesis';
export type CommunityWorkflowStage = 'synthesis_1' | 'development_1' | 'development_2';

export type CommunityViewer = {
  clientId: string;
  code: string;
  role: CommunityRole;
  condition?: CommunityCondition;
};

export type CommunityApp = {
  id: string;
  creator_code: string;
  condition_name: CommunityCondition;
  title: string;
  brief: string;
  creator_prompt: string;
  status: 'draft' | 'published';
  initial_version_id?: number;
  community_version_id?: number;
  selected_synthesis_id?: number;
  published_at?: string;
  community_published_at?: string;
  community_version_count: number;
  like_count: number;
  comment_count: number;
  synthesis_count: number;
  viewer_liked: number;
  draft_kind?: 'initial' | 'community';
  draft_code?: string;
  draft_summary?: string;
  draft_prompt?: string;
  draft_synthesis_id?: number;
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
  base_version_id?: number;
  selection_reason?: string;
  created_at: string;
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
  like_count: number;
  viewer_liked: number;
  viewer_in_basket: number;
};

export type CommunitySynthesis = {
  id: number;
  target_app_id: string;
  layer: 1 | 2;
  author_code: string;
  title: string;
  content: string;
  created_at: string;
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

export type CommunityGalleryState = {
  study: {
    id: string;
    status: CommunityStatus;
    workflow_stage: CommunityWorkflowStage;
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
  notifications: CommunityNotification[];
  developmentMessages: Array<{
    id: number;
    app_id: string;
    phase: 'initial' | 'community';
    role: 'creator' | 'assistant' | 'system';
    content: string;
    created_at: string;
  }>;
  participants: Array<{
    code: string;
    role: CommunityRole;
    condition_name?: CommunityCondition;
    joined: number;
  }>;
  aiProvider: 'deepseek' | 'deepseek-pro' | 'gemini' | 'glm' | 'gpt5';
  counts: {
    creators: number;
    communityMembers: number;
    controlApps: number;
    experimentalApps: number;
  };
  serverNow: string;
};
