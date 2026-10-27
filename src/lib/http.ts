import { NaraiError } from "./errors.js";

/** Every request the CLI makes: no redirects followed (a token never goes where it wasn't sent), a timeout. */
export async function send(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30_000), ...init });
  } catch (error) {
    throw new NaraiError(`couldn't reach ${new URL(url).host}: ${(error as Error).message}`, "network");
  }
}
