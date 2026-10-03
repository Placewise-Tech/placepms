import type { ServerResponse } from 'node:http';
import { ApiError } from './integration-security.js';
import { authenticate, databaseError, errorResponse, jsonBody, jsonResponse, type Request } from './workspace-http.js';

export function createSessionsHandler(env: NodeJS.ProcessEnv = process.env) {
  return async (request: Request, response: ServerResponse) => {
    try {
      const input = await jsonBody(request);
      const { client, sessionId } = await authenticate(request, env);
      if (input.action === 'list' || input.action === 'heartbeat') {
        if (input.action === 'heartbeat') { const touched = await client.rpc('workspace_touch_session'); databaseError(touched.error); }
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
