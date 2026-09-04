# Roblox Guardian

Independent security companion for Roblox authorization. It uses official Roblox OAuth/OIDC only and never requests Roblox passwords, cookies, `.ROBLOSECURITY`, or client credentials.

## Local setup

```bash
npm install
copy .env.example .env
npm run dev
```

Set `ROBLOX_CLIENT_ID`, `ROBLOX_CLIENT_SECRET`, `ROBLOX_REDIRECT_URI`, `DATABASE_URL`, and a 32+ character `SESSION_SECRET`. Register the exact callback with Roblox. Open `http://localhost:3000`.

Without OAuth credentials the UI intentionally says `Roblox OAuth is not configured.` No fake login is provided.

Roblox Guardian is an independent application and is not affiliated with, sponsored by, or endorsed by Roblox Corporation.
