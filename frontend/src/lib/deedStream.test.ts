import { describe, expect, it } from "vitest";

import {
  BASE_CHARS_PER_TICK,
  DeedEvent,
  MAX_CHARS_PER_TICK,
  SSEDecoder,
  TypingSection,
  activeSectionId,
  applyEvent,
  backlogOf,
  charsPerTick,
  isCaughtUp,
  tick,
  toDeedSections,
  visibleText,
} from "./deedStream";

const frame = (event: DeedEvent) => `data: ${JSON.stringify(event)}\n\n`;

const section = (
  id: string,
  target: string,
  shown = 0,
): TypingSection => ({ id, style: "clause", heading: "1", target, shown });

describe("SSEDecoder", () => {
  it("decodes one complete frame", () => {
    const decoder = new SSEDecoder();
    const events = decoder.push(frame({ type: "notice", message: "hello" }));
    expect(events).toEqual([{ type: "notice", message: "hello" }]);
  });

  it("decodes several frames arriving in one chunk", () => {
    const decoder = new SSEDecoder();
    const events = decoder.push(
      frame({ type: "delta", id: "a", text: "x" }) +
        frame({ type: "delta", id: "a", text: "y" }),
    );
    expect(events).toHaveLength(2);
    expect(events.map((e) => (e as { text: string }).text)).toEqual(["x", "y"]);
  });

  it("holds back a frame that has not finished arriving", () => {
    const decoder = new SSEDecoder();
    expect(decoder.push('data: {"type":"notice",')).toEqual([]);
    const events = decoder.push('"message":"split"}\n\n');
    expect(events).toEqual([{ type: "notice", message: "split" }]);
  });

  it("survives a chunk boundary in the middle of every character", () => {
    // What a real connection does: arbitrary byte boundaries.
    const payload =
      frame({ type: "section", index: 0, id: "title", style: "title", heading: "" }) +
      frame({ type: "delta", id: "title", text: "SALE DEED" }) +
      frame({ type: "section_end", id: "title", body: "SALE DEED" });

    const decoder = new SSEDecoder();
    const collected: DeedEvent[] = [];
    for (const character of payload) collected.push(...decoder.push(character));
    collected.push(...decoder.flush());

    expect(collected.map((e) => e.type)).toEqual([
      "section",
      "delta",
      "section_end",
    ]);
  });

  it("ignores a malformed frame rather than failing the stream", () => {
    const decoder = new SSEDecoder();
    const events = decoder.push(
      "data: {not json at all}\n\n" + frame({ type: "notice", message: "ok" }),
    );
    expect(events).toEqual([{ type: "notice", message: "ok" }]);
  });

  it("ignores comment and retry lines", () => {
    const decoder = new SSEDecoder();
    expect(decoder.push(": keep-alive\n\nretry: 1000\n\n")).toEqual([]);
  });

  it("flushes a final frame that arrived without its blank line", () => {
    const decoder = new SSEDecoder();
    expect(decoder.push('data: {"type":"notice","message":"last"}')).toEqual([]);
    expect(decoder.flush()).toEqual([{ type: "notice", message: "last" }]);
  });

  it("flushes nothing when the buffer is empty", () => {
    expect(new SSEDecoder().flush()).toEqual([]);
  });
});

describe("applyEvent", () => {
  it("appends a new section", () => {
    const result = applyEvent([], {
      type: "section",
      index: 0,
      id: "title",
      style: "title",
      heading: "",
    });
    expect(result).toEqual([
      { id: "title", style: "title", heading: "", target: "", shown: 0 },
    ]);
  });

  it("does not add the same section twice", () => {
    const event: DeedEvent = {
      type: "section",
      index: 0,
      id: "title",
      style: "title",
      heading: "",
    };
    const once = applyEvent([], event);
    expect(applyEvent(once, event)).toBe(once);
  });

  it("accumulates deltas onto the right section", () => {
    let sections = applyEvent([], {
      type: "section",
      index: 0,
      id: "a",
      style: "clause",
      heading: "1",
    });
    sections = applyEvent(sections, { type: "delta", id: "a", text: "Hello " });
    sections = applyEvent(sections, { type: "delta", id: "a", text: "world" });
    expect(sections[0].target).toBe("Hello world");
  });

  it("ignores a delta for a section it has not seen", () => {
    const sections = [section("a", "x")];
    expect(applyEvent(sections, { type: "delta", id: "ghost", text: "y" })[0].target)
      .toBe("x");
  });

  it("repairs a section from the authoritative body on section_end", () => {
    const sections = [section("a", "Hello wor")];
    const repaired = applyEvent(sections, {
      type: "section_end",
      id: "a",
      body: "Hello world",
    });
    expect(repaired[0].target).toBe("Hello world");
  });

  it("leaves the sections alone for events that are not content", () => {
    const sections = [section("a", "x")];
    expect(applyEvent(sections, { type: "notice", message: "hi" })).toBe(sections);
  });
});

