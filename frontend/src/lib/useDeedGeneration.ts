"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "./api";
import {
  DeedEvent,
  DeedSection,
  SSEDecoder,
  TypingSection,
  applyEvent,
  backlogOf,
  charsPerTick,
  isCaughtUp,
  tick,
  toDeedSections,
} from "./deedStream";

export type GenerationPhase =
  | "idle"
  | "connecting"
  | "writing"
  | "complete"
  | "error";

export interface GenerationResult {
  sections: DeedSection[];
  plainText: string;
  estimatedPages: number;
  /** "gemini" when the recitals were drafted by the model, "template" otherwise. */
  source: string;
  missingRequired: string[];
}

interface State {
  phase: GenerationPhase;
  sections: TypingSection[];
  status: string;
  notices: string[];
  error: string | null;
  estimatedPages: number;
  sectionCount: number;
  result: GenerationResult | null;
}

const INITIAL: State = {
  phase: "idle",
  sections: [],
  status: "",
  notices: [],
  error: null,
  estimatedPages: 0,
  sectionCount: 0,
  result: null,
};

/** One 60 fps frame, in milliseconds. The reveal rate is defined per frame and
 *  scaled by real elapsed time so the animation runs at the same speed on a
 *  120 Hz display or a throttled background tab. */
const FRAME_MS = 1000 / 60;

export function useDeedGeneration() {
  const [state, setState] = useState<State>(INITIAL);

  // The stream and the animation run independently: the stream fills `target`,
  // the animation frame advances `shown`. Both touch the same section list, so
  // it lives in a ref and React state is a mirror updated once per frame.
  const sectionsRef = useRef<TypingSection[]>([]);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const streamDoneRef = useRef(false);
  const donePayloadRef = useRef<GenerationResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopAnimation = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopAnimation();
  }, [stopAnimation]);

  const reset = useCallback(() => {
    cancel();
    sectionsRef.current = [];
    streamDoneRef.current = false;
    donePayloadRef.current = null;
    setState(INITIAL);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  const runFrame = useCallback(
    (timestamp: number) => {
      const previous = lastFrameRef.current || timestamp;
      const elapsed = Math.min(timestamp - previous, 250);
      lastFrameRef.current = timestamp;

      const backlog = backlogOf(sectionsRef.current);
      if (backlog > 0) {
        const budget = Math.max(
          1,
          Math.round((charsPerTick(backlog) * elapsed) / FRAME_MS),
        );
        sectionsRef.current = tick(sectionsRef.current, budget);
      }

      const caughtUp = isCaughtUp(sectionsRef.current);
      const finished = streamDoneRef.current && caughtUp;

      setState((current) => ({
        ...current,
        sections: sectionsRef.current,
        ...(finished
          ? {
              phase: "complete" as GenerationPhase,
              status: "",
              result:
                donePayloadRef.current ?? {
                  sections: toDeedSections(sectionsRef.current),
                  plainText: "",
                  estimatedPages: current.estimatedPages,
                  source: "template",
                  missingRequired: [],
                },
            }
          : {}),
      }));

      if (finished) {
        stopAnimation();
        return;
      }
      frameRef.current = requestAnimationFrame(runFrame);
    },
    [stopAnimation],
  );

  const startAnimation = useCallback(() => {
    if (frameRef.current !== null) return;
    lastFrameRef.current = 0;
    frameRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const handleEvent = useCallback((event: DeedEvent) => {
    switch (event.type) {
      case "status":
        setState((current) => ({ ...current, status: event.message }));
        break;
      case "meta":
        setState((current) => ({
          ...current,
          estimatedPages: event.estimatedPages,
          sectionCount: event.sectionCount,
        }));
        break;
      case "warning":
      case "notice":
        setState((current) => ({
          ...current,
          notices: current.notices.includes(event.message)
            ? current.notices
            : [...current.notices, event.message],
        }));
        break;
      case "error":
        setState((current) => ({
          ...current,
          phase: "error",
          error: event.message,
        }));
        break;
      case "done":
        donePayloadRef.current = {
          sections: event.sections,
          plainText: event.plainText,
          estimatedPages: event.estimatedPages,
          source: event.source,
          missingRequired: event.missingRequired ?? [],
        };
        streamDoneRef.current = true;
        break;
      default:
        sectionsRef.current = applyEvent(sectionsRef.current, event);
    }
  }, []);

  const start = useCallback(
    async (fields: Record<string, string>) => {
      cancel();
      sectionsRef.current = [];
      streamDoneRef.current = false;
      donePayloadRef.current = null;
      setState({
        ...INITIAL,
        phase: "connecting",
        status: "Waking the drafting engine",
      });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(api("/drafting/generate"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ fields }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(
            `The drafting engine did not respond (${response.status}).`,
          );
        }

        setState((current) => ({ ...current, phase: "writing" }));
        startAnimation();

        const reader = response.body.getReader();
        const utf8 = new TextDecoder();
        const decoder = new SSEDecoder();

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const event of decoder.push(utf8.decode(value, { stream: true }))) {
            handleEvent(event);
          }
        }
        for (const event of decoder.flush()) handleEvent(event);

        // The stream can close without a done frame if the connection drops
        // mid-deed. Whatever arrived is still a usable draft.
        streamDoneRef.current = true;
        startAnimation();
      } catch (caught) {
        if (controller.signal.aborted) return;
        stopAnimation();
        setState((current) => ({
          ...current,
          phase: "error",
          error:
            caught instanceof Error
              ? caught.message
              : "Generation failed unexpectedly.",
        }));
      }
    },
    [cancel, handleEvent, startAnimation, stopAnimation],
  );

  /** Reveal the rest immediately, for a user who does not want to watch. */
  const skipAnimation = useCallback(() => {
    sectionsRef.current = sectionsRef.current.map((section) => ({
      ...section,
      shown: section.target.length,
    }));
    startAnimation();
  }, [startAnimation]);

  return { ...state, start, cancel, reset, skipAnimation };
}
