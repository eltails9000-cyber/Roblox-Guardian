import crypto from 'node:crypto';
import { config, isRobloxConfigured } from '../config.js';

export const ROBLOX = {
  issuer: 'https://apis.roblox.com/oauth/',
  authorize: 'https://apis.roblox.com/oauth/v1/authorize',
  token: 'https://apis.roblox.com/oauth/v1/token',
  introspect: 'https://apis.roblox.com/oauth/v1/token/introspect',
  revoke: 'https://apis.roblox.com/oauth/v1/token/revoke',
  userinfo: 'https://apis.roblox.com/oauth/v1/userinfo',
  scopes: ['openid', 'profile'] as const
};

type PendingState = { verifier: string; nonce: string; expiresAt: number };
const pending = new Map<string, PendingState>();

function base64Url(value: Buffer) { return value.toString('base64url'); }

export function createAuthorizationUrl() {
  if (!isRobloxConfigured) return null;
  const state = base64Url(crypto.randomBytes(32));
  const verifier = base64Url(crypto.randomBytes(48));
  const nonce = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  pending.set(state, { verifier, nonce, expiresAt: Date.now() + 10 * 60 * 1000 });
  const url = new URL(ROBLOX.authorize);
  url.search = new URLSearchParams({
    client_id: config.ROBLOX_CLIENT_ID!, response_type: 'code',
    redirect_uri: config.ROBLOX_REDIRECT_URI, scope: ROBLOX.scopes.join(' '),
    state, code_challenge: challenge, code_challenge_method: 'S256', nonce
  }).toString();
  return url.toString();
}

export async function exchangeCode(code: string, state: string) {
  const entry = pending.get(state); pending.delete(state);
  if (!entry || entry.expiresAt < Date.now()) throw new Error('invalid_state');
  const body = new URLSearchParams({ grant_type: 'authorization_code', code,
    client_id: config.ROBLOX_CLIENT_ID!, client_secret: config.ROBLOX_CLIENT_SECRET!,
    redirect_uri: config.ROBLOX_REDIRECT_URI, code_verifier: entry.verifier });
  const response = await fetch(ROBLOX.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new Error('token_exchange_failed');
  const tokens = await response.json() as { access_token: string; refresh_token?: string; id_token?: string; expires_in?: number; scope?: string };
  const profileResponse = await fetch(ROBLOX.userinfo, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!profileResponse.ok) throw new Error('userinfo_failed');
  const profile = await profileResponse.json();
  return { tokens, profile, nonce: entry.nonce };
}

export async function revokeToken(token: string) {
  const body = new URLSearchParams({ token, client_id: config.ROBLOX_CLIENT_ID!, client_secret: config.ROBLOX_CLIENT_SECRET! });
  await fetch(ROBLOX.revoke, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
}
