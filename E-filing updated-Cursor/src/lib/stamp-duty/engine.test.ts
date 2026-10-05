import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateStampDuty } from "./engine.ts";

const base = {
  state: "maharashtra",
  propertyValue: "5000000",
  gender: "male",
  propertyType: "residential",
  transactionType: "sale",
};

describe("calculateStampDuty", () => {
  it("calculates a Maharashtra male sale", () => {
    const result = calculateStampDuty(base);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rate, 6);
    assert.equal(result.stampDuty, 300000);
    assert.equal(result.registration, 50000);
    assert.equal(result.total, 350000);
  });

  it("uses the female rate", () => {
    const result = calculateStampDuty({ ...base, gender: "female" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rate, 5);
    assert.equal(result.stampDuty, 250000);
  });

  it("accepts Indian comma grouping", () => {
    const result = calculateStampDuty({ ...base, propertyValue: "50,00,000" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.propertyValue, 5000000);
    assert.equal(result.total, 350000);
  });

  it("adds 1 point for commercial, then gift, and lease wins last", () => {
    const commercialGift = calculateStampDuty({
      ...base,
      propertyValue: "1000000",
      propertyType: "commercial",
      transactionType: "gift",
    });
    assert.equal(commercialGift.ok, true);
    if (!commercialGift.ok) return;
    assert.equal(commercialGift.rate, 5);
    assert.equal(commercialGift.stampDuty, 50000);

    const commercialLease = calculateStampDuty({
      ...base,
      propertyValue: "1000000",
      propertyType: "commercial",
      transactionType: "lease",
    });
    assert.equal(commercialLease.ok, true);
    if (!commercialLease.ok) return;
    assert.equal(commercialLease.rate, 1);
    assert.equal(commercialLease.stampDuty, 10000);
  });

  it("uses Kerala registration at 2% and Telangana industrial at 0.5%", () => {
    const kerala = calculateStampDuty({
      ...base,
      state: "kerala",
      gender: "female",
      propertyType: "agricultural",
      propertyValue: "100000",
    });
    assert.equal(kerala.ok, true);
    if (!kerala.ok) return;
    assert.equal(kerala.stampDuty, 8000);
    assert.equal(kerala.registration, 2000);

    const telangana = calculateStampDuty({
      ...base,
      state: "telangana",
      gender: "joint",
      propertyType: "industrial",
      propertyValue: "200000",
    });
    assert.equal(telangana.ok, true);
    if (!telangana.ok) return;
    assert.equal(telangana.rate, 5);
    assert.equal(telangana.registration, 1000);
    assert.equal(telangana.total, 11000);
  });

  it("rejects blank, zero, words, and an unknown state", () => {
    assert.equal(calculateStampDuty({ ...base, propertyValue: "   " }).ok, false);
    assert.equal(calculateStampDuty({ ...base, propertyValue: "0" }).ok, false);
    assert.equal(calculateStampDuty({ ...base, propertyValue: "-5" }).ok, false);
    assert.equal(calculateStampDuty({ ...base, propertyValue: "50 lakh" }).ok, false);
    const unknown = calculateStampDuty({ ...base, state: "goa" });
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.equal(unknown.field, "state");
  });
});
