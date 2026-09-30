import { describe, expect, it } from "vitest";

import {
  DIVORCE_CASE,
  DERIVABLE_FIELDS,
  FIELD_GROUPS,
  SALE_DEED,
  SALE_DEED_CHECKLIST,
  SALE_DEED_FIELDS,
  allDocuments,
  checklistFor,
  fieldLabel,
  isDraftable,
  missingRequiredFields,
} from "./caseTypes";

/** A fully-populated field set, matching the backend's test fixture. */
const FULL_FIELDS: Record<string, string> = Object.fromEntries(
  SALE_DEED_FIELDS.map((field) => [field.key, `value for ${field.key}`]),
);

describe("case types", () => {
  it("offers both the Sale Deed and the Divorce Case", () => {
    expect(checklistFor(SALE_DEED)).toBe(SALE_DEED_CHECKLIST);
    expect(checklistFor(DIVORCE_CASE).length).toBeGreaterThan(0);
  });

  it("only drafts a document for the Sale Deed", () => {
    expect(isDraftable(SALE_DEED)).toBe(true);
    expect(isDraftable(DIVORCE_CASE)).toBe(false);
  });

  it("has no checklist for an unknown case type", () => {
    expect(checklistFor("Maritime Salvage")).toEqual([]);
    expect(allDocuments("Maritime Salvage")).toEqual([]);
  });

  it("covers every phase of a conveyance", () => {
    expect(SALE_DEED_CHECKLIST).toHaveLength(5);
    const joined = SALE_DEED_CHECKLIST.map((p) => p.phase).join(" ").toLowerCase();
    for (const topic of ["identity", "title", "clearance", "stamp duty", "witness"]) {
      expect(joined).toContain(topic);
    }
  });

  it("gives every document a unique id", () => {
    const ids = allDocuments(SALE_DEED).map((doc) => doc.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every document in every case type a unique id", () => {
    const ids = allDocuments(DIVORCE_CASE).map((doc) => doc.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks the documents a conveyance cannot proceed without", () => {
    const required = allDocuments(SALE_DEED).filter((doc) => doc.required);
    const ids = required.map((doc) => doc.id);
    expect(ids).toContain("vendor_id");
    expect(ids).toContain("parent_sale_deed");
    expect(ids).toContain("encumbrance_certificate");
    expect(ids).toContain("witness_ids");
  });
});

describe("Sale Deed field set", () => {
  it("gives every field a unique key", () => {
    const keys = SALE_DEED_FIELDS.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("assigns every field to a known group", () => {
    for (const field of SALE_DEED_FIELDS) {
      expect(FIELD_GROUPS).toContain(field.group);
    }
  });

  it("groups the fields in the order the deed reads", () => {
    expect(FIELD_GROUPS[0]).toBe("Execution");
    expect(FIELD_GROUPS[FIELD_GROUPS.length - 1]).toBe("Witnesses");
  });

  it("covers both parties, the title, the consideration and the schedule", () => {
    const keys = SALE_DEED_FIELDS.map((field) => field.key);
    for (const key of [
      "vendor_name",
      "vendor_pan",
      "purchaser_name",
      "prior_deed_document_no",
      "sale_consideration_amount",
      "property_description",
      "boundary_east",
      "witness_1_name",
    ]) {
      expect(keys).toContain(key);
    }
  });
});

describe("missingRequiredFields", () => {
  it("is empty for a complete field set", () => {
    expect(missingRequiredFields(FULL_FIELDS)).toEqual([]);
  });

  it("lists everything the user must supply when nothing was read", () => {
    const missing = missingRequiredFields({});
    expect(missing).toContain("vendor_name");
    expect(missing).toContain("boundary_east");
    expect(missing.length).toBeGreaterThan(10);
  });

  it("never asks for a particular the generator writes itself", () => {
    for (const key of missingRequiredFields({})) {
      expect(DERIVABLE_FIELDS.has(key)).toBe(false);
    }
  });

  it("treats whitespace as missing", () => {
    expect(missingRequiredFields({ ...FULL_FIELDS, vendor_name: "   " }))
      .toEqual(["vendor_name"]);
  });

  it("does not ask again once a particular is supplied", () => {
    const before = missingRequiredFields({});
    const after = missingRequiredFields({ vendor_name: "Ramesh Kumar" });
    expect(after).toHaveLength(before.length - 1);
    expect(after).not.toContain("vendor_name");
  });
});

describe("fieldLabel", () => {
  it("qualifies a label that exists for both parties", () => {
    expect(fieldLabel("vendor_name")).toBe("Vendor - Full Name");
    expect(fieldLabel("purchaser_name")).toBe("Purchaser - Full Name");
  });

  it("leaves an unambiguous label alone", () => {
    expect(fieldLabel("boundary_east")).toBe("East");
  });

  it("falls back to the key for something it does not know", () => {
    expect(fieldLabel("mystery_field")).toBe("mystery_field");
  });
});
