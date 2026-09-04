import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import {
  config,
  isRobloxConfigured
} from './config.js';

import {
  createAuthorizationUrl,
  exchangeCode,
  revokeToken
} from './roblox/oauth.js';

import {
  addEvent,
  createSession,
  deleteAllSessions,
  deleteConnection,
  deleteSession,
  getConnection,
  hasSession,
  listEvents,
  listSessions,
  saveConnection
} from './store.js';

const app = express();

/* =========================
   SECURITY
========================= */

app.use(helmet());

app.use(
  cors({
    origin: config.APP_URL,
    credentials: true
  })
);

app.use(
  express.json({
    limit: '50kb'
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true
  })
);

/* =========================
   CONSTANTS
========================= */

const guardianUser = 'local-demo-user';
const sessionCookie = 'guardian_session';

/* =========================
   SESSION HELPERS
========================= */

function getGuardianSession(
  request: express.Request
) {
  const cookie = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find(
      (part) =>
        part.startsWith(`${sessionCookie}=`)
    );

  return cookie
    ? decodeURIComponent(
        cookie.slice(
          sessionCookie.length + 1
        )
      )
    : null;
}

function isAuthenticated(
  request: express.Request
) {
  const sessionId =
    getGuardianSession(request);

  return Boolean(
    sessionId &&
      hasSession(
        guardianUser,
        sessionId
      )
  );
}

/* =========================
   NO CACHE
========================= */

app.use(
  (
    request,
    response,
    next
  ) => {
    response.setHeader(
      'Cache-Control',
      'no-store'
    );

    next();
  }
);

/* =========================
   HEALTH
========================= */

app.get(
  '/api/health',
  (_request, response) => {
    return response.json({
      ok: true,
      robloxConfigured:
        isRobloxConfigured
    });
  }
);

/* =========================
   ROBLOX OAUTH START
========================= */

app.get(
  '/api/oauth/start',
  (_request, response) => {
    const url =
      createAuthorizationUrl();

    if (!url) {
      return response
        .status(503)
        .json({
          code: 'NOT_CONFIGURED',
          message:
            'Roblox OAuth is not configured.'
        });
    }

    return response.redirect(url);
  }
);

/* =========================
   ROBLOX OAUTH CALLBACK
========================= */

app.get(
  '/api/oauth/callback',
  async (
    request,
    response
  ) => {
    const {
      code,
      state,
      error
    } = request.query;

    /* =========================
       OAUTH ERROR
    ========================= */

    if (error) {
      return response.redirect(
        `${config.APP_URL}/?error=authorization_cancelled`
      );
    }

    /* =========================
       VALIDATE CALLBACK
    ========================= */

    if (
      typeof code !== 'string' ||
      typeof state !== 'string'
    ) {
      return response.redirect(
        `${config.APP_URL}/?error=invalid_callback`
      );
    }

    try {
      /* =========================
         EXCHANGE OAUTH CODE
      ========================= */

      const result =
        await exchangeCode(
          code,
          state
        );

      /* =========================
         SAVE ROBLOX CONNECTION
      ========================= */

      saveConnection(
        guardianUser,
        {
          profile:
            result.profile,

          scopes: [
            ...(
              result.tokens.scope
                ?.split(' ') ??
              [
                'openid',
                'profile'
              ]
            )
          ],

          accessToken:
            result.tokens
              .access_token,

          refreshToken:
            result.tokens
              .refresh_token,

          connectedAt:
            new Date().toISOString()
        }
      );

      /* =========================
         CREATE GUARDIAN SESSION
      ========================= */

      const session =
        createSession(
          guardianUser,
          request.get(
            'user-agent'
          ) ??
            'Unknown browser'
        );

      /* =========================
         ACTIVITY EVENTS
      ========================= */

      addEvent(
        guardianUser,
        'OAuth authorization'
      );

      addEvent(
        guardianUser,
        'Guardian session created'
      );

      /* =========================
         SESSION COOKIE
      ========================= */

      const cookieParts = [
        `${sessionCookie}=${encodeURIComponent(
          session.id
        )}`,

        // Make cookie available
        // throughout the site.
        'Path=/',

        // JavaScript cannot access
        // the session cookie.
        'HttpOnly',

        // Required for the current
        // Cloudflare Pages -> Render
        // architecture.
        config.NODE_ENV === 'production'
          ? 'SameSite=None'
          : 'SameSite=Lax',

        // Session lasts 7 days.
        `Max-Age=${7 * 24 * 60 * 60}`
      ];

      /* =========================
         HTTPS COOKIE
      ========================= */

      if (
        config.NODE_ENV ===
        'production'
      ) {
        cookieParts.push(
          'Secure'
        );
      }

      response.setHeader(
        'Set-Cookie',
        cookieParts.join('; ')
      );

      /* =========================
         REDIRECT TO FRONTEND
      ========================= */

      return response.redirect(
        `${config.APP_URL}/dashboard`
      );

    } catch (error) {
      console.error(
        'oauth_callback_failed',
        error instanceof Error
          ? error.message
          : 'unknown'
      );

      const errorCode =
        error instanceof Error
          ? error.message
          : 'oauth_failed';

      return response.redirect(
        `${config.APP_URL}/?error=${encodeURIComponent(
          errorCode ===
            'invalid_state'
            ? 'invalid_state'
            : 'oauth_failed'
        )}`
      );
    }
  }
);

