import { afterEach, describe, expect, it, vi } from "vitest";
import { send } from "../src/lib/http.js";

// Node's fetch says only "fetch failed"; why is in its cause. A certificate Node can't verify (a self-signed one, or a
// server that leaves out its chain) is the one a person can act on, so it's said.
describe("a request that doesn't reach Narai", () => {
  afterEach(() => vi.unstubAllGlobals());

  const failing = (cause: object) =>
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed", { cause })));

  it("says when the certificate isn't trusted", async () => {
    failing({ code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE", message: "unable to verify the first certificate" });
    await expect(send("https://narai.example/x")).rejects.toMatchObject({
      code: "network",
      message: expect.stringMatching(/narai\.example's certificate isn't trusted .*UNABLE_TO_VERIFY_LEAF_SIGNATURE.*NODE_EXTRA_CA_CERTS/),
    });
  });

  it("names the cause of any other failure", async () => {
    failing({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND narai.example" });
    await expect(send("https://narai.example/x")).rejects.toMatchObject({
      code: "network",
      message: expect.stringContaining("getaddrinfo ENOTFOUND narai.example"),
    });
  });
});
