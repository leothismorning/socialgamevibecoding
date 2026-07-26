export type GalleryRole = 'host' | 'creator';
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

export type GalleryAppRecord = {
  id: string;
  creator_code: string;
  title: string;
  brief: string;
  creator_prompt?: string;
  draft_code?: string;
  draft_summary?: string;
  status: 'draft' | 'published';
  initial_version_id?: number;
  current_version_id?: number;
  final_version_id?: number;
  initial_code?: string;
  initial_summary?: string;
  current_code?: string;
  current_summary?: string;
  current_version_number?: number;
  final_code?: string;
  final_summary?: string;
  showcase_like_count: number;
  final_like_count: number;
  viewer_showcase_liked: number;
  viewer_final_liked: number;
};

export type GalleryComment = {
  id: number;
  app_id: string;
  round_number: number;
  author_code: string;
  parent_comment_id?: number;
  content: string;
  like_count: number;
  viewer_liked: number;
  updated_at: string;
};

export type GalleryRound = {
  id: number;
  round_number: number;
  status: 'active' | 'processing' | 'completed';
  starts_at: string;
  ends_at: string;
  locked_at?: string;
  completed_at?: string;
};

export type GalleryLottery = {
  id: number;
  app_id: string;
  round_number: number;
  selected_comment_id?: number;
  selected_comment?: string;
  selected_author?: string;
  selected_parent_comment_id?: number;
  selected_parent_comment?: string;
  selected_parent_author?: string;
  total_weight: number;
  random_roll?: number;
  weights_json: string;
};

export type GalleryJob = {
  id: number;
  app_id: string;
  app_title: string;
  app_creator_code: string;
  round_number: number;
  selected_comment_id?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';
  attempts: number;
  error?: string;
};

export type GalleryGenerationEvent = {
  id: number;
  job_id: number;
  app_id: string;
  round_number: number;
  step_key: string;
  sort_order: number;
  status: 'pending' | 'running' | 'completed' | 'warning' | 'failed' | 'cancelled';
  title: string;
  detail: string;
  updated_at: string;
};

export type DevelopmentMessage = {
  id: number;
  role: 'creator' | 'assistant' | 'system';
  content: string;
  created_at: string;
};

export type GalleryState = {
  study: {
    id: string;
    status: GalleryStatus;
    current_round: number;
    round_duration_seconds: number;
    final_voting_started_at?: string;
    ended_at?: string;
  };
  viewer: GalleryViewer | null;
  apps: GalleryAppRecord[];
  versions: Array<{
    id: number;
    app_id: string;
    version_number: number;
    round_number: number;
    title: string;
    code: string;
    summary: string;
    source_comment_id?: number;
  }>;
  rounds: GalleryRound[];
  comments: GalleryComment[];
  lotteries: GalleryLottery[];
  generationJobs: GalleryJob[];
  generationEvents: GalleryGenerationEvent[];
  roundOpenings: Array<{
    app_id: string;
    round_number: number;
    opened_at: string;
    opened_by: string;
  }>;
  sessions: Array<{ role: GalleryRole; code: string; joined_at: string }>;
  developmentMessages: DevelopmentMessage[];
  aiProvider: 'deepseek' | 'deepseek-pro' | 'gemini' | 'glm' | 'gpt5';
  creatorCount: number;
  publishedAppCount: number;
  serverNow: string;
};
