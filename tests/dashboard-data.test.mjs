import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarExport, emptyDashboard, getDashboardStats, getDocuments, localDateKey, safeExternalUrl, upcomingMilestones } from '../src/lib/dashboard-data.ts';

test('empty workspaces have no invented totals', () => {
  assert.deepEqual(getDashboardStats(emptyDashboard), { activeProjects: 0, pendingTasks: 0, completedTasks: 0, overdueTasks: 0, members: 0, completion: 0 });
});

test('totals exclude archived work and deduplicate members across teams', () => {
  const data = {
    squads: [{ status: 'PENDING' }, { status: 'COMPLETED' }, { status: 'ARCHIVED' }],
    milestones: [{ status: 'PENDING', due_date: '2026-10-01' }, { status: 'APPROVED', due_date: '2026-10-01' }, { status: 'CANCELLED', due_date: '2026-10-01' }],
    members: [{ email: 'member@example.test' }, { email: 'MEMBER@example.test' }],
  };
  assert.deepEqual(getDashboardStats(data, '2026-10-03'), { activeProjects: 1, pendingTasks: 1, completedTasks: 1, overdueTasks: 1, members: 1, completion: 50 });
});

test('deadlines include today but exclude completed, archived, and overdue work', () => {
  const tasks = [
    { id: 'later', due_date: '2026-10-06', status: 'PENDING' },
    { id: 'today', due_date: '2026-10-03', status: 'PENDING' },
    { id: 'past', due_date: '2026-10-02', status: 'PENDING' },
    { id: 'done', due_date: '2026-10-04', status: 'COMPLETED' },
    { id: 'cancelled', due_date: '2026-10-04', status: 'CANCELLED' },
  ];
  assert.deepEqual(upcomingMilestones(tasks, '2026-10-03').map(task => task.id), ['today', 'later']);
  assert.equal(localDateKey(new Date(2026, 9, 3, 0, 1)), '2026-10-03');
});

test('submission links reject executable URLs and tolerate unknown JSON', () => {
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('data:text/html,hello'), null);
  assert.deepEqual(getDocuments([{ submission_files: null }, { submission_files: {} }]), []);
  const documents = getDocuments([{ id: 'm1', name: 'Delivery', submission_files: [{ name: 'Report', url: 'https://example.test/report.pdf' }, { name: 'Unsafe', url: 'javascript:alert(1)' }] }]);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].name, 'Report');
});

test('calendar exports escape event text and use all-day dates', () => {
  const calendar = calendarExport([{ id: 'm1', due_date: '2026-10-03', name: 'Review, team; final\nmeeting', phase: 'Build', status: 'PENDING' }], new Date('2026-10-01T10:00:00Z'));
  assert.match(calendar, /DTSTART;VALUE=DATE:20261003/);
  assert.ok(calendar.includes('SUMMARY:Review\\, team\\; final\\nmeeting'));
  assert.ok(!calendarExport([{ due_date: null }]).includes('BEGIN:VEVENT'));
});
