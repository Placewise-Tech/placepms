import type { ServerResponse } from 'node:http';
import { ApiError } from './integration-security.js';
import { authenticate, databaseError, errorResponse, jsonBody, jsonResponse, type Request } from './workspace-http.js';

let nextCapacityCleanupAt = 0;
let presenceUnavailableUntil = 0;
const optionalSchemaErrors = new Set(['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703']);

export function createSessionsHandler(env: NodeJS.ProcessEnv = process.env) {
  return async (request: Request, response: ServerResponse) => {
    try {
      const input = await jsonBody(request);
      const { client, admin, user, sessionId } = await authenticate(request, env);
      if (input.action === 'list' || input.action === 'heartbeat') {
        if (input.action === 'heartbeat') {
          const touched = await client.rpc('workspace_touch_session'); databaseError(touched.error);
          const route = typeof input.route === 'string' ? input.route.slice(0, 300) : '';
          const eventType = input.event_type === 'page_view' ? 'page_view' : 'heartbeat';
          const visibility = input.visibility === 'visible' ? 'visible' : 'hidden';
          let presenceUnavailable = Date.now() < presenceUnavailableUntil;
          if (!presenceUnavailable) {
            const presence = await client.rpc('workspace_touch_presence', { p_route: route, p_visibility: visibility });
            if (presence.error && !optionalSchemaErrors.has(presence.error.code || '')) databaseError(presence.error);
            if (presence.error) {
              presenceUnavailable = true;
              presenceUnavailableUntil = Date.now() + 60_000;
            }
          }

          // Before the capacity migration, retain the old activity heartbeat
          // behavior so monitoring continues to work during a rolling deploy.
          // Once presence is available, only route changes enter the audit
          // stream; minute heartbeats update one bounded row instead.
          if (presenceUnavailable || eventType === 'page_view') {
            const activity = await admin.from('workspace_activity').insert({ user_id:user.id, session_id:sessionId, event_type:eventType, route, metadata:{ visibility, source:'workspace' } });
            if (activity.error && !optionalSchemaErrors.has(activity.error.code || '')) databaseError(activity.error);
          }
          if (eventType === 'page_view' && Date.now() >= nextCapacityCleanupAt) {
            nextCapacityCleanupAt = Date.now() + 60 * 60_000;
            void Promise.resolve(admin.rpc('workspace_prune_capacity_data')).then(() => undefined).catch(() => undefined);
          }

          // Heartbeats do not need the full device list. Avoid a second query
          // per student per minute; the sessions screen uses action=list.
          jsonResponse(response, { sessions: [], currentSessionId: sessionId }); return;
        }
        const result = await client.rpc('workspace_list_sessions'); databaseError(result.error);
        jsonResponse(response, { sessions: result.data, currentSessionId: sessionId }); return;
      }
      if (input.action === 'revoke') {
        const target = typeof input.sessionId === 'string' ? input.sessionId : '';
        if (!input.others && !/^[a-f0-9-]{36}$/i.test(target)) throw new ApiError(400, 'Choose a valid session.');
        const result = await client.rpc('workspace_revoke_session', { p_session_id: input.others ? null : target, p_others: input.others === true });
        databaseError(result.error);
        jsonResponse(response, { revoked: result.data, currentRevoked: !input.others && target === sessionId }); return;
      }
      throw new ApiError(400, 'Unknown session action.');
    } catch (cause) { errorResponse(response, cause); }
  };
}
