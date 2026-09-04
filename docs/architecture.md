# Architecture

Roblox Guardian is split into a Vite React frontend and an Express TypeScript backend. The backend owns the OAuth client secret, authorization state, PKCE verifier, token exchange, userinfo request, revocation, and Guardian session lifecycle. PostgreSQL/Prisma models are provided in `prisma/schema.prisma`; the dev store is intentionally in-memory until a database adapter is wired for deployment.

Roblox account sessions, purchases, password changes, email changes, cookies, and private account controls are explicitly outside this application because no official third-party API contract was verified for them.
