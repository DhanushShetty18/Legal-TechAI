"use client";

import { useEffect, useRef, useState } from "react";

import { TypingSection, visibleText } from "@/lib/deedStream";

interface LiveDeedCanvasProps {
  sections: TypingSection[];
  /** True while text is still being revealed - drives the caret. */
  isWriting: boolean;
  /** Section bodies the user has edited, keyed by section id. */
  edits?: Record<string, string>;
  onEdit?: (sectionId: string, body: string) => void;
  editable?: boolean;
}

/**
 * The deed as it is being written.
 *
 * Laid out as a sheet of paper rather than a web page - serif body, justified
 * columns, the same wide binding margin the PDF uses - so that what the user
 * watches being typed is recognisably the document they are about to download.
 */
export default function LiveDeedCanvas({
  sections,
  isWriting,
  edits = {},
  onEdit,
  editable = false,
}: LiveDeedCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Following stops the moment the user scrolls up to re-read something, and
  // resumes when they scroll back to the bottom.
  const [following, setFollowing] = useState(true);

  useEffect(() => {
    if (!following || !isWriting) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [sections, following, isWriting]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    setFollowing(distanceFromBottom < 120);
  };

  const activeIndex = sections.findIndex(
    (section) => section.shown < section.target.length,
  );
  const caretIndex = activeIndex === -1 ? sections.length - 1 : activeIndex;

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-[70vh] overflow-y-auto rounded-2xl bg-slate-200/70 p-3 sm:p-6 shadow-inner"
      >
        <div className="mx-auto w-full max-w-[52rem] bg-white shadow-2xl">
          {/* Binding margin on the left, matching the printed deed. */}
          <div className="px-6 py-10 sm:pl-24 sm:pr-14 sm:py-16 text-slate-900">
            {sections.length === 0 && (
              <p className="text-center font-serif text-sm italic text-slate-400">
                The deed will appear here as it is drafted.
              </p>
            )}

            {sections.map((section, index) => (
              <DeedBlock
                key={section.id}
                section={section}
                showCaret={isWriting && index === caretIndex}
                edited={edits[section.id]}
                onEdit={onEdit}
                editable={editable}
              />
            ))}
            <div ref={endRef} />
          </div>
        </div>
      </div>

      {!following && isWriting && (
        <button
          onClick={() => {
            setFollowing(true);
            endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
          }}
          className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-lg hover:bg-slate-800"
        >
          Follow the drafting
        </button>
      )}
    </div>
  );
}

const Caret = () => (
  <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] animate-pulse bg-indigo-600 align-middle" />
);

function DeedBlock({
  section,
  showCaret,
  edited,
  onEdit,
  editable,
}: {
  section: TypingSection;
  showCaret: boolean;
  edited?: string;
  onEdit?: (sectionId: string, body: string) => void;
  editable: boolean;
}) {
  const fullyTyped = section.shown >= section.target.length;
  const text = edited !== undefined && fullyTyped ? edited : visibleText(section);

  // Editing is offered only on the passages that carry drafted prose; the
  // headings, labels and impression pages are structural.
  const isEditable =
    editable &&
    fullyTyped &&
    onEdit !== undefined &&
    ["preamble", "party", "recital", "clause", "schedule", "attestation"].includes(
      section.style,
    );

  if (isEditable) {
    return (
      <EditableBlock
        section={section}
        text={text}
        onEdit={onEdit!}
      />
    );
  }

  switch (section.style) {
    case "title":
      return (
        <h1 className="mb-9 text-center font-serif text-2xl font-bold uppercase tracking-[0.18em] sm:text-3xl">
          {text}
          {showCaret && <Caret />}
        </h1>
      );

    case "party-label":
      return (
        <p className="my-5 text-center font-serif text-base font-bold uppercase tracking-widest">
          {text}
          {showCaret && <Caret />}
        </p>
      );

    case "operative-heading":
      return (
        <h2 className="mb-5 mt-9 font-serif text-base font-bold uppercase tracking-wide">
          {text}
          {showCaret && <Caret />}
        </h2>
      );

    case "schedule-heading":
      return (
        <h2 className="mb-3 mt-10 text-center font-serif text-xl font-bold uppercase tracking-[0.22em]">
          {text}
          {showCaret && <Caret />}
        </h2>
      );

    case "schedule-note":
      return (
        <p className="mb-5 text-center font-serif text-xs italic leading-relaxed text-slate-500">
          {text}
          {showCaret && <Caret />}
        </p>
      );

    case "clause":
      return (
        <div className="mb-4 flex gap-3 font-serif text-[15px] leading-[1.9]">
          <span className="w-6 shrink-0 text-right font-semibold">
            {section.heading}.
          </span>
          <p className="flex-1 text-justify">
            {text}
            {showCaret && <Caret />}
          </p>
        </div>
      );

    case "schedule":
    case "boundaries":
      return (
        <div className="mb-5 font-serif text-[15px] leading-[1.9]">
          {section.heading && (
            <p className="mb-2 font-semibold uppercase tracking-wide">
              {section.heading}
            </p>
          )}
          <div className="whitespace-pre-line pl-4">
            {text}
            {showCaret && <Caret />}
          </div>
        </div>
      );

    case "signature-block":
      return <SignatureBlock section={section} text={text} showCaret={showCaret} />;

    case "witnesses":
      return (
        <div className="mt-10 font-serif text-[15px] leading-[2.1]">
          <p className="mb-3 font-bold uppercase tracking-wide">
            {section.heading}
          </p>
          <div className="whitespace-pre-line">
            {text}
            {showCaret && <Caret />}
          </div>
        </div>
      );

    default:
      return (
        <p className="mb-4 text-justify font-serif text-[15px] leading-[1.9]">
          {text}
          {showCaret && <Caret />}
        </p>
      );
  }
}

