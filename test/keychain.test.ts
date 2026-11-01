import { describe, expect, it, vi } from "vitest";

// A Linux machine with no Secret Service fails as the entry is made, not only when it's read: that's still "no
// keychain here, use NARAI_TOKEN", never an unexpected error.
vi.mock("@napi-rs/keyring", () => ({
  AsyncEntry: function AsyncEntry() {
    throw new Error("Couldn't access platform storage: PermissionDenied");
  },
}));

describe("a machine without a keychain", () => {
  it("says so, and what to use instead", async () => {
    const { keychain } = await import("../src/lib/credentials.js");
    await expect(keychain.get("https://narai.example")).rejects.toMatchObject({
      code: "keychain_unavailable",
      message: expect.stringContaining("NARAI_TOKEN"),
    });
  });
});
