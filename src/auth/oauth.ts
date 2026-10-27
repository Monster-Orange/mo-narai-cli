// Narai's OAuth 2.1 authorization server, as a public native client (RFC 8252): authorization code + PKCE (S256) +
// state, the response's issuer checked (RFC 9207), tokens for the tools API only (RFC 8707), refresh tokens that
// rotate on every use, revocation on sign-out (RFC 7009). The client is identified by its metadata document (CIMD).

import { createHash, randomBytes } from "node:crypto";
import { NaraiError } from "../lib/errors.js";
import { send } from "../lib/http.js";

/** What a developer's session may do: the dev scopes of the registry (mo-narai-sdk schema/scopes.json). */
export const SCOPES = ["dev:tools.read", "dev:tools.write", "dev:versions.upload", "dev:launch"] as const;

export const clientId = (naraiUrl: string): string => `${naraiUrl}/oauth/clients/narai-cli.json`;
export const resource = (naraiUrl: string): string => `${naraiUrl}/api/tools`;

export interface ServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint: string;
  iss_parameter: boolean;
}

export class OAuthError extends NaraiError {
  constructor(readonly error: string, description: string, exitCode = 3) {
    super(`sign-in failed: ${error}${description ? ` (${description})` : ""}`, `oauth_${error}`, exitCode);
  }
}

/** RFC 8414. The issuer is Narai's own address byte for byte, and every endpoint is on it: a document that points
 *  the code or the refresh token anywhere else is refused, not followed. */
export async function discover(naraiUrl: string): Promise<ServerMetadata> {
  const response = await send(`${naraiUrl}/.well-known/oauth-authorization-server`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new NaraiError(`${naraiUrl} has no sign-in (HTTP ${response.status})`, "oauth_metadata_missing");
  const doc = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (doc["issuer"] !== naraiUrl) throw new NaraiError(`${naraiUrl} names another issuer; not signing in`, "oauth_issuer_mismatch");
  const endpoint = (field: string): string => {
    const value = doc[field];
    if (typeof value !== "string" || new URL(value).origin !== naraiUrl) {
      throw new NaraiError(`${naraiUrl}'s ${field} is missing or not on ${naraiUrl}`, "oauth_metadata_invalid");
    }
    return value;
  };
  const methods = doc["code_challenge_methods_supported"];
  if (!Array.isArray(methods) || !methods.includes("S256")) throw new NaraiError(`${naraiUrl} doesn't do PKCE S256`, "oauth_metadata_invalid");
  return {
    issuer: naraiUrl,
    authorization_endpoint: endpoint("authorization_endpoint"),
    token_endpoint: endpoint("token_endpoint"),
    revocation_endpoint: endpoint("revocation_endpoint"),
    iss_parameter: doc["authorization_response_iss_parameter_supported"] === true,
  };
}

export interface Pkce { verifier: string; challenge: string }

export function pkce(): Pkce {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export const newState = (): string => randomBytes(32).toString("base64url");

export function authorizationUrl(meta: ServerMetadata, p: { naraiUrl: string; redirectUri: string; challenge: string; state: string }): string {
  const url = new URL(meta.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId(p.naraiUrl),
    redirect_uri: p.redirectUri,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
    scope: SCOPES.join(" "),
    state: p.state,
    resource: resource(p.naraiUrl),
  }).toString();
  return url.toString();
}

export interface TokenSet { accessToken: string; refreshToken: string; expiresIn: number; scopes: string[] }

async function tokenRequest(meta: ServerMetadata, form: Record<string, string>): Promise<TokenSet> {
  const response = await send(meta.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const error = typeof body?.["error"] === "string" ? body["error"] : `http_${response.status}`;
    throw new OAuthError(error, typeof body?.["error_description"] === "string" ? body["error_description"] : "");
  }
  if (typeof body?.["access_token"] !== "string" || typeof body["refresh_token"] !== "string" || typeof body["expires_in"] !== "number"
    || String(body["token_type"]).toLowerCase() !== "bearer") {
    throw new NaraiError("the token endpoint answered without a bearer token and a refresh token", "oauth_bad_response");
  }
  const scopes = typeof body["scope"] === "string" ? body["scope"].split(" ").filter(Boolean) : [];
  return { accessToken: body["access_token"], refreshToken: body["refresh_token"], expiresIn: body["expires_in"], scopes };
}

export function exchangeCode(meta: ServerMetadata, p: { naraiUrl: string; code: string; verifier: string; redirectUri: string }): Promise<TokenSet> {
  return tokenRequest(meta, {
    grant_type: "authorization_code", client_id: clientId(p.naraiUrl), code: p.code, code_verifier: p.verifier,
    redirect_uri: p.redirectUri, resource: resource(p.naraiUrl),
  });
}

/** Rotation: the answer carries a new refresh token and the old one is dead; store the new one before anything else. */
export function refresh(meta: ServerMetadata, p: { naraiUrl: string; refreshToken: string }): Promise<TokenSet> {
  return tokenRequest(meta, { grant_type: "refresh_token", client_id: clientId(p.naraiUrl), refresh_token: p.refreshToken, resource: resource(p.naraiUrl) });
}

export async function revoke(meta: ServerMetadata, p: { naraiUrl: string; token: string }): Promise<void> {
  const response = await send(meta.revocation_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: p.token, token_type_hint: "refresh_token", client_id: clientId(p.naraiUrl) }).toString(),
  });
  if (!response.ok) throw new NaraiError(`Narai didn't revoke the session (HTTP ${response.status})`, "oauth_revoke_failed");
}
