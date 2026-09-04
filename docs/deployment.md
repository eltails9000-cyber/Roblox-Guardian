# Deployment

1. Install Node.js 20+ and PostgreSQL.
2. Run `npm install` in the root, then `npm install` in `frontend` and `backend`.
3. Copy `.env.example` to `.env` and set a random `SESSION_SECRET`, PostgreSQL `DATABASE_URL`, Roblox client ID/secret, and exact redirect URI.
4. Run Prisma migrations with `npx prisma migrate dev --schema prisma/schema.prisma`.
5. Run `npm run dev` for local development.
6. Production uses `npm run build`, an HTTPS reverse proxy, and `https://YOUR_DOMAIN/api/oauth/callback` registered exactly in Roblox.

The frontend runs on port 3000 and the backend on port 4000 by default.
