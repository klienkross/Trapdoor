import { describe, expect, it, vi } from "vitest";
import type { Detection, NoteContext, QuestionCandidate } from "../../src/domain/types";
import { FeedbackStore } from "../../src/feedback/feedback-store";
import {
  CHALLENGE_VIABILITY_THRESHOLD,
  requestChallenge,
  type ChallengeServiceDependencies,
} from "../../src/challenge/challenge-service";

function context(
  scope: "section" | "note",
  text = scope === "section" ? "X 导致 Y。" : "Whole note: X 导致 Y。",
  heading = scope === "section" ? "当前" : null,
): NoteContext {
  return {
    notePath: "notes/a.md",
    heading,
    from: scope === "section" ? 10 : 0,
    to: scope === "section" ? 30 : 100,
    text,
    scope,
  };
}

function detection(source: NoteContext): Detection {
  return {
    category: "causal_gap",
    confidence: 0.8,
    source,
    targets: ["X", "Y"],
    triggerTerms: ["导致"],
  };
}

function candidate(source: NoteContext, id: string, final = 0): QuestionCandidate {
  return {
    id,
    category: "causal_gap",
    templateId: `${id}-template`,
    question: `${id}?`,
    source,
    targets: ["X", "Y"],
    triggerTerms: ["导致"],
    scores: {
      structure: 0.8,
      centrality: 0,
      diagnosticity: 0.9,
      followupability: 0.95,
      novelty: 0,
      repetitionPenalty: 0,
      dislikePenalty: 0,
      explorationPenalty: 0,
      final,
    },
    followupRoutes: ["mechanism"],
  };
}

function controlledPipeline(options: {
  sectionFinal?: number;
  noteFinal?: number;
  sectionSkip?: boolean;
  noteSkip?: boolean;
  sectionCandidates?: boolean;
  noteCandidates?: boolean;
} = {}): { dependencies: Partial<ChallengeServiceDependencies>; wholeNote: ReturnType<typeof vi.fn> } {
  const section = context("section");
  const note = context("note");
  const wholeNote = vi.fn(() => note);
  const sectionCandidate = candidate(section, "section-candidate");
  const noteCandidate = candidate(note, "note-candidate");

  return {
    wholeNote,
    dependencies: {
      extractSection: () => section,
      extractWholeNote: wholeNote,
      measureExploration: (text) => ({
        score: text === section.text ? (options.sectionSkip ? 0.8 : 0.1) : (options.noteSkip ? 0.8 : 0.1),
        signals: [],
        shouldSkip: text === section.text ? Boolean(options.sectionSkip) : Boolean(options.noteSkip),
      }),
      detectPatterns: (source) => {
        if (source.scope === "section" && options.sectionCandidates === false) return [];
        if (source.scope === "note" && options.noteCandidates === false) return [];
        return [detection(source)];
      },
      generateCandidates: (detections) => detections.map((item) =>
        item.source.scope === "section" ? sectionCandidate : noteCandidate,
      ),
      rankCandidates: (candidates) => candidates.map((item) => ({
        ...item,
        scores: {
          ...item.scores,
          final: item.source.scope === "section" ? (options.sectionFinal ?? 0.6) : (options.noteFinal ?? 0.7),
        },
      })),
    },
  };
}

const input = {
  markdown: "## 当前\nX 导致 Y。",
  cursorOffset: 8,
  notePath: "notes/a.md",
  feedbackStore: new FeedbackStore(),
};

