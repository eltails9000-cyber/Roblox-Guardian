import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

/* =========================
   TYPES
========================= */

export type Profile = {
  sub: string;
  name?: string;
  nickname?: string;
  preferred_username?: string;
  picture?: string;
  profile?: string;
};

export type Connection = {
  profile: Profile;
  scopes: string[];
  accessToken: string;
  refreshToken?: string;
  connectedAt: string;
};

export type GuardianSession = {
  id: string;
  createdAt: string;
  lastActive: string;
  userAgent: string;
  current: boolean;
};

export type GuardianEvent = {
  id: string;
  type: string;
  status: string;
  createdAt: string;
};

/* =========================
   DATABASE
========================= */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not configured'
  );
}

const pool = new Pool({
  connectionString,

  max: 10,

  idleTimeoutMillis: 30000,

  connectionTimeoutMillis: 10000,

  ssl:
    process.env.NODE_ENV === 'production'
      ? {
          rejectUnauthorized: false
        }
      : undefined
});

/* =========================
   DATABASE ERRORS
========================= */

pool.on('error', (error) => {
  console.error(
    'Unexpected PostgreSQL pool error:',
    error
  );
});

/* =========================
   INITIALIZE DATABASE
========================= */

export async function initializeStore() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guardian_connections (
      user_id TEXT PRIMARY KEY,
      profile JSONB NOT NULL,
      scopes TEXT[] NOT NULL DEFAULT '{}',
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      connected_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guardian_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      last_active TIMESTAMPTZ NOT NULL,
      user_agent TEXT NOT NULL DEFAULT '',
      current BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE INDEX IF NOT EXISTS guardian_sessions_user_id_idx
      ON guardian_sessions(user_id);

    CREATE TABLE IF NOT EXISTS guardian_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS guardian_events_user_id_idx
      ON guardian_events(user_id);

    CREATE INDEX IF NOT EXISTS guardian_events_created_at_idx
      ON guardian_events(created_at DESC);
  `);

  console.log(
    'PostgreSQL store initialized'
  );
}

/* =========================
   CONNECTIONS
========================= */

export async function saveConnection(
  userId: string,
  connection: Connection
) {
  await pool.query(
    `
      INSERT INTO guardian_connections (
        user_id,
        profile,
        scopes,
        access_token,
        refresh_token,
        connected_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id)
      DO UPDATE SET
        profile = EXCLUDED.profile,
        scopes = EXCLUDED.scopes,
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        connected_at = EXCLUDED.connected_at
    `,
    [
      userId,
      JSON.stringify(connection.profile),
      connection.scopes,
      connection.accessToken,
      connection.refreshToken ?? null,
      connection.connectedAt
    ]
  );
}

export async function getConnection(
  userId: string
): Promise<Connection | undefined> {
  const result = await pool.query(
    `
      SELECT
        profile,
        scopes,
        access_token,
        refresh_token,
        connected_at
      FROM guardian_connections
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    return undefined;
  }

  const row = result.rows[0];

  return {
    profile: row.profile,
    scopes: row.scopes ?? [],
    accessToken: row.access_token,
    refreshToken:
      row.refresh_token ?? undefined,
    connectedAt:
      new Date(row.connected_at).toISOString()
  };
}

export async function deleteConnection(
  userId: string
) {
  await pool.query(
    `
      DELETE FROM guardian_connections
      WHERE user_id = $1
    `,
    [userId]
  );
}

/* =========================
   SESSIONS
========================= */

export async function createSession(
  userId: string,
  userAgent: string
): Promise<GuardianSession> {
  const id = crypto.randomUUID();

  const now = new Date();

  const session: GuardianSession = {
    id,
    createdAt: now.toISOString(),
    lastActive: now.toISOString(),
    userAgent,
    current: true
  };

  await pool.query(
    `
      INSERT INTO guardian_sessions (
        id,
        user_id,
        created_at,
        last_active,
        user_agent,
        current
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      session.id,
      userId,
      session.createdAt,
      session.lastActive,
      session.userAgent,
      session.current
    ]
  );

  return session;
}

export async function listSessions(
  userId: string
): Promise<GuardianSession[]> {
  const result = await pool.query(
    `
      SELECT
        id,
        created_at,
        last_active,
        user_agent,
        current
      FROM guardian_sessions
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    createdAt:
      new Date(row.created_at).toISOString(),
    lastActive:
      new Date(row.last_active).toISOString(),
    userAgent: row.user_agent,
    current: row.current
  }));
}

export async function hasSession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  const result = await pool.query(
    `
      SELECT 1
      FROM guardian_sessions
      WHERE user_id = $1
        AND id = $2
      LIMIT 1
    `,
    [userId, sessionId]
  );

  return result.rowCount !== null &&
    result.rowCount > 0;
}

export async function deleteSession(
  userId: string,
  sessionId: string
) {
  await pool.query(
    `
      DELETE FROM guardian_sessions
      WHERE user_id = $1
        AND id = $2
    `,
    [userId, sessionId]
  );
}

export async function deleteAllSessions(
  userId: string
) {
  await pool.query(
    `
      DELETE FROM guardian_sessions
      WHERE user_id = $1
    `,
    [userId]
  );
}

/* =========================
   EVENTS
========================= */

export async function addEvent(
  userId: string,
  type: string,
  status = 'success'
): Promise<GuardianEvent> {
  const event: GuardianEvent = {
    id: crypto.randomUUID(),
    type,
    status,
    createdAt: new Date().toISOString()
  };

  await pool.query(
    `
      INSERT INTO guardian_events (
        id,
        user_id,
        type,
        status,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [
      event.id,
      userId,
      event.type,
      event.status,
      event.createdAt
    ]
  );

  return event;
}

export async function listEvents(
  userId: string
): Promise<GuardianEvent[]> {
  const result = await pool.query(
    `
      SELECT
        id,
        type,
        status,
        created_at
      FROM guardian_events
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    createdAt:
      new Date(row.created_at).toISOString()
  }));
}