function EditableBlock({
  section,
  text,
  onEdit,
}: {
  section: TypingSection;
  text: string;
  onEdit: (sectionId: string, body: string) => void;
}) {
  const isClause = section.style === "clause";
  return (
    <div className={`group relative mb-4 ${isClause ? "flex gap-3" : ""}`}>
      {isClause && (
        <span className="w-6 shrink-0 pt-1 text-right font-serif text-[15px] font-semibold">
          {section.heading}.
        </span>
      )}
      <textarea
        value={text}
        onChange={(event) => onEdit(section.id, event.target.value)}
        rows={Math.max(2, Math.ceil(text.length / 78))}
        aria-label={`Edit ${section.id}`}
        className="flex-1 resize-y rounded border border-transparent bg-transparent p-1 text-justify font-serif text-[15px] leading-[1.9] text-slate-900 outline-none transition-colors hover:border-slate-200 hover:bg-slate-50/60 focus:border-indigo-400 focus:bg-indigo-50/40"
      />
    </div>
  );
}

const FINGERS = [
  "Thumb",
  "Index Finger",
  "Middle Finger",
  "Fore Finger",
  "Little Finger",
];

function SignatureBlock({
  section,
  text,
  showCaret,
}: {
  section: TypingSection;
  text: string;
  showCaret: boolean;
}) {
  return (
    <div className="mt-12 border-t border-dashed border-slate-300 pt-8 font-serif">
      <p className="mb-6 text-sm font-bold uppercase tracking-wide">
        {section.heading}
      </p>
      <div className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 text-[15px] leading-[2.2]">
          <p>
            Name: {text}
            {showCaret && <Caret />}
          </p>
          <p className="mt-10">Signature: ______________________________</p>
        </div>
        <div className="flex h-32 w-28 shrink-0 items-center justify-center border border-slate-400 text-center text-[10px] leading-tight text-slate-500">
          Photograph
        </div>
      </div>

      {(["Right", "Left"] as const).map((hand) => (
        <table
          key={hand}
          className="mb-3 w-full table-fixed border-collapse text-[9px]"
        >
          <tbody>
            <tr>
              {FINGERS.map((finger) => (
                <td
                  key={finger}
                  className="border border-slate-400 bg-slate-50 p-1 text-center align-middle leading-tight text-slate-600"
                >
                  {finger}
                  <br />
                  of {hand} Hand
                </td>
              ))}
            </tr>
            <tr>
              {FINGERS.map((finger) => (
                <td
                  key={finger}
                  className="h-14 border border-slate-400"
                  aria-label={`${finger} of ${hand} hand impression`}
                />
              ))}
            </tr>
          </tbody>
        </table>
      ))}
    </div>
  );
}