/* =========================
   CURRENT USER
========================= */

app.get(
  '/api/me',
  (
    request,
    response
  ) => {
    const connection =
      isAuthenticated(
        request
      )
        ? getConnection(
            guardianUser
          )
        : undefined;

    return response.json({
      connected:
        Boolean(connection),

      profile:
        connection?.profile ??
        null,

      scopes:
        connection?.scopes ??
        []
    });
  }
);

/* =========================
   DEBUG SESSION
========================= */

app.get(
  '/api/debug/session',
  (
    request,
    response
  ) => {
    const sessionId =
      getGuardianSession(
        request
      );

    return response.json({
      hasCookie:
        Boolean(sessionId),

      validSession:
        Boolean(
          sessionId &&
            hasSession(
              guardianUser,
              sessionId
            )
        ),

      cookieName:
        sessionCookie
    });
  }
);

/* =========================
   REVOKE ROBLOX CONNECTION
========================= */

app.post(
  '/api/oauth/revoke',
  async (
    request,
    response
  ) => {
    if (
      !isAuthenticated(
        request
      )
    ) {
      return response
        .status(401)
        .json({
          code: 'UNAUTHORIZED',
          message:
            'Guardian session required.'
        });
    }

    const connection =
      getConnection(
        guardianUser
      );

    if (connection) {
      await revokeToken(
        connection.refreshToken ??
          connection.accessToken
      );

      deleteConnection(
        guardianUser
      );

      addEvent(
        guardianUser,
        'OAuth revoked'
      );
    }

    return response
      .status(204)
      .end();
  }
);

/* =========================
   SESSIONS
========================= */

app.get(
  '/api/sessions',
  (
    request,
    response
  ) => {
    if (
      !isAuthenticated(
        request
      )
    ) {
      return response
        .status(401)
        .json({
          code: 'UNAUTHORIZED',
          message:
            'Guardian session required.'
        });
    }

    return response.json({
      sessions:
        listSessions(
          guardianUser
        )
    });
  }
);

app.delete(
  '/api/sessions/:id',
  (
    request,
    response
  ) => {
    if (
      !isAuthenticated(
        request
      )
    ) {
      return response
        .status(401)
        .json({
          code: 'UNAUTHORIZED',
          message:
            'Guardian session required.'
        });
    }

    deleteSession(
      guardianUser,
      request.params.id
    );

    addEvent(
      guardianUser,
      'Session terminated'
    );

    return response
      .status(204)
      .end();
  }
);

app.delete(
  '/api/sessions',
  (
    request,
    response
  ) => {
    if (
      !isAuthenticated(
        request
      )
    ) {
      return response
        .status(401)
        .json({
          code: 'UNAUTHORIZED',
          message:
            'Guardian session required.'
        });
    }

    deleteAllSessions(
      guardianUser
    );

    addEvent(
      guardianUser,
      'Session terminated'
    );

    return response
      .status(204)
      .end();
  }
);

/* =========================
   ACTIVITY
========================= */

app.get(
  '/api/activity',
  (
    request,
    response
  ) => {
    if (
      !isAuthenticated(
        request
      )
    ) {
      return response
        .status(401)
        .json({
          code: 'UNAUTHORIZED',
          message:
            'Guardian session required.'
        });
    }

    return response.json({
      events:
        listEvents(
          guardianUser
        )
    });
  }
);

/* =========================
   404
========================= */

app.use(
  (
    _request,
    response
  ) => {
    return response
      .status(404)
      .json({
        code: 'NOT_FOUND',
        message:
          'Resource not found.'
      });
  }
);

/* =========================
   ERROR HANDLER
========================= */

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(
      'request_failed',
      error instanceof Error
        ? error.message
        : 'unknown'
    );

    return response
      .status(500)
      .json({
        code: 'INTERNAL_ERROR',
        message:
          'Something went wrong.'
      });
  }
);

/* =========================
   SERVER
========================= */

app.listen(
  4000,
  () => {
    console.log(
      `Roblox Guardian backend listening on ${config.BACKEND_URL}`
    );
  }
);

export { app };