import { describe, expect, it } from "vitest";

import {
  canCapture,
  documentStateAfterExtraction,
  downloadStem,
  toAmountInputValue,
  toDateInputValue,
} from "./filingHelpers";

describe("canCapture", () => {
  it("allows capture once the video has a frame", () => {
    expect(canCapture({ videoWidth: 1280, videoHeight: 720 })).toEqual({ ok: true });
  });

  it("explains itself instead of silently doing nothing", () => {
    const check = canCapture({ videoWidth: 0, videoHeight: 0 });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).not.toBe("");
  });

  it("handles a missing video element", () => {
    expect(canCapture(null).ok).toBe(false);
  });
});

describe("documentStateAfterExtraction", () => {
  const good = { status: "Uploaded" as const, fields: { vendor_pan: "ABCDE1234F" } };

  it("keeps earlier fields when a re-read fails", () => {
    const next = documentStateAfterExtraction(good, {}, "network error");
    expect(next.fields).toEqual({ vendor_pan: "ABCDE1234F" });
    expect(next.error).toBe("network error");
  });

  it("replaces fields when the re-read succeeds", () => {
    const next = documentStateAfterExtraction(good, { vendor_pan: "NEW" }, null);
    expect(next.fields).toEqual({ vendor_pan: "NEW" });
  });

  it("stores the empty result on a first failed read", () => {
    expect(documentStateAfterExtraction(undefined, {}, "x").fields).toEqual({});
  });
});

describe("downloadStem", () => {
  it("keeps Devanagari", () => {
    expect(downloadStem("कडरी रोड", "Sale-Deed")).toBe("कडरी-रोड");
  });

  it("never returns an empty stem", () => {
    expect(downloadStem("!!!", "")).toBe("Deed");
  });

  it("falls back when the title is blank", () => {
    expect(downloadStem("  ", "Sale-Deed-Ramesh")).toBe("Sale-Deed-Ramesh");
  });
});

describe("toDateInputValue", () => {
  it.each([
    ["2026-09-30", "2026-09-30"],
    ["30-09-2026", "2026-09-30"],
    ["30/09/2026", "2026-09-30"],
    ["1.2.2026", "2026-02-01"],
    ["thirtieth September", ""],
    ["45/13/2026", ""],
    ["", ""],
  ])("%s -> %s", (input, expected) => {
    expect(toDateInputValue(input)).toBe(expected);
  });
});

describe("toAmountInputValue", () => {
  it.each([
    ["Rs. 45,00,000/-", "4500000"],
    ["45,00,000", "4500000"],
    ["4500000", "4500000"],
    ["₹ 12,50,000.50", "1250000.5"],
    ["no figure", ""],
  ])("%s -> %s", (input, expected) => {
    expect(toAmountInputValue(input)).toBe(expected);
  });
});
