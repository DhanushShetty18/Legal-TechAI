import { describe, expect, it } from "vitest";

import {
  DIVORCE_CASE,
  DERIVABLE_FIELDS,
  FIELD_GROUPS,
  GIFT_DEED,
  GIFT_DEED_CHECKLIST,
  GIFT_DEED_FIELDS,
  SALE_DEED,
  SALE_DEED_CHECKLIST,
  SALE_DEED_FIELDS,
  allDocuments,
  checklistFor,
  fieldGroupsFor,
  fieldLabel,
  fieldsFor,
  isDraftable,
  missingRequiredFields,
} from "./caseTypes";

/** A fully-populated field set, matching the backend's test fixture. */
const FULL_FIELDS: Record<string, string> = Object.fromEntries(
  SALE_DEED_FIELDS.map((field) => [field.key, `value for ${field.key}`]),
);

const FULL_GIFT_FIELDS: Record<string, string> = Object.fromEntries(
  GIFT_DEED_FIELDS.map((field) => [field.key, `value for ${field.key}`]),
);

describe("case types", () => {
  it("offers the Sale Deed, the Gift Deed and the Divorce Case", () => {
    expect(checklistFor(SALE_DEED)).toBe(SALE_DEED_CHECKLIST);
    expect(checklistFor(GIFT_DEED)).toBe(GIFT_DEED_CHECKLIST);
    expect(checklistFor(DIVORCE_CASE).length).toBeGreaterThan(0);
  });

  it("drafts a document for the two deed types but not the Divorce Case", () => {
    expect(isDraftable(SALE_DEED)).toBe(true);
    expect(isDraftable(GIFT_DEED)).toBe(true);
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

  it("qualifies the Gift Deed's two parties the same way", () => {
    expect(fieldLabel("donor_name", GIFT_DEED)).toBe("Donor - Full Name");
    expect(fieldLabel("donee_name", GIFT_DEED)).toBe("Donee - Full Name");
  });

  it("leaves an unambiguous label alone", () => {
    expect(fieldLabel("boundary_east")).toBe("East");
    expect(fieldLabel("society_name", GIFT_DEED)).toBe(
      "Co-operative Housing Society",
    );
  });

  it("falls back to the key for something it does not know", () => {
    expect(fieldLabel("mystery_field")).toBe("mystery_field");
    // A Sale Deed key asked for under the Gift Deed is not that deed's field.
    expect(fieldLabel("vendor_name", GIFT_DEED)).toBe("vendor_name");
  });
});

describe("Gift Deed checklist", () => {
  it("covers identity, title, society clearances, stamp duty and witnesses", () => {
    expect(GIFT_DEED_CHECKLIST).toHaveLength(5);
    const joined = GIFT_DEED_CHECKLIST.map((p) => p.phase).join(" ").toLowerCase();
    for (const topic of [
      "identity",
      "relationship",
      "title",
      "society",
      "stamp duty",
      "witness",
    ]) {
      expect(joined).toContain(topic);
    }
  });

  it("gives every document a unique id", () => {
    const ids = allDocuments(GIFT_DEED).map((doc) => doc.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("asks for the documents a gift of society shares cannot proceed without", () => {
    const ids = allDocuments(GIFT_DEED)
      .filter((doc) => doc.required)
      .map((doc) => doc.id);
    for (const id of [
      "donor_id",
      "donee_id",
      "relationship_proof",
      "parent_agreement",
      "share_certificate",
      "society_noc",
      "stamp_duty_challan",
      "witness_ids",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("does not insist on documents that may not exist", () => {
    const optional = allDocuments(GIFT_DEED)
      .filter((doc) => !doc.required)
      .map((doc) => doc.id);
    expect(optional).toContain("heirs_noc");
    expect(optional).toContain("occupancy_certificate");
  });
});

describe("Gift Deed field set", () => {
  it("gives every field a unique key", () => {
    const keys = GIFT_DEED_FIELDS.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("groups the fields in the order the deed reads", () => {
    const groups = fieldGroupsFor(GIFT_DEED);
    expect(groups[0]).toBe("Execution");
    expect(groups[1]).toBe("Donor");
    expect(groups[2]).toBe("Donee");
    expect(groups[groups.length - 1]).toBe("Witnesses");
  });

  it("assigns every field to one of its own groups", () => {
    const groups = fieldGroupsFor(GIFT_DEED);
    for (const field of GIFT_DEED_FIELDS) {
      expect(groups).toContain(field.group);
    }
  });

  it("covers the parties, the relationship, the shares and the flat", () => {
    const keys = GIFT_DEED_FIELDS.map((field) => field.key);
    for (const key of [
      "donor_name",
      "donor_pan",
      "donor_aadhaar",
      "donee_name",
      "donee_relationship",
      "gift_share_percentage",
      "society_name",
      "share_certificate_no",
      "flat_number",
      "carpet_area",
      "witness_1_name",
    ]) {
      expect(keys).toContain(key);
    }
  });

  it("asks for no consideration, because a gift has none", () => {
    const keys = GIFT_DEED_FIELDS.map((field) => field.key);
    expect(keys).not.toContain("sale_consideration_amount");
    expect(keys).not.toContain("mode_of_payment");
  });

  it("tells the user the identifiers are printed whole", () => {
    for (const key of ["donor_aadhaar", "donee_aadhaar"]) {
      const field = GIFT_DEED_FIELDS.find((f) => f.key === key);
      expect(field?.helpText).toContain("in full");
    }
  });

  it("has no field set for a case type with no generator", () => {
    expect(fieldsFor(DIVORCE_CASE)).toEqual([]);
    expect(fieldsFor("Maritime Salvage")).toEqual([]);
  });
});

describe("missingRequiredFields for the Gift Deed", () => {
  it("is empty for a complete field set", () => {
    expect(missingRequiredFields(FULL_GIFT_FIELDS, GIFT_DEED)).toEqual([]);
  });

  it("asks for the Gift Deed's particulars, not the Sale Deed's", () => {
    const missing = missingRequiredFields({}, GIFT_DEED);
    expect(missing).toContain("donor_name");
    expect(missing).toContain("donee_relationship");
    expect(missing).toContain("share_certificate_no");
    expect(missing).not.toContain("vendor_name");
    expect(missing).not.toContain("sale_consideration_amount");
  });

  it("never asks for a recital the generator writes itself", () => {
    for (const key of missingRequiredFields({}, GIFT_DEED)) {
      expect(DERIVABLE_FIELDS.has(key)).toBe(false);
    }
    expect(missingRequiredFields({}, GIFT_DEED)).not.toContain("gift_recital");
  });

  it("still defaults to the Sale Deed when no case type is given", () => {
    expect(missingRequiredFields({})).toEqual(missingRequiredFields({}, SALE_DEED));
  });

  it("asks for nothing at all for a case type it cannot draft", () => {
    expect(missingRequiredFields({}, DIVORCE_CASE)).toEqual([]);
  });
});
