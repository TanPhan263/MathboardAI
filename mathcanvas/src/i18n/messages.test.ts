import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import vi from "../../messages/vi.json";

/** Every key path in a message tree ("tutor.steps.next", …). */
function keys(tree: object, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) => (typeof v === "object" && v ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

describe("messages", () => {
  it("Vietnamese and English have the same keys", () => {
    expect(keys(vi).sort()).toEqual(keys(en).sort());
  });
});
