/**
 * Client side of the live generation stream.
 *
 * The backend sends the deed as Server-Sent Events. The typing animation is
 * driven here rather than by the arrival of those events, because network
 * chunking is jittery and a document that types in bursts does not read as
 * writing. The stream fills a target buffer; the animation drains it at a
 * steady, readable rate, accelerating only when it falls a long way behind.
 */

export type DeedEvent =
  | { type: "status"; step: string; message: string }
  | { type: "meta"; sectionCount: number; estimatedPages: number; clauseCount: number }
  | { type: "section"; index: number; id: string; style: string; heading: string }
  | { type: "delta"; id: string; text: string }
  | { type: "section_end"; id: string; body: string }
  | { type: "done"; sections: DeedSection[]; plainText: string; estimatedPages: number; source: string; missingRequired: string[] }
  | { type: "warning"; message: string; missingRequired: string[] }
  | { type: "notice"; message: string }
  | { type: "error"; message: string };

export interface DeedSection {
  id: string;
  style: string;
  heading: string;
  body: string;
}

/** A section mid-animation: `target` is what has arrived, `shown` how much of it is on screen. */
export interface TypingSection {
  id: string;
  style: string;
  heading: string;
  target: string;
  shown: number;
}

/**
 * Incremental SSE decoder.
 *
 * Kept separate from the fetch loop so it can be driven from a test with
 * arbitrary chunk boundaries - including boundaries that fall inside a single
 * JSON payload, which is what actually happens over a real connection.
 */
export class SSEDecoder {
  private buffer = "";

  push(chunk: string): DeedEvent[] {
    this.buffer += chunk;
    const events: DeedEvent[] = [];

    // Events are separated by a blank line. Anything after the last separator
    // is an incomplete event and stays in the buffer.
    let separator = this.buffer.indexOf("\n\n");
    while (separator !== -1) {
      const block = this.buffer.slice(0, separator);
      this.buffer = this.buffer.slice(separator + 2);
      const event = parseEventBlock(block);
      if (event) events.push(event);
      separator = this.buffer.indexOf("\n\n");
    }
    return events;
  }

  /** Flush a final event that arrived without its trailing blank line. */
  flush(): DeedEvent[] {
    const remaining = this.buffer.trim();
    this.buffer = "";
    if (!remaining) return [];
    const event = parseEventBlock(remaining);
    return event ? [event] : [];
  }
}

function parseEventBlock(block: string): DeedEvent | null {
  const payload = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!payload) return null;
  try {
    return JSON.parse(payload) as DeedEvent;
  } catch {
    // A malformed frame must not take the whole generation down.
    return null;
  }
}

/** Apply a stream event to the section list being animated. */
export function applyEvent(
  sections: TypingSection[],
  event: DeedEvent,
): TypingSection[] {
  if (event.type === "section") {
    if (sections.some((s) => s.id === event.id)) return sections;
    return [
      ...sections,
      { id: event.id, style: event.style, heading: event.heading, target: "", shown: 0 },
    ];
  }

  if (event.type === "delta") {
    return sections.map((section) =>
      section.id === event.id
        ? { ...section, target: section.target + event.text }
        : section,
    );
  }

  if (event.type === "section_end") {
    // The authoritative body, in case a delta was dropped.
    return sections.map((section) =>
      section.id === event.id ? { ...section, target: event.body } : section,
    );
  }

  return sections;
}

export const BASE_CHARS_PER_TICK = 7;
export const MAX_CHARS_PER_TICK = 90;

/**
 * How many characters to reveal this frame.
 *
 * A 5-10 page deed is 10,000+ characters. At the base rate that reads as
 * writing, but if the backend has run far ahead - or the tab was backgrounded
 * - the animation speeds up rather than leaving the user watching a queue
 * drain for minutes.
 */
export function charsPerTick(backlog: number): number {
  if (backlog <= 0) return 0;
  const accelerated = BASE_CHARS_PER_TICK + Math.floor(backlog / 60);
  return Math.min(MAX_CHARS_PER_TICK, Math.max(BASE_CHARS_PER_TICK, accelerated));
}

export function backlogOf(sections: TypingSection[]): number {
  return sections.reduce(
    (total, section) => total + (section.target.length - section.shown),
    0,
  );
}

/**
 * Advance the animation by one frame.
 *
 * Characters are spent on the earliest section that still has text pending, so
 * the deed always fills in reading order, and spill over into the next section
 * within the same frame so the rate stays steady across section boundaries.
 */
export function tick(sections: TypingSection[], budget: number): TypingSection[] {
  if (budget <= 0) return sections;

  let remaining = budget;
  let changed = false;
  const next = sections.map((section) => {
    if (remaining <= 0 || section.shown >= section.target.length) return section;
    const spend = Math.min(remaining, section.target.length - section.shown);
    remaining -= spend;
    changed = true;
    return { ...section, shown: section.shown + spend };
  });

  return changed ? next : sections;
}

export function isCaughtUp(sections: TypingSection[]): boolean {
  return sections.every((section) => section.shown >= section.target.length);
}

/** The text currently on screen for a section. */
export function visibleText(section: TypingSection): string {
  return section.target.slice(0, section.shown);
}

/** The section the cursor is sitting in, or null once everything is typed out. */
export function activeSectionId(sections: TypingSection[]): string | null {
  const active = sections.find((section) => section.shown < section.target.length);
  if (active) return active.id;
  const last = sections[sections.length - 1];
  return last ? last.id : null;
}

export function toDeedSections(sections: TypingSection[]): DeedSection[] {
  return sections.map(({ id, style, heading, target }) => ({
    id,
    style,
    heading,
    body: target,
  }));
}
