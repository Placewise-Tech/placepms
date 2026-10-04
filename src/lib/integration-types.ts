export type IntegrationProvider = 'github' | 'figma' | 'miro';
export interface Connection {
  provider: IntegrationProvider;
  mode: 'oauth' | 'token';
  account: string;
  updated_at: string;
  expires_at: string | null;
}
export interface IntegrationStatus {
  connections: Connection[];
  oauth: Record<IntegrationProvider, boolean>;
}
export interface InsightItem {
  id: string;
  title: string;
  description?: string;
  url?: string;
  date?: string;
  value?: number;
  path?: string;
  kind?: string;
}
export interface Inspection {
  provider: IntegrationProvider;
  title: string;
  description: string;
  url: string;
  metrics: { label: string; value: string | number }[];
  sections: { title: string; items: InsightItem[] }[];
  warnings: string[];
  sampleNotice?: string;
  repository?: string;
  branches?: string[];
  branch?: string;
  nextPage?: number;
  nextCursor?: string;
  github?: GitHubAnalysis;
}
export interface GitHubIdentity {
  key: string;
  name: string;
  login: string;
  email: string;
  url: string;
}
export interface GitHubCommitStats {
  additions: number;
  deletions: number;
  files: { name: string; status: string; additions: number; deletions: number }[];
  filesTruncated: boolean;
}
export interface GitHubCommit {
  sha: string;
  message: string;
  url: string;
  author: GitHubIdentity;
  committer: GitHubIdentity;
  authoredAt: string;
  committedAt: string;
  parents: string[];
  verified: boolean;
  verificationReason: string;
  stats?: GitHubCommitStats;
}
export interface GitHubWorkItem {
  number: number;
  title: string;
  url: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  labels: string[];
  draft: boolean;
}
export interface GitHubAnalysis {
  repository: {
    name: string; defaultBranch: string; visibility: string; archived: boolean;
    createdAt: string; pushedAt: string; sizeKb: number; license: string; topics: string[];
    stars: number; forks: number; openIssuesAndPulls: number;
  };
  branch: string;
  window: { days: 7 | 30 | 90 | 365 | 'all'; since: string | null; until: string };
  pages: number[];
  commitsAvailable: boolean;
  historyTruncated?: boolean;
  nextPage?: number;
  commits: GitHubCommit[];
  languages: { name: string; bytes: number }[];
  branches: { name: string; sha: string; protected: boolean }[];
  contributors: { login: string; commits: number; url: string }[];
  pulls: GitHubWorkItem[];
  issues: GitHubWorkItem[];
}
export interface GitHubStatsPage {
  commits: { sha: string; stats: GitHubCommitStats }[];
  errors: { sha: string; message: string }[];
}
export interface ResourcePage { items: InsightItem[]; nextPage?: number; nextCursor?: string }
export interface RepositoryFiles {
  path: string;
  items?: InsightItem[];
  text?: string;
  binary?: boolean;
  size?: number;
  url?: string;
}
export interface CommitDetail {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
  additions: number;
  deletions: number;
  files: { name: string; status: string; additions: number; deletions: number; patch: string }[];
  truncated: boolean;
  authorIdentity?: GitHubIdentity;
  committerIdentity?: GitHubIdentity;
  committedAt?: string;
  parents?: string[];
  verified?: boolean;
  verificationReason?: string;
}
export interface LoginSession {
  id: string;
  created_at: string;
  last_active_at: string;
  user_agent: string | null;
  ip: string | null;
  current_session: boolean;
}
