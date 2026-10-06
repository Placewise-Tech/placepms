import type { ServerResponse } from 'node:http';
import { ApiError } from './integration-security.js';
import { authenticate, databaseError, errorResponse, jsonBody, jsonResponse, type Request } from './workspace-http.js';

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
          const activity = await admin.from('workspace_activity').insert({ user_id:user.id, session_id:sessionId, event_type:eventType, route, metadata:{ visibility:typeof input.visibility === 'string' ? input.visibility.slice(0, 32) : 'visible', source:'workspace' } });
          // Activity history is an enhancement over the session heartbeat. Keep
          // the security heartbeat usable while an older deployment is waiting
          // for the monitoring migration to be applied.
          if (activity.error && !['PGRST205','42P01'].includes(activity.error.code || '')) databaseError(activity.error);
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
