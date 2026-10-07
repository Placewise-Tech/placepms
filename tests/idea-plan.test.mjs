import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { addPlanDays, detectIdeaDomain, generateStarterPlan, ideaWeeks, planEndDate, planMarkdown, validateIdeaInput, validateIdeaPlan } from '../src/lib/idea-plan.ts';
import { ideaDraftKey, readIdeaDraft, saveIdeaDraft } from '../src/lib/idea-draft.ts';

const input = { idea: 'Build a campus placement portal in six weeks', weeks: 6, startDate: '2026-10-10', teamSize: 4, domain: 'auto' };
const generate = (overrides = {}) => generateStarterPlan({ ...input, ...overrides }, randomUUID);

test('starter roadmap fits the exact duration, including one-week plans and calendar boundaries', () => {
  for (const weeks of [1, 2, 6, 24]) {
    const plan = generate({ weeks, startDate: '2028-02-25' });
    assert.equal(plan.phases[0].startDate, '2028-02-25');
    assert.equal(plan.phases.at(-1).dueDate, planEndDate(plan));
    for (let index = 1; index < plan.phases.length; index++) assert.equal(plan.phases[index].startDate, addPlanDays(plan.phases[index - 1].dueDate, 1));
    assert.equal(new Set([plan.id, ...plan.phases.map(item => item.id), ...plan.milestones.map(item => item.id)]).size, 11);
    assert.equal(validateIdeaPlan(plan).weeks, weeks);
  }
});

test('domain and deadline hints personalize plans without inventing people or achieved results', () => {
  assert.equal(ideaWeeks(input.idea), 6);
  assert.equal(ideaWeeks('Create a robot within 3 months'), 12);
  assert.equal(ideaWeeks('Something in 40 weeks'), null);
  for (const [idea, domain] of [['IoT classroom air quality sensor', 'iot'], ['Mobile wellbeing app for Android', 'mobile'], ['A machine learning prediction pipeline', 'data'], ['A research survey of campus travel', 'research']]) {
    assert.equal(detectIdeaDomain(idea), domain);
    const plan = generate({ idea, teamSize: 1 });
    assert.equal(plan.roles.length, 1);
    assert.match(plan.roles[0].responsibility, /Own planning/);
    assert.equal(plan.chapters.length, 6);
  }
  assert.match(generate({ idea: 'Build an IoT classroom air sensor' }).milestones[2].name, /device/i);
  assert.match(generate({ idea: 'Build an IoT classroom air sensor', domain: 'web' }).milestones[2].name, /web/i);
});

test('invalid inputs, corrupt plans, impossible schedules, and cross-phase assignments are rejected', () => {
  for (const changes of [{ idea: 'tiny' }, { weeks: 0 }, { weeks: 25 }, { weeks: 1.5 }, { teamSize: 9 }, { startDate: '2026-02-30' }, { domain: 'unknown' }]) assert.throws(() => validateIdeaInput({ ...input, ...changes }));
  const plan = generate();
  assert.throws(() => validateIdeaPlan({ ...plan, id: 'broken' }), /invalid record ID/);
  assert.throws(() => validateIdeaPlan({ ...plan, milestones: [{ ...plan.milestones[0], dueDate: '2030-01-01' }] }), /dates must fall/);
  assert.throws(() => validateIdeaPlan({ ...plan, milestones: [{ ...plan.milestones[0], phase: 'Not a phase' }] }), /Assign every milestone/);
  assert.throws(() => validateIdeaPlan({ ...plan, objectives: [] }), /objectives/);
  assert.throws(() => validateIdeaPlan({ ...plan, phases: [plan.phases[0], plan.phases[0]] }), /unique/);
});

test('draft persistence preserves edits and ownership while corrupt storage fails closed', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const plan = generate();
  saveIdeaDraft(plan, { pending: true, ownerId: 'owner' }, storage);
  saveIdeaDraft({ ...plan, title: 'My edited title' }, {}, storage);
  assert.equal(readIdeaDraft(storage).plan.title, 'My edited title');
  assert.equal(readIdeaDraft(storage).ownerId, 'owner');
  assert.equal(readIdeaDraft(storage).pending, true);
  saveIdeaDraft(generate(), {}, storage);
  assert.equal(readIdeaDraft(storage).ownerId, undefined);
  assert.equal(readIdeaDraft(storage).pending, false);
  values.set(ideaDraftKey, '{not-json');
  assert.equal(readIdeaDraft(storage), null);
  assert.equal(readIdeaDraft({ getItem: () => { throw new Error('Storage denied'); } }), null);
});

test('downloaded plan contains the visitor’s idea, schedule, responsibilities, and editable chapter outline', () => {
  const plan = generate();
  const markdown = planMarkdown(plan);
  for (const content of [input.idea, plan.title, plan.startDate, planEndDate(plan), '## Objectives', '## Roadmap', '## Milestones', '## Suggested team responsibilities', '## Blackbook chapter outline']) assert.ok(markdown.includes(content));
});
