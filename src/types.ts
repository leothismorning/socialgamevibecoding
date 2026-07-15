
export type Role = 'user' | 'model';

export interface Message {
  role: Role;
  content: string;
  createdAt: string;
  codeSnapshot?: string;
  authorName?: string;
  authorAvatar?: string;
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  bio?: string;
}

export interface Comment {
  id: string;
  userId: string;
  postId: string | null;      // The resulting post ID if developed
  parentId: string;           // The ID of the post OR the comment being replied to
  rootPostId: string;         // The ID of the primary post in the thread
  content: string;
  createdAt: string;
  updatedAt?: string;
  // UI helpers (populated by frontend)
  authorName?: string;
  authorAvatar?: string;
  parentAuthorName?: string; // The username of the author who is being replied to
  postStatus?: 'published' | 'coding'; // Status of the associated post
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  title: string;
  description: string;
  code: string;
  prompt: string | string[]; // The original prompt(s) used to create this
  tags: string[];
  likes: number;
  comments: Comment[];
  createdAt: string;
  status: 'published' | 'help_requested' | 'coding';
  parentId?: string | number;      // For fork lineage tracking
}

export type ViewType = 'feed' | 'detail' | 'workstation' | 'workspace';

export interface SystemLog {
  id: string;
  type: 'db' | 'ai';
  timestamp: number;
  // DB specific
  sql?: string;
  params?: any[];
  // AI specific
  prompt?: string;
  model?: string;
  apiKey?: string;
  // Common
  duration: string;
  result: any;
  error?: string;
  status: 'pending' | 'success' | 'error';
}

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

export type StudyAIProvider = 'deepseek' | 'gemini';

export interface StudyExperiment {
  id: string;
  title: string;
  brief: string;
  creator_name: string;
  creator_coins: number;
  phase: StudyPhase;
  current_round: number;
  max_rounds: number;
  selected_comment_id?: number | null;
  current_version_id?: number | null;
  end_vote_started_at?: string | null;
  ended_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyParticipant {
  code: string;
  name: string;
  role: 'participant';
  coins: number;
  joined_at?: string | null;
  last_seen_at?: string | null;
}

export interface StudyExperimentHistoryItem extends StudyExperiment {
  is_active: boolean;
  version_count: number;
  comment_count: number;
  participant_count: number;
}

export interface StudyVersion {
  id: number;
  experiment_id: string;
  round_number: number;
  title: string;
  code: string;
  prompt: string;
  source_comment_id?: number | null;
  created_at: string;
}

export interface StudyComment {
  id: number;
  experiment_id: string;
  round_number: number;
  participant_code: string;
  participant_name?: string;
  content: string;
  selected: 0 | 1;
  invested: number;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  is_own?: boolean;
  display_order?: number;
}

export interface StudyIdeaRevision {
  id: number;
  experiment_id: string;
  round_number: number;
  comment_id: number;
  participant_code: string;
  content: string;
  action: 'create' | 'update' | 'restore' | 'delete';
  created_at: string;
}

export interface StudyLeaderboardEntry {
  rank: number;
  participant_code: string;
  participant_name: string;
  coins: number;
  top_three_count: number;
  first_place_count: number;
  second_place_count: number;
  third_place_count: number;
  creative_points: number;
  ideas_submitted: number;
  received_investment: number;
  unique_idea_investors: number;
  author_earnings: number;
  investment_principal: number;
  investment_returns: number;
  investment_net: number;
  investment_roi: number;
  top_three_hits: number;
  first_place_hits: number;
}

export interface StudyInvestment {
  id: number;
  experiment_id: string;
  round_number: number;
  participant_code: string;
  comment_id: number;
  amount: number;
  actor_type?: 'participant' | 'creator';
  created_at: string;
}

export interface StudySelectedIdea {
  id: number;
  experiment_id: string;
  round_number: number;
  comment_id: number;
  selection_rank: 1 | 2 | 3;
  selection_role: 'core' | 'supporting';
  reward_weight: number;
  participant_code: string;
  content: string;
  invested: number;
  investor_count: number;
  created_at: string;
}

export interface StudyFusionPlan {
  experiment_id: string;
  round_number: number;
  content: string;
  status: 'draft' | 'confirmed';
  created_at: string;
  confirmed_at?: string | null;
}

export interface StudyVersionSource {
  version_id: number;
  comment_id: number;
  selection_rank: 1 | 2 | 3;
  selection_role: 'core' | 'supporting';
  participant_code: string;
  content: string;
}

export interface StudyEndVote {
  id: number;
  experiment_id: string;
  round_number: number;
  participant_code: string;
  participant_name?: string;
  vote: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface StudyEndVoteSummary {
  eligible: number;
  yes: number;
  no: number;
  pending: number;
  requiredYes: number;
}

export interface StudyDevelopmentSession {
  experiment_id: string;
  round_number: number;
  status: 'debugging' | 'published';
  current_draft_id?: number | null;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
}

export interface StudyDevelopmentDraft {
  id: number;
  experiment_id: string;
  round_number: number;
  attempt_number: number;
  code: string;
  summary: string;
  created_at: string;
}

export interface StudyDevelopmentMessage {
  id: number;
  experiment_id: string;
  round_number: number;
  role: 'creator' | 'assistant' | 'system';
  content: string;
  draft_id?: number | null;
  created_at: string;
}

export interface StudyCoinEvent {
  id: number;
  experiment_id: string;
  round_number: number;
  participant_code?: string | null;
  actor_type: 'participant' | 'creator';
  amount: number;
  reason: string;
  ref_id?: string | null;
  created_at: string;
}

export interface StudyPhaseEvent {
  id: number;
  experiment_id: string;
  round_number: number;
  from_phase?: StudyPhase | null;
  to_phase: StudyPhase;
  created_at: string;
}

export interface StudyState {
  experiment: StudyExperiment | null;
  participants: StudyParticipant[];
  rounds: any[];
  versions: StudyVersion[];
  comments: StudyComment[];
  investments: StudyInvestment[];
  coinEvents: StudyCoinEvent[];
  phaseEvents: StudyPhaseEvent[];
  selectedComment: StudyComment | null;
  selectedIdeas: StudySelectedIdea[];
  fusionPlan: StudyFusionPlan | null;
  fusionPlans: StudyFusionPlan[];
  versionSources: StudyVersionSource[];
  endVotes: StudyEndVote[];
  endVoteSummary: StudyEndVoteSummary;
  developmentSessions: StudyDevelopmentSession[];
  developmentDrafts: StudyDevelopmentDraft[];
  developmentMessages: StudyDevelopmentMessage[];
  currentDraft: StudyDevelopmentDraft | null;
  experimentHistory: StudyExperimentHistoryItem[];
  ideaRevisions: StudyIdeaRevision[];
  leaderboard: StudyLeaderboardEntry[];
  leaderboards: {
    creative: StudyLeaderboardEntry[];
    investor: StudyLeaderboardEntry[];
    wealth: StudyLeaderboardEntry[];
  };
  aiProvider: StudyAIProvider;
  marketPrivacyActive: boolean;
}
