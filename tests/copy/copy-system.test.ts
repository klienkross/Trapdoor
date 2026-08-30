import { describe, expect, it, vi } from "vitest";

import type { QuestionCandidate } from "../../src/domain/types";
import { FeedbackStore } from "../../src/feedback/feedback-store";
import {
  COPY_EVENTS,
  COPY_TABLE,
  createCopySystem,
  type CopyEvent,
} from "../../src/copy/copy-system";

const REQUIRED_EVENTS = [
  "bad_question",
  "bad_question_streak",
  "pit_saved",
  "not_suitable",
  "feedback_reset",
  "legacy_state_found",
  "drill_exhausted",
] as const satisfies readonly CopyEvent[];

function candidate(): QuestionCandidate {
  return {
    id: "candidate-1",
    category: "causal_gap",
    templateId: "causal-gap-1",
    question: "为什么？",
    source: {
      notePath: "note.md",
      heading: null,
      from: 0,
      to: 4,
      text: "A 导致 B",
      scope: "note",
    },
    targets: ["A", "B"],
    triggerTerms: ["导致"],
    scores: {
      structure: 1,
      centrality: 0,
      diagnosticity: 0.9,
      followupability: 0.95,
      novelty: 1,
      repetitionPenalty: 0,
      dislikePenalty: 0,
      explorationPenalty: 0,
      final: 0,
    },
    followupRoutes: ["mechanism"],
  };
}

