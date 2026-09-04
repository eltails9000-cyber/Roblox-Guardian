import crypto from 'node:crypto';

export type Profile = { sub: string; name?: string; nickname?: string; preferred_username?: string; picture?: string; profile?: string };
export type Connection = { profile: Profile; scopes: string[]; accessToken: string; refreshToken?: string; connectedAt: string };
export type GuardianSession = { id: string; createdAt: string; lastActive: string; userAgent: string; current: boolean };

const connections = new Map<string, Connection>();
const sessions = new Map<string, GuardianSession[]>();
const events = new Map<string, Array<{ id: string; type: string; status: string; createdAt: string }>>();

export function saveConnection(id: string, connection: Connection) { connections.set(id, connection); }
export function getConnection(id: string) { return connections.get(id); }
export function deleteConnection(id: string) { connections.delete(id); }
export function createSession(userId: string, userAgent: string) { const session = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), lastActive: new Date().toISOString(), userAgent, current: true }; sessions.set(userId, [...(sessions.get(userId) ?? []), session]); return session; }
export function listSessions(userId: string) { return sessions.get(userId) ?? []; }
export function hasSession(userId: string, sessionId: string) { return listSessions(userId).some((session) => session.id === sessionId); }
export function deleteSession(userId: string, sessionId: string) { sessions.set(userId, listSessions(userId).filter((session) => session.id !== sessionId)); }
export function deleteAllSessions(userId: string) { sessions.delete(userId); }
export function addEvent(userId: string, type: string, status = 'success') { const event = { id: crypto.randomUUID(), type, status, createdAt: new Date().toISOString() }; events.set(userId, [...(events.get(userId) ?? []), event]); return event; }
export function listEvents(userId: string) { return events.get(userId) ?? []; }
