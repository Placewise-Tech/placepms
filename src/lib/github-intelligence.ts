import type { GitHubAnalysis, GitHubRepositoryIntelligence } from './integration-types';
import { commitTime, githubActivity, githubContributors, githubCoverageComplete, utcDay } from './github-analytics';
import { detectCommitAI } from './github-ai';

const dayMs = 86_400_000;
const failedConclusions = new Set(['failure', 'timed_out', 'action_required', 'startup_failure']);
export const isWorkflowFailure = (conclusion: string) => failedConclusions.has(conclusion);
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function githubDeliverySignals(analysis: GitHubAnalysis, author = '') {
  const activity = githubActivity(analysis, author); const contributors = githubContributors(activity.commits);
  const times = activity.commits.map(commit => Date.parse(commitTime(commit))).filter(Number.isFinite).sort((a, b) => a - b);
  const days = [...new Set(times.map(time => utcDay(new Date(time).toISOString())))].sort();
  let longestStreak = 0; let streak = 0; let previous = '';
  for (const day of days) { streak = previous && Date.parse(day) - Date.parse(previous) === dayMs ? streak + 1 : 1; longestStreak = Math.max(longestStreak, streak); previous = day; }
  const end = Date.parse(utcDay(analysis.window.until)); const since = analysis.window.since ? Date.parse(utcDay(analysis.window.since)) : days.length ? Date.parse(days[0]) : end;
  const windowDays = Number.isFinite(end) && Number.isFinite(since) && since <= end ? Math.round((end - since) / dayMs) + 1 : null;
  const recent = times.filter(time => time >= end - 6 * dayMs && time < end + dayMs).length;
  const preceding = times.filter(time => time >= end - 13 * dayMs && time < end - 6 * dayMs).length;
  const trendCovered = githubCoverageComplete(analysis) && Number.isFinite(end) && (!analysis.window.since || since <= end - 13 * dayMs);
  const ai = activity.commits.map(detectCommitAI);
  return {
    available: analysis.commitsAvailable, complete: githubCoverageComplete(analysis), loaded: activity.commits.length,
    dated: times.length, missingDates: activity.missingDates, activeDays: days.length, longestStreak, windowDays,
    commitsPerCalendarDay: windowDays ? times.length / windowDays : null,
    medianGapHours: median(times.slice(1).map((time, index) => (time - times[index]) / 3_600_000)),
    recentWeek: recent, precedingWeek: preceding, trendCovered,
    trendPercent: trendCovered && preceding > 0 ? Math.round((recent - preceding) / preceding * 100) : null,
    topContributor: contributors[0], topShare: activity.commits.length ? (contributors[0]?.commits || 0) / activity.commits.length * 100 : 0,
    merges: activity.merges, verified: activity.verified, measured: activity.measuredCommits,
    additions: activity.measuredCommits ? activity.additions : null, deletions: activity.measuredCommits ? activity.deletions : null,
    changedFiles: activity.changedFiles, filesTruncated: activity.filesTruncated,
    aiMarked: ai.filter(item => item.flagged).length, aiTools: [...new Set(ai.flatMap(item => item.tools))],
  };
}

export function githubAutomationSignals(intelligence?: GitHubRepositoryIntelligence) {
  if (!intelligence?.coverage.runs.available) return { available: false, completed: null, successful: null, failed: null, active: null, medianObservedMinutes: null };
  const completed = intelligence.runs.filter(run => run.status === 'completed');
  const durations = completed.flatMap(run => {
    const start = Date.parse(run.startedAt); const end = Date.parse(run.updatedAt);
    return Number.isFinite(start) && Number.isFinite(end) && end >= start ? [(end - start) / 60_000] : [];
  });
  return {
    available: true, completed: completed.length,
    successful: completed.filter(run => run.conclusion === 'success').length,
    failed: completed.filter(run => isWorkflowFailure(run.conclusion)).length,
    active: intelligence.runs.filter(run => ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(run.status)).length,
    medianObservedMinutes: median(durations),
  };
}
