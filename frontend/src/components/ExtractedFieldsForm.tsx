"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Sparkles } from "lucide-react";

import {
  DeedFields,
  FIELD_GROUPS,
  FieldDef,
  SALE_DEED_FIELDS,
  missingRequiredFields,
} from "@/lib/caseTypes";

interface ExtractedFieldsFormProps {
  fields: DeedFields;
  /** Field key -> the document id (or "user") the value came from. */
  provenance: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

/**
 * The review step.
 *
 * Everything the extractor found is shown filled in and attributed, but the
 * form opens focused on what is still outstanding - the brief asks only for
 * missing information, so the complete groups start collapsed rather than
 * making the user scroll past fifty correct answers to find the four gaps.
 */
export default function ExtractedFieldsForm({
  fields,
  provenance,
  onChange,
}: ExtractedFieldsFormProps) {
  const missing = useMemo(() => new Set(missingRequiredFields(fields)), [fields]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const groups = useMemo(
    () =>
      FIELD_GROUPS.map((group) => {
        const groupFields = SALE_DEED_FIELDS.filter((f) => f.group === group);
        return {
          group,
          fields: groupFields,
          missingCount: groupFields.filter((f) => missing.has(f.key)).length,
          filledCount: groupFields.filter((f) =>
            String(fields[f.key] ?? "").trim(),
          ).length,
        };
      }),
    [fields, missing],
  );

  return (
    <div className="space-y-4">
      {groups.map(({ group, fields: groupFields, missingCount, filledCount }) => {
        // Groups with gaps are open by default; complete ones collapse away.
        const isOpen = expanded[group] ?? missingCount > 0;
        return (
          <section
            key={group}
            className={`overflow-hidden rounded-2xl border transition-colors ${
              missingCount > 0
                ? "border-amber-500/40 bg-amber-500/[0.04]"
                : "border-slate-700 bg-slate-900/60"
            }`}
          >
            <button
              type="button"
              onClick={() =>
                setExpanded((current) => ({ ...current, [group]: !isOpen }))
              }
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-800/40"
            >
              <span className="flex items-center gap-3">
                {missingCount > 0 ? (
                  <AlertCircle className="h-5 w-5 shrink-0 text-amber-400" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                )}
                <span className="font-semibold text-white">{group}</span>
              </span>
              <span className="flex items-center gap-3 text-xs">
                {missingCount > 0 ? (
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-medium text-amber-300">
                    {missingCount} still needed
                  </span>
                ) : (
                  <span className="text-slate-500">
                    {filledCount} of {groupFields.length} filled
                  </span>
                )}
                <ChevronDown
                  className={`h-4 w-4 text-slate-500 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </span>
            </button>

            {isOpen && (
              <div className="grid grid-cols-1 gap-4 border-t border-slate-800 p-5 sm:grid-cols-2">
                {groupFields.map((field) => (
                  <FieldInput
                    key={field.key}
                    field={field}
                    value={fields[field.key] ?? ""}
                    source={provenance[field.key]}
                    isMissing={missing.has(field.key)}
                    onChange={onChange}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function FieldInput({
  field,
  value,
  source,
  isMissing,
  onChange,
}: {
  field: FieldDef;
  value: string;
  source?: string;
  isMissing: boolean;
  onChange: (key: string, value: string) => void;
}) {
  const wasExtracted = Boolean(source) && source !== "user";
  const shared =
    `w-full rounded-xl border bg-slate-950 px-4 py-3 text-white outline-none transition-all ` +
    `placeholder:text-slate-600 focus:ring-2 focus:ring-indigo-500/20 ` +
    (isMissing
      ? "border-amber-500/60 focus:border-amber-400"
      : "border-slate-700 focus:border-indigo-500");

  return (
    <div
      className={`flex flex-col gap-1.5 ${
        field.kind === "textarea" ? "sm:col-span-2" : ""
      }`}
    >
      <label
        htmlFor={field.key}
        className="flex items-center justify-between gap-2 text-sm font-medium text-slate-300"
      >
        <span>
          {field.label}
          {field.required && <span className="ml-1 text-amber-400">*</span>}
        </span>
        {wasExtracted && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-emerald-400">
            <Sparkles className="h-3 w-3" /> extracted
          </span>
        )}
      </label>

      {field.kind === "textarea" ? (
        <textarea
          id={field.key}
          value={value}
          rows={3}
          placeholder={field.placeholder}
          onChange={(event) => onChange(field.key, event.target.value)}
          className={`${shared} resize-y`}
        />
      ) : (
        <input
          id={field.key}
          type={field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text"}
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(field.key, event.target.value)}
          className={shared}
        />
      )}

      {field.helpText && (
        <p className="text-[11px] leading-snug text-slate-500">{field.helpText}</p>
      )}
    </div>
  );
}
