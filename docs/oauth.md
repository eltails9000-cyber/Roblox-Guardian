# OAuth

The implementation uses the official Roblox OIDC discovery values: `https://apis.roblox.com/oauth/v1/authorize`, `/token`, `/token/introspect`, `/token/revoke`, and `/userinfo`. It requests only `openid profile`, uses Authorization Code with S256 PKCE, state, nonce, a strict configured redirect URI, and a backend-only client secret. Tokens are never returned to the browser.

Before production, register the exact redirect URI in Roblox Creator Dashboard and configure HTTPS. Verify current Roblox documentation before adding any additional scope or resource API.
