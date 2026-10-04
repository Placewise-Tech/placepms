import type { GitHubAnalysis, GitHubCommit, GitHubIdentity, GitHubStatsPage } from './integration-types';
import { csvExport } from './workspace-insights';

const dayMs = 86_400_000;
export const commitTime = (commit: GitHubCommit) => commit.committedAt || commit.authoredAt;
export function utcDay(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}
export function formatGitHubDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC') : 'Not provided';
}
export function githubCoverageComplete(analysis: GitHubAnalysis) {
  const pages = [...analysis.pages].sort((a, b) => a - b);
  return analysis.commitsAvailable && !analysis.historyTruncated && !analysis.nextPage && pages.every((page, index) => page === index + 1);
}
export function mergeGitHubAnalysis(current: GitHubAnalysis, next: GitHubAnalysis): GitHubAnalysis {
  if (current.repository.name !== next.repository.name || current.branch !== next.branch || current.window.until !== next.window.until || current.window.since !== next.window.since || current.window.days !== next.window.days) throw new Error('Repository analysis changed. Refresh the report before loading more history.');
  if (!next.commitsAvailable) throw new Error('Commit history could not be loaded. Please retry the next page.');
  const commits = new Map(current.commits.map(commit => [commit.sha, commit]));
  for (const commit of next.commits) commits.set(commit.sha, { ...commit, stats: commits.get(commit.sha)?.stats || commit.stats });
  return { ...next, commitsAvailable: current.commitsAvailable && next.commitsAvailable, pages: [...new Set([...current.pages, ...next.pages])].sort((a, b) => a - b),
    commits: [...commits.values()].sort((a, b) => commitTime(b).localeCompare(commitTime(a)) || a.sha.localeCompare(b.sha)) };
}
export function applyGitHubStats(analysis: GitHubAnalysis, result: GitHubStatsPage): GitHubAnalysis {
  const stats = new Map(result.commits.map(commit => [commit.sha, commit.stats]));
  return { ...analysis, commits: analysis.commits.map(commit => stats.has(commit.sha) ? { ...commit, stats: stats.get(commit.sha) } : commit) };
}
export interface ContributorSummary {
  identity: GitHubIdentity;
  commits: number;
  activeDays: number;
  firstCommit: string;
  lastCommit: string;
  merges: number;
  verified: number;
  measuredCommits: number;
  additions: number;
  deletions: number;
}
export function githubContributors(commits: GitHubCommit[]): ContributorSummary[] {
  const authors = new Map<string, ContributorSummary & { days: Set<string> }>();
  for (const commit of commits) {
    let author = authors.get(commit.author.key);
    if (!author) {
      author = { identity: commit.author, commits: 0, activeDays: 0, firstCommit: '', lastCommit: '', merges: 0, verified: 0, measuredCommits: 0, additions: 0, deletions: 0, days: new Set() };
      authors.set(commit.author.key, author);
    }
    author.commits++;
    const time = commitTime(commit); const day = utcDay(time);
    if (day) {
      author.days.add(day);
      const normalized = new Date(time).toISOString();
      if (!author.firstCommit || normalized < author.firstCommit) author.firstCommit = normalized;
      if (!author.lastCommit || normalized > author.lastCommit) author.lastCommit = normalized;
    }
    if (commit.parents.length > 1) author.merges++;
    if (commit.verified) author.verified++;
    if (commit.stats) { author.measuredCommits++; author.additions += commit.stats.additions; author.deletions += commit.stats.deletions; }
  }
  return [...authors.values()].map(({ days, ...author }) => ({ ...author, activeDays: days.size })).sort((a, b) => b.commits - a.commits || a.identity.name.localeCompare(b.identity.name));
}
export interface ActivityPoint { date: string; commits: number; additions: number; deletions: number; measuredCommits: number }
export function githubActivity(analysis: GitHubAnalysis, author = '') {
  const commits = analysis.commits.filter(commit => !author || commit.author.key === author);
  const dates = new Map<string, ActivityPoint>(); const hours = Array.from({ length: 24 }, () => 0); const weekdays = Array.from({ length: 7 }, () => 0);
  let missingDates = 0;
  for (const commit of commits) {
    const time = new Date(commitTime(commit)); const date = utcDay(commitTime(commit));
    if (!date) { missingDates++; continue; }
    const point = dates.get(date) || { date, commits: 0, additions: 0, deletions: 0, measuredCommits: 0 };
    point.commits++;
    if (commit.stats) { point.additions += commit.stats.additions; point.deletions += commit.stats.deletions; point.measuredCommits++; }
    dates.set(date, point); hours[time.getUTCHours()]++; weekdays[time.getUTCDay()]++;
  }
  const end = utcDay(analysis.window.until);
  const first = analysis.window.since ? utcDay(analysis.window.since) : [...dates.keys()].sort()[0] || end;
  const span = Math.max(1, Math.round((Date.parse(end) - Date.parse(first)) / dayMs) + 1);
  const interval = span <= 90 ? 'day' : span <= 730 ? 'week' : 'month';
  const bucket = (date: string) => {
    if (interval === 'day') return date;
    if (interval === 'month') return date.slice(0, 7) + '-01';
    const monday = new Date(date); monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7); return utcDay(monday.toISOString());
  };
  const buckets = new Map<string, ActivityPoint>();
  for (const point of dates.values()) {
    const key = bucket(point.date); const total = buckets.get(key) || { date: key, commits: 0, additions: 0, deletions: 0, measuredCommits: 0 };
    total.commits += point.commits; total.additions += point.additions; total.deletions += point.deletions; total.measuredCommits += point.measuredCommits; buckets.set(key, total);
  }
  const cursor = new Date(bucket(first));
  // Fill quiet periods as well. Very long imported histories retain their actual
  // buckets without generating an unbounded number of empty chart points.
  for (let count = 0; count < 1000 && utcDay(cursor.toISOString()) <= end; count++) {
    const date = utcDay(cursor.toISOString());
    if (!buckets.has(date)) buckets.set(date, { date, commits: 0, additions: 0, deletions: 0, measuredCommits: 0 });
    if (interval === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + (interval === 'week' ? 7 : 1));
  }
  const heatmapStart = new Date(end); heatmapStart.setUTCDate(heatmapStart.getUTCDate() - Math.min(span, 365) + 1);
  heatmapStart.setUTCDate(heatmapStart.getUTCDate() - heatmapStart.getUTCDay());
  const heatmap: ActivityPoint[] = [];
  for (let count = 0; count < 371 && utcDay(heatmapStart.toISOString()) <= end; count++) {
    const date = utcDay(heatmapStart.toISOString());
    heatmap.push(dates.get(date) || { date, commits: 0, additions: 0, deletions: 0, measuredCommits: 0 }); heatmapStart.setUTCDate(heatmapStart.getUTCDate() + 1);
  }
  const measured = commits.filter(commit => commit.stats);
  const changedFiles = new Map<string, { name: string; commits: number; additions: number; deletions: number }>();
  for (const commit of measured) for (const file of commit.stats!.files) {
    const item = changedFiles.get(file.name) || { name: file.name, commits: 0, additions: 0, deletions: 0 };
    item.commits++; item.additions += file.additions; item.deletions += file.deletions; changedFiles.set(file.name, item);
  }
  const daily = [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { commits, daily, timeline: [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date)), interval, heatmap, hours, weekdays, missingDates,
    activeDays: dates.size, merges: commits.filter(commit => commit.parents.length > 1).length, verified: commits.filter(commit => commit.verified).length,
    measuredCommits: measured.length, additions: measured.reduce((sum, commit) => sum + commit.stats!.additions, 0), deletions: measured.reduce((sum, commit) => sum + commit.stats!.deletions, 0),
    firstCommit: daily[0]?.date || '', lastCommit: daily.at(-1)?.date || '',
    changedFiles: [...changedFiles.values()].sort((a, b) => b.commits - a.commits || b.additions + b.deletions - a.additions - a.deletions), filesTruncated: measured.some(commit => commit.stats!.filesTruncated) };
}
export function githubCommitCsv(commits: GitHubCommit[]) {
  return csvExport([
    ['SHA', 'Message', 'Author name', 'Author GitHub', 'Author email', 'Authored at (UTC)', 'Committer name', 'Committer GitHub', 'Committed at (UTC)', 'Merge', 'Verified signature', 'Additions', 'Deletions', 'Change stats loaded', 'URL'],
    ...commits.map(commit => [commit.sha, commit.message, commit.author.name, commit.author.login, commit.author.email, commit.authoredAt, commit.committer.name, commit.committer.login, commit.committedAt, commit.parents.length > 1, commit.verified, commit.stats?.additions, commit.stats?.deletions, Boolean(commit.stats), commit.url]),
  ]);
}