describe("requestChallenge", () => {
  it("runs the real Task 2-7 pipeline and returns a viable current-section question", () => {
    const markdown = [
      "# 笔记",
      "背景描述。",
      "",
      "## 当前",
      "注意力资源有限，所以筛选会导致部分信息无法进入后续加工。",
      "",
      "## 其他",
      "普通补充。",
    ].join("\n");

    const result = requestChallenge({
      markdown,
      cursorOffset: markdown.indexOf("注意力"),
      notePath: "notes/integration.md",
      feedbackStore: new FeedbackStore(),
    });

    expect(result.status).toBe("question");
    if (result.status === "question") {
      expect(result.candidate.source.scope).toBe("section");
      expect(result.candidate.scores.final).toBeGreaterThanOrEqual(CHALLENGE_VIABILITY_THRESHOLD);
      expect(result.candidate.question.length).toBeGreaterThan(0);
    }
  });

  it("returns a viable section question without consulting a higher-scoring whole note", () => {
    const { dependencies, wholeNote } = controlledPipeline({ sectionFinal: 0.36, noteFinal: 0.99 });
    const result = requestChallenge(input, dependencies);

    expect(result.status).toBe("question");
    if (result.status === "question") expect(result.candidate.id).toBe("section-candidate");
    expect(wholeNote).not.toHaveBeenCalled();
  });

  it("falls back when section detection/generation produces no candidate", () => {
    const { dependencies, wholeNote } = controlledPipeline({ sectionCandidates: false, noteFinal: 0.7 });
    const result = requestChallenge(input, dependencies);

    expect(wholeNote).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("question");
    if (result.status === "question") expect(result.candidate.source.scope).toBe("note");
  });

  it("falls back when every section candidate is below 0.35", () => {
    const { dependencies, wholeNote } = controlledPipeline({ sectionFinal: 0.349, noteFinal: 0.7 });
    const result = requestChallenge(input, dependencies);

    expect(wholeNote).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("question");
    if (result.status === "question") expect(result.candidate.id).toBe("note-candidate");
  });

  it("returns none when both suitable scopes lack a viable candidate", () => {
    const { dependencies } = controlledPipeline({ sectionFinal: 0.2, noteFinal: 0.349 });
    expect(requestChallenge(input, dependencies).status).toBe("none");
  });

  it("returns not_suitable for a skipped section and never bypasses it with whole-note fallback", () => {
    const { dependencies, wholeNote } = controlledPipeline({ sectionSkip: true, noteFinal: 0.9 });
    const result = requestChallenge(input, dependencies);

    expect(result.status).toBe("not_suitable");
    if (result.status === "not_suitable") expect(result.scope).toBe("section");
    expect(wholeNote).not.toHaveBeenCalled();
  });

  it("treats exactly 0.35 as viable", () => {
    const { dependencies, wholeNote } = controlledPipeline({ sectionFinal: 0.35 });
    const result = requestChallenge(input, dependencies);

    expect(result.status).toBe("question");
    if (result.status === "question") expect(result.candidate.id).toBe("section-candidate");
    expect(wholeNote).not.toHaveBeenCalled();
  });

  it("treats a score below 0.35 as non-viable", () => {
    const { dependencies } = controlledPipeline({ sectionFinal: 0.349999, noteCandidates: false });
    expect(requestChallenge(input, dependencies).status).toBe("none");
  });

  it("passes explorationScore to ranking so a high-but-not-skipped score can cross below viability", () => {
    const rankCandidates = vi.fn((items: readonly QuestionCandidate[]) =>
      items.map((item) => ({ ...item, scores: { ...item.scores, final: 0.34 } })),
    );
    const { dependencies } = controlledPipeline({ noteCandidates: false });
    dependencies.measureExploration = () => ({ score: 0.79, signals: [], shouldSkip: false });
    dependencies.rankCandidates = rankCandidates as ChallengeServiceDependencies["rankCandidates"];

    const result = requestChallenge(input, dependencies);

    expect(rankCandidates).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ explorationScore: 0.79 }));
    expect(result.status).toBe("none");
  });

  it("uses the supplied FeedbackStore so recent feedback can change selection", () => {
    const section = context("section", "## 当前\nX 导致 Y。证据表明 Z。", "当前");
    const first = candidate(section, "a");
    first.templateId = "causal-gap-01";
    first.scores.structure = 0.95;

    const second = candidate({ ...section, from: 50, to: 70 }, "b");
    second.category = "evidence_jump";
    second.templateId = "evidence-jump-01";
    second.scores.structure = 0.9;
    second.followupRoutes = ["evidence"];

    const store = new FeedbackStore();
    const dependencies: Partial<ChallengeServiceDependencies> = {
      extractSection: () => section,
      extractWholeNote: () => context("note"),
      measureExploration: () => ({ score: 0, signals: [], shouldSkip: false }),
      detectPatterns: () => [detection(section)],
      generateCandidates: () => [first, second],
    };

    const before = requestChallenge({ ...input, feedbackStore: store }, dependencies);
    expect(before.status).toBe("question");
    if (before.status !== "question") return;

    store.recordShown(before.candidate, 1);
    store.recordFeedback(before.candidate, "bad", 2);
    const after = requestChallenge({ ...input, feedbackStore: store }, dependencies);

    expect(after.status).toBe("question");
    if (after.status === "question") expect(after.candidate.id).not.toBe(before.candidate.id);
  });

  it("does not record shown or any feedback side effect", () => {
    const store = new FeedbackStore();
    const { dependencies } = controlledPipeline({ sectionFinal: 0.7 });
    requestChallenge({ ...input, feedbackStore: store }, dependencies);

    expect(store.getRecentHistory()).toEqual([]);
    expect(store.getRecentShownHistory()).toEqual([]);
  });

  it("is deterministic for identical input and feedback state", () => {
    const store = new FeedbackStore();
    const first = requestChallenge({ ...input, feedbackStore: store });
    const second = requestChallenge({ ...input, feedbackStore: store });
    expect(second).toEqual(first);
  });

  it("returns whole-note not_suitable when fallback reaches a skipped whole note", () => {
    const { dependencies } = controlledPipeline({ sectionCandidates: false, noteSkip: true });
    const result = requestChallenge(input, dependencies);

    expect(result.status).toBe("not_suitable");
    if (result.status === "not_suitable") expect(result.scope).toBe("note");
  });
});
