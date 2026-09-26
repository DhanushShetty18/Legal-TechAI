import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONTRADICTION_EXAMPLE, findContradictions } from "./preview.ts";

describe("findContradictions", () => {
  it("flags the FIR example: same date, different city and amount", () => {
    const result = findContradictions(CONTRADICTION_EXAMPLE.a, CONTRADICTION_EXAMPLE.b);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(
      result.clashes.map((clash) => clash.kind),
      ["location", "amount"],
    );
    assert.deepEqual(result.matched, ["date"]);
  });

  it("rejects a blank paper", () => {
    const result = findContradictions("", "Location: Pune");
    assert.equal(result.ok, false);
  });

  it("says so when neither paper has a labeled fact", () => {
    const result = findContradictions("hello", "world");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.clashes.length, 0);
    assert.match(result.note, /No Location/);
  });
});
