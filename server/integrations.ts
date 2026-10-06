import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { ApiError, digest, providerName, seal, unseal, type Provider } from './integration-security.js';
import { authenticate, databaseError, errorResponse, jsonBody, jsonResponse, serverClients, type Request } from './workspace-http.js';
import { commitDetail, connectionAccount, githubCommitStatsPage, inspectDesign, inspectGitHub, listResources, object, repositoryFiles, text, type Credential } from './providers.js';
import { assertFeature, managementError } from './management.js';
import { detectCommitAI } from '../src/lib/github-ai.js';
import { repositoryPath } from './integration-security.js';

type Admin = ReturnType<typeof serverClients>['admin'];
const providers: Provider[] = ['github', 'figma', 'miro'];
const connectionColumns = 'provider,mode,account,expires_at,updated_at';

function oauthSettings(provider: Provider, env: NodeJS.ProcessEnv) {
  const prefix = provider.toUpperCase();
  const clientId = env[`${prefix}_CLIENT_ID`]; const secret = env[`${prefix}_CLIENT_SECRET`];
  if (!clientId || !secret) throw new ApiError(503, `Configure ${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET to enable ${provider} authorization. Token connections are also available.`);
  return { clientId, secret };
}
function siteOrigin(env: NodeJS.ProcessEnv) {
  const url = new URL(env.APP_URL || 'http://localhost:5173');
  if (url.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:')) throw new ApiError(503, 'Configure a valid APP_URL.');
  return url.origin;
}
const callbackUrl = (provider: Provider, env: NodeJS.ProcessEnv) => `${siteOrigin(env)}/api/integrations?action=callback&provider=${provider}`;
const cookieName = (provider: Provider) => `placepms_oauth_${provider}`;
function setStateCookie(response: ServerResponse, provider: Provider, state: string, env: NodeJS.ProcessEnv, clear = false) {
  response.setHeader('Set-Cookie', `${cookieName(provider)}=${state}; Path=/api/integrations; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 600}${siteOrigin(env).startsWith('https:') ? '; Secure' : ''}`);
}

async function exchange(provider: Provider, values: Record<string, string>, env: NodeJS.ProcessEnv, refresh = false) {
  const { clientId, secret } = oauthSettings(provider, env);
  const url = provider === 'github' ? 'https://github.com/login/oauth/access_token' : provider === 'figma' ? `https://api.figma.com/v1/oauth/${refresh ? 'refresh' : 'token'}` : 'https://api.miro.com/v1/oauth/token';
  const body = new URLSearchParams(values);
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' };
  if (provider === 'figma') headers.Authorization = `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`;
  else { body.set('client_id', clientId); body.set('client_secret', secret); }
  const response = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(20_000), redirect: 'error' });
  const result = object(await response.json());
  if (!response.ok || !text(result.access_token)) throw new ApiError(401, `${provider} authorization could not be completed. Please reconnect.`);
  return { credential: { accessToken: text(result.access_token), refreshToken: text(result.refresh_token) || undefined, mode: 'oauth' as const }, expiresAt: Number(result.expires_in) > 0 ? new Date(Date.now() + Number(result.expires_in) * 1000).toISOString() : null };
}

async function saveConnection(admin: Admin, userId: string, provider: Provider, credential: Credential, account: string, expiresAt: string | null, env: NodeJS.ProcessEnv) {
  const result = await admin.from('integration_connections').upsert({ user_id: userId, provider, mode: credential.mode, account, credentials: seal(JSON.stringify(credential), `${userId}:${provider}`, env), expires_at: expiresAt, updated_at: new Date().toISOString() }, { onConflict: 'user_id,provider' });
  databaseError(result.error);
}

async function getCredential(admin: Admin, userId: string, provider: Provider, env: NodeJS.ProcessEnv): Promise<Credential> {
  const result = await admin.from('integration_connections').select('*').eq('user_id', userId).eq('provider', provider).maybeSingle();
  databaseError(result.error);
  if (!result.data) throw new ApiError(409, `Connect your ${provider} account first.`);
  const row = result.data;
  let credential = JSON.parse(unseal(row.credentials, `${userId}:${provider}`, env)) as Credential;
  if (row.expires_at && Date.parse(row.expires_at) < Date.now() + 60_000) {
    if (!credential.refreshToken || credential.mode !== 'oauth') throw new ApiError(401, 'This connection expired. Connect it again.');
    const lease = await admin.rpc('workspace_claim_token_refresh', { p_user_id: userId, p_provider: provider });
    databaseError(lease.error);
    if (lease.data !== true) throw new ApiError(409, 'This connection is refreshing. Please retry in a few seconds.');
    try {
      const refreshed = await exchange(provider, { grant_type: 'refresh_token', refresh_token: credential.refreshToken }, env, true);
      credential = { ...refreshed.credential, refreshToken: refreshed.credential.refreshToken || credential.refreshToken };
      // An in-flight refresh must not resurrect a disconnected connection or
      // overwrite credentials that the user replaced in another browser tab.
      const saved = await admin.from('integration_connections').update({ credentials: seal(JSON.stringify(credential), `${userId}:${provider}`, env), expires_at: refreshed.expiresAt, updated_at: new Date().toISOString() }).eq('id', row.id).eq('user_id', userId).eq('credentials', row.credentials).select('id').maybeSingle();
      databaseError(saved.error);
      if (!saved.data) throw new ApiError(409, 'This connection changed while refreshing. Please retry.');
    } finally { await admin.from('integration_connections').update({ refreshing_until: null }).eq('id', row.id).eq('user_id', userId); }
  }
  return credential;
}