describe("event-driven copy system", () => {
  it("has non-empty local copy for every required event", () => {
    for (const event of REQUIRED_EVENTS) {
      expect(COPY_TABLE[event].length).toBeGreaterThan(0);
      expect(COPY_TABLE[event].every((line) => line.trim().length > 0)).toBe(true);
    }
  });

  it("rotates one event in fixed order and loops at the end", () => {
    const copy = createCopySystem();
    const lines = COPY_TABLE.bad_question;

    const emitted = Array.from({ length: lines.length + 1 }, () => copy.next("bad_question"));

    expect(emitted.slice(0, lines.length)).toEqual([...lines]);
    expect(emitted.at(-1)).toBe(lines[0]);
  });

  it("keeps rotation state independent between events", () => {
    const copy = createCopySystem();

    expect(copy.next("bad_question")).toBe(COPY_TABLE.bad_question[0]);
    expect(copy.next("pit_saved")).toBe(COPY_TABLE.pit_saved[0]);
    expect(copy.next("bad_question")).toBe(COPY_TABLE.bad_question[1]);
    expect(copy.next("pit_saved")).toBe(COPY_TABLE.pit_saved[1]);
  });

  it("does not depend on Math.random", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random must not be used");
    });
    const copy = createCopySystem();

    for (const event of COPY_EVENTS) copy.next(event);

    expect(random).not.toHaveBeenCalled();
  });

  it("replays identically from the same initial state and call sequence", () => {
    const sequence: CopyEvent[] = [
      "bad_question",
      "pit_saved",
      "bad_question",
      "not_suitable",
      "pit_saved",
      "feedback_reset",
    ];
    const first = createCopySystem();
    const second = createCopySystem();

    expect(sequence.map((event) => first.next(event))).toEqual(
      sequence.map((event) => second.next(event)),
    );
  });

  it("suppresses a cooldown event until the cooldown expires, including the exact boundary", () => {
    let now = 1_000;
    const copy = createCopySystem({
      now: () => now,
      cooldowns: { bad_question_streak: 500 },
    });

    expect(copy.next("bad_question_streak")).toBe(COPY_TABLE.bad_question_streak[0]);
    now = 1_499;
    expect(copy.next("bad_question_streak")).toBeNull();
    now = 1_500;
    expect(copy.next("bad_question_streak")).toBe(COPY_TABLE.bad_question_streak[1]);
  });

  it("does not advance rotation while an event is cooling down", () => {
    let now = 0;
    const copy = createCopySystem({
      now: () => now,
      cooldowns: { bad_question_streak: 100 },
    });

    expect(copy.next("bad_question_streak")).toBe(COPY_TABLE.bad_question_streak[0]);
    now = 50;
    expect(copy.next("bad_question_streak")).toBeNull();
    now = 100;
    expect(copy.next("bad_question_streak")).toBe(COPY_TABLE.bad_question_streak[1]);
  });

  it("keeps cooldown state independent between events", () => {
    let now = 0;
    const copy = createCopySystem({
      now: () => now,
      cooldowns: { bad_question_streak: 1_000, drill_exhausted: 1_000 },
    });

    expect(copy.next("bad_question_streak")).toBe(COPY_TABLE.bad_question_streak[0]);
    expect(copy.next("drill_exhausted")).toBe(COPY_TABLE.drill_exhausted[0]);
    now = 500;
    expect(copy.next("bad_question_streak")).toBeNull();
    expect(copy.next("drill_exhausted")).toBeNull();
  });

  it("gives bad_question_streak a default cooldown", () => {
    let now = 0;
    const copy = createCopySystem({ now: () => now });

    expect(copy.next("bad_question_streak")).not.toBeNull();
    now += 1;
    expect(copy.next("bad_question_streak")).toBeNull();
  });

  it("uses advancing real time when no clock is injected", () => {
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const copy = createCopySystem();

    expect(copy.next("bad_question_streak")).toBe(COPY_TABLE.bad_question_streak[0]);
    dateNow.mockReturnValue(30_999);
    expect(copy.next("bad_question_streak")).toBeNull();
    dateNow.mockReturnValue(31_000);
    expect(copy.next("bad_question_streak")).toBe(COPY_TABLE.bad_question_streak[1]);

    dateNow.mockRestore();
  });

  it("treats legacy_state_found as one-shot by default", () => {
    let now = 0;
    const copy = createCopySystem({ now: () => now });

    expect(copy.next("legacy_state_found")).toBe(COPY_TABLE.legacy_state_found[0]);
    now = Number.MAX_SAFE_INTEGER;
    expect(copy.next("legacy_state_found")).toBeNull();
  });

  it("can override legacy_state_found with a finite very-long cooldown", () => {
    let now = 10;
    const copy = createCopySystem({
      now: () => now,
      cooldowns: { legacy_state_found: 10_000 },
    });

    expect(copy.next("legacy_state_found")).toBe(COPY_TABLE.legacy_state_found[0]);
    now = 10_009;
    expect(copy.next("legacy_state_found")).toBeNull();
    now = 10_010;
    expect(copy.next("legacy_state_found")).toBe(COPY_TABLE.legacy_state_found[1]);
  });

  it("recreating the system resets deterministic rotation and cooldown state", () => {
    const first = createCopySystem();
    expect(first.next("bad_question")).toBe(COPY_TABLE.bad_question[0]);
    expect(first.next("bad_question")).toBe(COPY_TABLE.bad_question[1]);
    expect(first.next("legacy_state_found")).toBe(COPY_TABLE.legacy_state_found[0]);
    expect(first.next("legacy_state_found")).toBeNull();

    const recreated = createCopySystem();
    expect(recreated.next("bad_question")).toBe(COPY_TABLE.bad_question[0]);
    expect(recreated.next("legacy_state_found")).toBe(COPY_TABLE.legacy_state_found[0]);
  });

  it("does not mutate FeedbackStore", () => {
    const store = new FeedbackStore();
    const item = candidate();
    store.recordShown(item, 1);
    const before = {
      template: store.getTemplateStats(item.templateId),
      category: store.getCategoryStats(item.category),
      recent: store.getRecentHistory(),
    };

    const copy = createCopySystem();
    copy.next("bad_question");
    copy.next("feedback_reset");

    expect(store.getTemplateStats(item.templateId)).toEqual(before.template);
    expect(store.getCategoryStats(item.category)).toEqual(before.category);
    expect(store.getRecentHistory()).toEqual(before.recent);
  });

  it("does not call network APIs", () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("network must not be used");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const copy = createCopySystem();
    for (const event of COPY_EVENTS) copy.next(event);

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
