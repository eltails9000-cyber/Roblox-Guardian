import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, isRobloxConfigured } from './config.js';
import { createAuthorizationUrl, exchangeCode, revokeToken } from './roblox/oauth.js';
import { addEvent, createSession, deleteAllSessions, deleteConnection, deleteSession, getConnection, hasSession, listEvents, listSessions, saveConnection } from './store.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: config.APP_URL, credentials: true }));
app.use(express.json({ limit: '50kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true }));

const guardianUser = 'local-demo-user';
const sessionCookie = 'guardian_session';
function getGuardianSession(request: express.Request) { const cookie = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookie}=`)); return cookie ? decodeURIComponent(cookie.slice(sessionCookie.length + 1)) : null; }
function isAuthenticated(request: express.Request) { const sessionId = getGuardianSession(request); return Boolean(sessionId && hasSession(guardianUser, sessionId)); }
app.use((request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });

app.get('/api/health', (_request, response) => response.json({ ok: true, robloxConfigured: isRobloxConfigured }));
app.get('/api/oauth/start', (_request, response) => {
  const url = createAuthorizationUrl();
  if (!url) return response.status(503).json({ code: 'NOT_CONFIGURED', message: 'Roblox OAuth is not configured.' });
  return response.redirect(url);
});
app.get('/api/oauth/callback', async (request, response) => {
  const { code, state, error } = request.query;
  if (error) return response.redirect(`${config.APP_URL}/?error=authorization_cancelled`);
  if (typeof code !== 'string' || typeof state !== 'string') return response.redirect(`${config.APP_URL}/?error=invalid_callback`);
  try {
    const result = await exchangeCode(code, state);
    saveConnection(guardianUser, { profile: result.profile, scopes: [...result.tokens.scope?.split(' ') ?? ['openid', 'profile']], accessToken: result.tokens.access_token, refreshToken: result.tokens.refresh_token, connectedAt: new Date().toISOString() });
    const session = createSession(guardianUser, request.get('user-agent') ?? 'Unknown browser');
    addEvent(guardianUser, 'OAuth authorization'); addEvent(guardianUser, 'Guardian session created');
    const cookieParts = [`${sessionCookie}=${encodeURIComponent(session.id)}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${7 * 24 * 60 * 60}`];
    if (config.NODE_ENV === 'production') cookieParts.push('Secure');
    response.setHeader('Set-Cookie', cookieParts.join('; '));
    return response.redirect(`${config.APP_URL}/dashboard`);
  } catch (error) { const code = error instanceof Error ? error.message : 'oauth_failed'; return response.redirect(`${config.APP_URL}/?error=${encodeURIComponent(code === 'invalid_state' ? 'invalid_state' : 'oauth_failed')}`); }
});
app.get('/api/me', (request, response) => { const connection = isAuthenticated(request) ? getConnection(guardianUser) : undefined; return response.json({ connected: Boolean(connection), profile: connection?.profile ?? null, scopes: connection?.scopes ?? [] }); });
app.post('/api/oauth/revoke', async (request, response) => { if (!isAuthenticated(request)) return response.status(401).json({ code: 'UNAUTHORIZED', message: 'Guardian session required.' }); const connection = getConnection(guardianUser); if (connection) { await revokeToken(connection.refreshToken ?? connection.accessToken); deleteConnection(guardianUser); addEvent(guardianUser, 'OAuth revoked'); } return response.status(204).end(); });
app.get('/api/sessions', (request, response) => isAuthenticated(request) ? response.json({ sessions: listSessions(guardianUser) }) : response.status(401).json({ code: 'UNAUTHORIZED', message: 'Guardian session required.' }));
app.delete('/api/sessions/:id', (request, response) => { if (!isAuthenticated(request)) return response.status(401).json({ code: 'UNAUTHORIZED', message: 'Guardian session required.' }); deleteSession(guardianUser, request.params.id); addEvent(guardianUser, 'Session terminated'); return response.status(204).end(); });
app.delete('/api/sessions', (request, response) => { if (!isAuthenticated(request)) return response.status(401).json({ code: 'UNAUTHORIZED', message: 'Guardian session required.' }); deleteAllSessions(guardianUser); addEvent(guardianUser, 'Session terminated'); return response.status(204).end(); });
app.get('/api/activity', (request, response) => isAuthenticated(request) ? response.json({ events: listEvents(guardianUser) }) : response.status(401).json({ code: 'UNAUTHORIZED', message: 'Guardian session required.' }));
app.use((_request, response) => response.status(404).json({ code: 'NOT_FOUND', message: 'Resource not found.' }));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => { console.error('request_failed', error instanceof Error ? error.message : 'unknown'); response.status(500).json({ code: 'INTERNAL_ERROR', message: 'Something went wrong.' }); });

app.listen(4000, () => console.log(`Roblox Guardian backend listening on ${config.BACKEND_URL}`));
export { app };