async function beginOAuth(provider: Provider, userId: string, sessionId: string, admin: Admin, response: ServerResponse, env: NodeJS.ProcessEnv) {
  const { clientId } = oauthSettings(provider, env);
  const state = randomBytes(32).toString('base64url'); const verifier = randomBytes(48).toString('base64url');
  await admin.from('integration_oauth_states').delete().lt('expires_at', new Date().toISOString());
  const saved = await admin.from('integration_oauth_states').insert({ state_hash: digest(state), user_id: userId, session_id: sessionId, provider, verifier: seal(verifier, `${userId}:${provider}:state`, env), expires_at: new Date(Date.now() + 600_000).toISOString() });
  databaseError(saved.error);
  setStateCookie(response, provider, state, env);
  const url = new URL(provider === 'github' ? 'https://github.com/login/oauth/authorize' : provider === 'figma' ? 'https://www.figma.com/oauth' : 'https://miro.com/oauth/authorize');
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: callbackUrl(provider, env), state, response_type: 'code' }).toString();
  if (provider !== 'miro') {
    url.searchParams.set('scope', provider === 'github' ? 'read:user repo' : 'current_user:read file_content:read file_comments:read file_versions:read projects:read');
    url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return { url: url.href };
}

async function completeOAuth(request: Request, response: ServerResponse, url: URL, env: NodeJS.ProcessEnv) {
  const provider = providerName(url.searchParams.get('provider'));
  const state = url.searchParams.get('state') || '';
  const cookie = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName(provider)}=`))?.split('=')[1] || '';
  setStateCookie(response, provider, '', env, true);
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(cookie) || !timingSafeEqual(Buffer.from(state), Buffer.from(cookie))) throw new ApiError(400, 'Authorization state is invalid. Start the connection again in this browser.');
  const { admin } = serverClients(env);
  // DELETE RETURNING atomically consumes the state; callbacks cannot be replayed.
  const pending = await admin.from('integration_oauth_states').delete().eq('state_hash', digest(state)).eq('provider', provider).gt('expires_at', new Date().toISOString()).select('*').maybeSingle();
  databaseError(pending.error);
  if (!pending.data) throw new ApiError(400, 'Authorization expired or was already used. Start again.');
  if (url.searchParams.has('error')) throw new ApiError(400, 'Authorization was cancelled. You can try again.');
  const active = await admin.rpc('workspace_session_active', { p_user_id: pending.data.user_id, p_session_id: pending.data.session_id });
  databaseError(active.error);
  if (active.data !== true) throw new ApiError(401, 'Your PlacePMS session ended. Sign in and reconnect.');
  await assertFeature(admin,pending.data.user_id,provider);
  const code = url.searchParams.get('code');
  if (!code || code.length > 4096) throw new ApiError(400, 'Authorization code is missing.');
  const values = { grant_type: 'authorization_code', code, redirect_uri: callbackUrl(provider, env), ...(provider !== 'miro' ? { code_verifier: unseal(pending.data.verifier, `${pending.data.user_id}:${provider}:state`, env) } : {}) };
  const exchanged = await exchange(provider, values, env);
  const account = await connectionAccount(provider, exchanged.credential);
  await saveConnection(admin, pending.data.user_id, provider, exchanged.credential, account, exchanged.expiresAt, env);
  response.statusCode = 303;
  response.setHeader('Location', `${siteOrigin(env)}/dashboard/integrations?connected=${provider}`);
  response.end();
}

export function createIntegrationsHandler(env: NodeJS.ProcessEnv = process.env) {
  return async (request: Request, response: ServerResponse) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer');
    const url = new URL(request.url || '/', 'http://localhost');
    const callback = request.method === 'GET' && url.searchParams.get('action') === 'callback';
    try {
      if (callback) { await completeOAuth(request, response, url, env); return; }
      const input = await jsonBody(request);
      const { user, admin, client, sessionId } = await authenticate(request, env);
      const rate = await admin.rpc('claim_workspace_request', { p_user_id: user.id }); databaseError(rate.error);
      if (rate.data !== true) throw new ApiError(429, 'Too many integration requests. Please wait a minute.');
      if (input.action === 'status') {
        const result = await admin.from('integration_connections').select(connectionColumns).eq('user_id', user.id);
        databaseError(result.error);
        jsonResponse(response, { connections: result.data, oauth: Object.fromEntries(providers.map(provider => [provider, Boolean(env[`${provider.toUpperCase()}_CLIENT_ID`] && env[`${provider.toUpperCase()}_CLIENT_SECRET`])])) }); return;
      }
      const provider = providerName(input.provider);
      if (input.action !== 'disconnect') await assertFeature(admin,user.id,provider);
      if (input.action === 'connect-token') {
        const token = text(input.token).trim();
        if (token.length < 10 || token.length > 4096 || /\s/.test(token)) throw new ApiError(400, 'Enter a valid provider access token.');
        const credential: Credential = { accessToken: token, mode: 'token' };
        const account = await connectionAccount(provider, credential);
        await saveConnection(admin, user.id, provider, credential, account, null, env);
        jsonResponse(response, { account }); return;
      }
      if (input.action === 'connect-oauth') { jsonResponse(response, await beginOAuth(provider, user.id, sessionId, admin, response, env)); return; }
      if (input.action === 'disconnect') {
        const result = await admin.from('integration_connections').delete().eq('user_id', user.id).eq('provider', provider); databaseError(result.error);
        const pending = await admin.from('integration_oauth_states').delete().eq('user_id', user.id).eq('provider', provider); databaseError(pending.error);
        jsonResponse(response, { disconnected: true }); return;
      }
      const credential = provider === 'github' && input.access === 'public' ? undefined : await getCredential(admin, user.id, provider, env);
      if (provider === 'github' && credential && ['oauth', 'token'].includes(text(input.access)) && credential.mode !== input.access) throw new ApiError(409, `Your GitHub connection uses ${credential.mode === 'oauth' ? 'authorization' : 'a token'}. Select that access option or connect using your selected method.`);
      if (input.action === 'list') {
        if (!credential) throw new ApiError(400, 'Connect an account to list its repositories. Public repositories can be inspected by URL.');
        jsonResponse(response, await listResources(provider, input, credential)); return;
      }
      if (provider === 'github' && input.action === 'files') { jsonResponse(response, await repositoryFiles(input, credential)); return; }
      if (provider === 'github' && input.action === 'commit') { jsonResponse(response, await commitDetail(input, credential)); return; }
      if (provider === 'github' && input.action === 'commit-stats') {
        const result=await githubCommitStatsPage(input,credential);
        if (typeof input.reportId==='string' && /^[a-f0-9-]{36}$/i.test(input.reportId)) {
          const saved=await admin.rpc('workspace_report_change_stats',{p_owner:user.id,p_report:input.reportId,p_repository:repositoryPath(input.target),p_stats:result.commits}); managementError(saved.error);
        }
        jsonResponse(response,result); return;
      }
      if (input.action === 'inspect') {
        const report=provider === 'github' ? await inspectGitHub(input,credential) : await inspectDesign(provider,input,credential!);
        if (report.github) {
          let projectId: string | null=null;
          if (typeof input.projectId==='string' && input.projectId) {
            const project=await clientForProject(client, input.projectId, report.repository || '');
            projectId=project;
          }
          const payload={ ...report,github:{ ...report.github,commits:report.github.commits.map(commit=>({ ...commit,aiAssistance:detectCommitAI(commit) })) } };
          const saved=await admin.rpc('workspace_save_repository_report',{p_owner:user.id,p_project:projectId,p_payload:payload}); managementError(saved.error);
          if (typeof saved.data==='string') report.savedReportId=saved.data;
        } else if (provider === 'figma' || provider === 'miro') {
          const saved=await admin.from('workspace_provider_reports').insert({ owner_id:user.id, provider, title:report.title, url:report.url, payload:report }).select('id').maybeSingle();
          databaseError(saved.error);
          if (saved.data?.id) report.savedProviderReportId=saved.data.id;
        }
        jsonResponse(response,report); return;
      }
      throw new ApiError(400, 'Unknown integration action.');
    } catch (cause) {
      if (callback) {
        response.statusCode = 303;
        response.setHeader('Location', `${siteOrigin(env)}/dashboard/integrations?connection_error=${encodeURIComponent(cause instanceof ApiError ? cause.message : 'Authorization failed. Please try again.')}`);
        response.end();
      } else errorResponse(response, cause);
    }
  };
}

async function clientForProject(client: Admin, projectId: string, repository: string) {
  if (projectId.length>100) throw new ApiError(400,'Choose a valid project.');
  const result=await client.from('pms_squads').select('id,github_repo').eq('id',projectId).maybeSingle(); databaseError(result.error);
  if (!result.data || !result.data.github_repo || repositoryPath(result.data.github_repo).toLowerCase()!==repositoryPath(repository).toLowerCase()) throw new ApiError(403,'Choose an accessible project linked to this repository.');
  return result.data.id as string;
}
