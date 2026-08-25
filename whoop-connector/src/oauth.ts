/**
 * WHOOP OAuth2 authorization-code flow. /authorize kicks it off, /callback exchanges the
 * code, and getValidAccessToken() transparently refreshes on expiry for every MCP tool call.
 * Single-user system: one KV key holds the one connected account's tokens.
 */
import { loadTokens, saveTokens, type WhoopTokens } from "./token-store";

const AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const SCOPES = "read:sleep read:recovery read:cycles read:workout read:profile offline";
const EXPIRY_SKEW_MS = 60_000; // refresh a minute before actual expiry

export interface WhoopEnv {
  TOKENS: KVNamespace;
  WHOOP_CLIENT_ID: string;
  WHOOP_CLIENT_SECRET: string;
  // Durable Object binding McpAgent.serve() uses by default — see wrangler.toml.
  MCP_OBJECT: DurableObjectNamespace;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function redirectUri(url: URL): string {
  return `${url.origin}/callback`;
}

export function handleAuthorize(request: Request, env: WhoopEnv): Response {
  const url = new URL(request.url);
  const authorizeUrl = new URL(AUTH_URL);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", env.WHOOP_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri(url));
  authorizeUrl.searchParams.set("scope", SCOPES);
  authorizeUrl.searchParams.set("state", crypto.randomUUID());
  return Response.redirect(authorizeUrl.toString(), 302);
}

export async function handleCallback(request: Request, env: WhoopEnv): Promise<Response> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    return new Response(`WHOOP authorization failed: ${error}`, { status: 400 });
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return new Response("Missing ?code on WHOOP callback.", { status: 400 });
  }

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: env.WHOOP_CLIENT_ID,
      client_secret: env.WHOOP_CLIENT_SECRET,
      redirect_uri: redirectUri(url),
    }),
  });
  if (!resp.ok) {
    return new Response(`Token exchange failed (${resp.status}): ${await resp.text()}`, {
      status: 502,
    });
  }

  const json = (await resp.json()) as TokenResponse;
  await saveTokens(env.TOKENS, {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
  });

  return new Response(
    "WHOOP connected. You can close this tab.\n\n" +
      "Next: add this Worker's /mcp URL as a custom connector in Claude's connector settings.",
    { headers: { "Content-Type": "text/plain" } }
  );
}

async function refresh(env: WhoopEnv, tokens: WhoopTokens): Promise<WhoopTokens> {
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: env.WHOOP_CLIENT_ID,
      client_secret: env.WHOOP_CLIENT_SECRET,
      scope: SCOPES,
    }),
  });
  if (!resp.ok) {
    throw new Error(`WHOOP token refresh failed (${resp.status}): ${await resp.text()}`);
  }
  const json = (await resp.json()) as TokenResponse;
  const next: WhoopTokens = {
    access_token: json.access_token,
    // WHOOP may or may not rotate the refresh token on refresh; keep the old one if absent.
    refresh_token: json.refresh_token ?? tokens.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
  };
  await saveTokens(env.TOKENS, next);
  return next;
}

export async function getValidAccessToken(env: WhoopEnv): Promise<string> {
  const tokens = await loadTokens(env.TOKENS);
  if (!tokens) {
    throw new Error(
      "WHOOP is not connected yet. Visit this Worker's /authorize URL once to complete OAuth."
    );
  }
  if (Date.now() > tokens.expires_at - EXPIRY_SKEW_MS) {
    const refreshed = await refresh(env, tokens);
    return refreshed.access_token;
  }
  return tokens.access_token;
}