describe("charsPerTick", () => {
  it("reveals nothing when there is nothing pending", () => {
    expect(charsPerTick(0)).toBe(0);
    expect(charsPerTick(-5)).toBe(0);
  });

  it("uses the readable base rate for a small backlog", () => {
    expect(charsPerTick(10)).toBe(BASE_CHARS_PER_TICK);
  });

  it("accelerates as the backlog grows", () => {
    expect(charsPerTick(3000)).toBeGreaterThan(charsPerTick(300));
  });

  it("never exceeds the ceiling, even for a ten page backlog", () => {
    expect(charsPerTick(200_000)).toBe(MAX_CHARS_PER_TICK);
  });

  it("finishes a seven page deed in well under a minute", () => {
    // ~12,000 characters is about seven printed pages of the deed.
    let pending = 12_000;
    let frames = 0;
    while (pending > 0 && frames < 100_000) {
      pending -= charsPerTick(pending);
      frames += 1;
    }
    expect(pending).toBeLessThanOrEqual(0);
    expect(frames / 60).toBeLessThan(60);
  });
});

describe("tick", () => {
  it("reveals characters from the first pending section", () => {
    const result = tick([section("a", "abcdef")], 3);
    expect(visibleText(result[0])).toBe("abc");
  });

  it("does not run past the end of a section", () => {
    const result = tick([section("a", "abc")], 50);
    expect(result[0].shown).toBe(3);
  });

  it("spills a leftover budget into the following section", () => {
    const result = tick([section("a", "abc"), section("b", "defgh")], 5);
    expect(result[0].shown).toBe(3);
    expect(visibleText(result[1])).toBe("de");
  });

  it("fills sections in reading order", () => {
    const result = tick([section("a", "abcdef"), section("b", "xyz")], 2);
    expect(result[1].shown).toBe(0);
  });

  it("returns the same array when there is nothing to do", () => {
    const sections = [section("a", "abc", 3)];
    expect(tick(sections, 10)).toBe(sections);
    expect(tick(sections, 0)).toBe(sections);
  });

  it("types out a whole document one frame at a time", () => {
    let sections = [section("a", "WHEREAS the Vendor"), section("b", "AND WHEREAS")];
    let guard = 0;
    while (!isCaughtUp(sections) && guard < 1000) {
      sections = tick(sections, charsPerTick(backlogOf(sections)));
      guard += 1;
    }
    expect(isCaughtUp(sections)).toBe(true);
    expect(visibleText(sections[0])).toBe("WHEREAS the Vendor");
    expect(visibleText(sections[1])).toBe("AND WHEREAS");
  });
});

describe("backlogOf / isCaughtUp", () => {
  it("counts every pending character", () => {
    expect(backlogOf([section("a", "abc"), section("b", "de", 1)])).toBe(4);
  });

  it("is caught up only when every section is fully shown", () => {
    expect(isCaughtUp([section("a", "abc", 3)])).toBe(true);
    expect(isCaughtUp([section("a", "abc", 2)])).toBe(false);
    expect(isCaughtUp([])).toBe(true);
  });
});

describe("activeSectionId", () => {
  it("points at the section still being typed", () => {
    expect(activeSectionId([section("a", "abc", 3), section("b", "de", 1)])).toBe("b");
  });

  it("rests on the last section once everything is typed", () => {
    expect(activeSectionId([section("a", "abc", 3), section("b", "de", 2)])).toBe("b");
  });

  it("is null before anything has arrived", () => {
    expect(activeSectionId([])).toBeNull();
  });
});

describe("toDeedSections", () => {
  it("hands over the full text, not just what is on screen", () => {
    // What gets exported is the whole deed, even mid-animation.
    expect(toDeedSections([section("a", "full body", 2)])).toEqual([
      { id: "a", style: "clause", heading: "1", body: "full body" },
    ]);
  });
});
