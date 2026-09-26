import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HYDRATION_EXAMPLE, hydrateCourtForm } from "./hydrate.ts";

describe("hydrateCourtForm", () => {
  it("fills every field from the example note", () => {
    const result = hydrateCourtForm(HYDRATION_EXAMPLE);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.fields.name, "Asha Rao");
    assert.equal(result.fields.aadhaar, "1234 5678 9012");
    assert.equal(result.fields.documentType, "Sale deed");
    assert.deepEqual(result.problems, []);
  });

  it("rejects a blank note and an unlabeled note", () => {
    assert.equal(hydrateCourtForm("   ").ok, false);
    assert.equal(hydrateCourtForm("hello there").ok, false);
  });

  it("keeps a short Aadhaar and reports the problem", () => {
    const result = hydrateCourtForm("Name: Asha Rao\nAadhaar: 12345");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.problems.join(" "), /12 digits/);
  });
});
