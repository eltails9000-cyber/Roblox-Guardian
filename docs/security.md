# Security

Secrets belong only in backend environment variables. Production must use a random `SESSION_SECRET`, HTTPS, secure HttpOnly cookies, PostgreSQL encryption at rest, encrypted OAuth tokens, structured redacted logs, CSRF protection for cookie-authenticated mutations, and a persistent session store. Email verification codes must be hashed, single-use, rate limited, and time limited. Guardian alerts do not claim to monitor Roblox logins.
