import createClient from "openapi-fetch";
import { bearer } from "../auth/session.js";
import { AuthError, ExitCode, NaraiError } from "../lib/errors.js";
import type { components, paths } from "../generated/api.js";

export type Registry = ReturnType<typeof createClient<paths>>;
export type Refusal = components["schemas"]["Refusal"];

/** The registry's client, generated from its OpenAPI (src/generated/api.ts): every call with the session's (or
 *  NARAI_TOKEN's) bearer token, no redirects followed. */
export function registry(naraiUrl: string): Registry {
  const client = createClient<paths>({ baseUrl: naraiUrl, redirect: "manual" });
  client.use({
    async onRequest({ request }) {
      request.headers.set("authorization", `Bearer ${await bearer(naraiUrl)}`);
      return request;
    },
  });
  return client;
}

/** A refusal as the CLI reports it: 401/403 exit 3 (auth); a 404 says the registry may be off; 422 carries reasons. */
export function refused(response: Response, error: unknown, what: string): NaraiError {
  const body = (error ?? {}) as Partial<Refusal> & { detail?: unknown };
  const code = typeof body.error === "string" ? body.error : `http_${response.status}`;
  const message = typeof body.message === "string" ? body.message : `HTTP ${response.status}`;
  const details: Record<string, unknown> = { status: response.status };
  if (Array.isArray(body.reasons)) details["reasons"] = body.reasons;
  if (response.status === 401) return new AuthError(`${what}: not signed in, or the session ended (${message}); run narai login`, code);
  if (response.status === 403) return new NaraiError(`${what}: not allowed (${message})`, code, ExitCode.auth, details);
  return new NaraiError(`${what}: ${message}`, code, ExitCode.error, details);
}

/** The data of a call that must succeed, or its refusal. */
export async function ok<T>(call: Promise<{ data?: T | undefined; error?: unknown; response: Response }>, what: string): Promise<T> {
  const { data, error, response } = await call;
  if (!response.ok || data === undefined) throw refused(response, error, what);
  return data;
}

/** The data of a lookup, null when it isn't there (404 not_found), else its refusal. */
export async function found<T>(call: Promise<{ data?: T | undefined; error?: unknown; response: Response }>, what: string): Promise<T | null> {
  const { data, error, response } = await call;
  if (response.status === 404 && (error as Partial<Refusal> | undefined)?.error !== "tools_unavailable") return null;
  if (!response.ok || data === undefined) throw refused(response, error, what);
  return data;
}
