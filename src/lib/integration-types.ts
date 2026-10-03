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
}
export interface LoginSession {
  id: string;
  created_at: string;
  last_active_at: string;
  user_agent: string | null;
  ip: string | null;
  current_session: boolean;
}
