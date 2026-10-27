import { describe, expect, it } from "vitest";
import { COMMANDS } from "../src/commands.js";

describe("the command map", () => {
  it("is what oclif loads", () => {
    expect(COMMANDS).toBeTypeOf("object");
  });
});
