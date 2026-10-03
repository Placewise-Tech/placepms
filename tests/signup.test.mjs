import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createSignupHandler, registerAccount, temporaryPassword } from '../server/signup.ts';

const input = { email: ' Alex@College.edu ', fullName: 'Alex <Student>', organization: 'College', role: 'student', agreeTerms: true };

function fixture(overrides = {}) {
  const calls = { created: [], deleted: [], emails: [], limits: [], logs: [] };
  const services = {
    appUrl: 'https://placepms.example', senderEmail: 'hello@placepms.example', senderName: 'PlacePMS', rateLimitKey: 'server-only-test-key',
    logError: message => calls.logs.push(message),
    admin: {
      rpc: async (name, args) => { calls.limits.push({ name, args }); return { data: true, error: null }; },
      auth: { admin: {
        createUser: async fields => { calls.created.push(fields); return { data: { user: { id: 'new-user-only' } }, error: null }; },
        deleteUser: async id => { calls.deleted.push(id); return { error: null }; },
      } },
    },
    sendMail: async message => { calls.emails.push(message); },
    ...overrides,
  };
  return { services, calls };
}

test('signup emails the generated credential only to the account owner and requires a password change', async () => {
  const { services, calls } = fixture();
  const message = await registerAccount(input, '127.0.0.1', services);
  const created = calls.created[0];
  assert.equal(created.email, 'alex@college.edu');
  assert.equal(created.email_confirm, true);
  assert.deepEqual(created.app_metadata, { must_change_password: true });
  assert.deepEqual(created.user_metadata, { full_name: input.fullName, college: 'College', role: 'student' });
  assert.equal(calls.emails[0].to.address, created.email);
  assert.ok(calls.emails[0].text.includes(created.password));
  assert.ok(calls.emails[0].text.includes('https://placepms.example/login'));
  assert.ok(calls.emails[0].html.includes('Alex &lt;Student&gt;'));
  assert.ok(!message.includes(created.password));
  assert.ok(!JSON.stringify(calls.limits).includes(created.email));
  assert.ok(!JSON.stringify(calls.limits).includes('127.0.0.1'));
  assert.deepEqual(calls.deleted, []);
});

test('temporary passwords are unique and contain all common required character types', () => {
  const passwords = new Set(Array.from({ length: 100 }, temporaryPassword));
  assert.equal(passwords.size, 100);
  for (const password of passwords) {
    assert.ok(password.length >= 32);
    for (const pattern of [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/]) assert.match(password, pattern);
  }
});

test('invalid signup details never create an account or send email', async () => {
  for (const invalid of [null, {}, { ...input, email: 'user@example.com\r\nBcc:other@example.com' }, { ...input, role: 'admin' }, { ...input, agreeTerms: false }, { ...input, fullName: ' ' }, { ...input, organization: 'x'.repeat(201) }]) {
    const { services, calls } = fixture();
    await assert.rejects(registerAccount(invalid, 'local', services), { status: 400 });
    assert.equal(calls.created.length, 0);
    assert.equal(calls.emails.length, 0);
  }
});

test('existing accounts are not overwritten, deleted, or re-emailed', async () => {
  const { services, calls } = fixture();
  services.admin.auth.admin.createUser = async () => ({ data: {}, error: { code: 'email_exists' } });
  const message = await registerAccount(input, 'local', services);
  const fresh = fixture();
  assert.equal(message, await registerAccount(input, 'local', fresh.services));
  assert.deepEqual(calls.deleted, []);
  assert.deepEqual(calls.emails, []);
});

test('SMTP failure rolls back only the new account and never exposes provider errors', async () => {
  const { services, calls } = fixture({ sendMail: async () => { throw new Error('secret SMTP content'); } });
  await assert.rejects(registerAccount(input, 'local', services), error => error.status === 502 && !error.message.includes('secret'));
  assert.deepEqual(calls.deleted, ['new-user-only']);
  assert.deepEqual(calls.logs, []);
});

test('cleanup failures are reported without logging SMTP credentials', async () => {
  const { services, calls } = fixture({ sendMail: async () => { throw new Error('secret'); } });
  services.admin.auth.admin.deleteUser = async () => ({ error: new Error('cleanup secret') });
  await assert.rejects(registerAccount(input, 'local', services), { status: 502 });
  assert.equal(calls.logs.length, 1);
  assert.ok(!calls.logs[0].includes('secret'));
});

test('rate limits and limiter outages fail closed before creating accounts', async () => {
  for (const [result, status] of [[{ data: false, error: null }, 429], [{ data: null, error: new Error('database') }, 503]]) {
    const { services, calls } = fixture();
    services.admin.rpc = async () => result;
    await assert.rejects(registerAccount(input, 'local', services), { status });
    assert.deepEqual(calls.created, []);
    assert.deepEqual(calls.emails, []);
  }
});

test('Auth failure does not send email or attempt to delete another account', async () => {
  const { services, calls } = fixture();
  services.admin.auth.admin.createUser = async () => ({ data: {}, error: { code: 'unexpected_failure' } });
  await assert.rejects(registerAccount(input, 'local', services), { status: 503 });
  assert.deepEqual(calls.deleted, []);
  assert.deepEqual(calls.emails, []);
});

test('HTTP endpoint rejects invalid requests and reports missing configuration without secrets', async t => {
  const server = createServer(createSignupHandler({}));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/signup`;
  const get = await fetch(url);
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  assert.equal(get.headers.get('cache-control'), 'no-store');
  const wrongType = await fetch(url, { method: 'POST', body: 'hello' });
  assert.equal(wrongType.status, 415);
  const malformed = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const oversized = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a'.repeat(9000) }) });
  assert.equal(oversized.status, 413);
  const unconfigured = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(unconfigured.status, 503);
  assert.match((await unconfigured.json()).error, /not configured/);
});
