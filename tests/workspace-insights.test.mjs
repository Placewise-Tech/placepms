import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvExport, milestoneMatches, projectHealth, sortMilestones } from '../src/lib/workspace-insights.ts';
import { readBlackbookDraft, reportBlocks, reportHtml } from '../src/lib/workspace-library.ts';

test('attention filters preserve overdue review and revision work without reviving completed milestones', () => {
  const today = '2026-10-04';
  assert.equal(milestoneMatches({ status: 'SUBMITTED', due_date: '2026-10-01' }, 'overdue', today), true);
  assert.equal(milestoneMatches({ status: 'REVISION_REQUESTED' }, 'revision', today), true);
  assert.equal(milestoneMatches({ status: 'APPROVED', due_date: '2026-10-01' }, 'overdue', today), false);
  assert.equal(milestoneMatches({ status: 'ARCHIVED', due_date: null }, 'unscheduled', today), false);
  assert.equal(milestoneMatches({ status: 'PENDING', due_date: today }, 'today', today), true);
  const tasks = [{ name: 'Undated', due_date: null }, { name: 'Later', due_date: '2026-10-10' }, { name: 'First', due_date: '2026-10-01' }];
  assert.deepEqual(sortMilestones(tasks).map(task => task.name), ['First', 'Later', 'Undated']);
  assert.equal(tasks[0].name, 'Undated');
});

test('project health ranks actual delivery risk and scopes completion to each current project', () => {
  const data = { squads: [{ id: 'safe', title: 'Safe' }, { id: 'risk', title: 'Risk' }, { id: 'archived', status: 'ARCHIVED' }], milestones: [{ squad_id: 'safe', status: 'APPROVED' }, { squad_id: 'risk', status: 'REVISION_REQUESTED', due_date: '2026-10-01' }, { squad_id: 'risk', status: 'CANCELLED', due_date: '2026-10-01' }] };
  const result = projectHealth(data, '2026-10-04');
  assert.deepEqual(result.map(item => item.project.id), ['risk', 'safe']);
  assert.equal(result[0].overdue, 1); assert.equal(result[0].revisions, 1); assert.equal(result[0].tasks, 1);
  assert.equal(result[1].completion, 100);
});

test('CSV exports retain quotes and Unicode while neutralizing spreadsheet formulas', () => {
  const exported = csvExport([['Title', 'Feedback'], ['=HYPERLINK("https://example.test")', 'Reviewed, "well"\nनमस्ते'], [' +SUM(1,2)', null]]);
  assert.ok(exported.startsWith('\uFEFF'));
  assert.ok(exported.includes('"\'=HYPERLINK(""https://example.test"")"'));
  assert.ok(exported.includes('Reviewed, ""well""\nनमस्ते'));
  assert.ok(exported.includes('"\' +SUM(1,2)"'));
});

test('saved report drafts restore authored sections and reject corrupt or unsupported records', () => {
  const notes = JSON.stringify({ version: 1, title: 'Capstone', sections: { Abstract: 'Authored work', Methodology: 42 }, report: '# Report' });
  assert.deepEqual(readBlackbookDraft(notes, ['Abstract', 'Methodology']), { title: 'Capstone', sections: { Abstract: 'Authored work', Methodology: '' }, report: '# Report' });
  for (const value of ['not json', 'null', '{}', '{"version":2}', '[]']) assert.equal(readBlackbookDraft(value, ['Abstract']), null);
});

test('academic report previews and HTML retain evidence tables, escaped pipes, Unicode, and literal unsafe markup', () => {
  const content = '# Capstone\r\n\r\n## Evidence\r\n- Team: नमस्ते\r\n\r\n| Delivery | Feedback |\r\n| --- | --- |\r\n| Build \\| review | <img src=x onerror=alert(1)> |\r\n\r\nAuthored line one\r\nAuthored line two';
  const blocks = reportBlocks(content);
  assert.deepEqual(blocks.find(block => block.kind === 'table'), { kind: 'table', headers: ['Delivery', 'Feedback'], rows: [['Build | review', '<img src=x onerror=alert(1)>']] });
  assert.equal(blocks.at(-1).text, 'Authored line one\nAuthored line two');
  const html = reportHtml('<script>unsafe</script>', content);
  assert.ok(html.includes('<h1>Capstone</h1>'));
  assert.ok(html.includes('<th>Delivery</th>'));
  assert.ok(html.includes('<td>Build | review</td>'));
  assert.ok(html.includes('नमस्ते'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img') && !html.includes('<script>'));
});
