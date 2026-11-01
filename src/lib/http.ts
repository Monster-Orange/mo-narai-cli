import { NaraiError } from "./errors.js";

/** Every request the CLI makes: no redirects followed (a token never goes where it wasn't sent), a timeout. */
export async function send(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30_000), ...init });
  } catch (error) {
    throw new NaraiError(unreached(new URL(url).host, error), "network");
  }
}

// Node's certificate errors: a self-signed one, or a server that leaves out its chain
const UNTRUSTED = /^(UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT(_LOCALLY)?|SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|CERT_HAS_EXPIRED|ERR_TLS_CERT_ALTNAME_INVALID)$/;

/** fetch says only "fetch failed": the reason is its cause. */
function unreached(host: string, error: unknown): string {
  const cause = (error as { cause?: { code?: string; message?: string } }).cause;
  if (cause?.code && UNTRUSTED.test(cause.code)) return `${host}'s certificate isn't trusted (${cause.code}: ${cause.message ?? ""}); for a local Narai signed by your own CA, set NODE_EXTRA_CA_CERTS to that CA's file`;
  return `couldn't reach ${host}: ${cause?.message ?? (error as Error).message}`;
}
