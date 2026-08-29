import { describe, expect, it } from "vitest";

import { createChallengeController } from "../../src/app/challenge-controller";
import { createCopySystem } from "../../src/copy/copy-system";
import type { QuestionCandidate } from "../../src/domain/types";
import { FeedbackStore } from "../../src/feedback/feedback-store";
import type { LLMProvider } from "../../src/llm/provider";
import {
  clearFeedback,
  loadFeedback,
  saveFeedback,
  type TextFileStore,
} from "../../src/persistence/feedback-persistence";
import { detectLegacyFeedbackOnce } from "../../src/persistence/legacy-state";
import type { PluginDataStore } from "../../src/persistence/settings-store";

function candidate(): QuestionCandidate {
  return {
    id: "candidate-persisted",
    category: "causal_gap",
    templateId: "causal-gap-persisted",
    question: "中间机制是什么？",
    source: { notePath: "note.md", heading: "机制", from: 0, to: 12, text: "X 导致 Y。", scope: "section" },
    targets: ["X", "Y"],
    triggerTerms: ["导致"],
    followupRoutes: ["mechanism"],
    scores: { structure: .8, centrality: .8, diagnosticity: .9, followupability: .9, novelty: 1, repetitionPenalty: 0, dislikePenalty: 0, explorationPenalty: 0, final: .8 },
  };
}

function memoryFiles(initial: Record<string, string> = {}): TextFileStore & { contents: Record<string, string> } {
  const contents = { ...initial };
  return {
    contents,
    async read(path) { return contents[path] ?? null; },
    async write(path, value) { contents[path] = value; },
  };
}

function memoryPluginData(initial: unknown = null): PluginDataStore & { read(): unknown } {
  let value = initial;
  return {
    async loadData() { return value; },
    async saveData(next) { value = next; },
    read: () => value,
  };
}

const provider: LLMProvider = {
  async complete() { throw new Error("provider must not be called in persistence startup tests"); },
};

const settings = { endpoint: "", model: "", apiKey: "DO_NOT_PERSIST_HERE", debug: false };

describe("Task 16 persistence/startup integration", () => {
  it("persists shown and bad feedback and restores counters, history, and note-local suppression after restart", async () => {
    const files = memoryFiles();
    const firstStore = new FeedbackStore();
    const c = candidate();
    const active = {
      getActiveNote: () => ({ markdown: "# 机制\nX 导致 Y。", cursorOffset: 12, notePath: "note.md" }),
      replaceMarkdown: () => undefined,
    };
    const first = createChallengeController({
      activeNote: active,
      feedbackStore: firstStore,
      copySystem: createCopySystem({ now: () => 100 }),
      settings,
      provider,
      persistFeedback: () => saveFeedback(files, firstStore),
      renderState: () => undefined,
      now: () => 100,
      selectChallenge: () => ({ status: "question", candidate: c }),
    });

    await first.actions.requestChallenge();
    await first.actions.markBad();

    const restartedStore = await loadFeedback(files);
    expect(restartedStore.getTemplateStats(c.templateId)).toMatchObject({ shown: 2, bad: 1 });
    expect(restartedStore.getRecentHistory().some((entry) => entry.action === "bad")).toBe(true);
    expect(restartedStore.isSuppressedForNote("note.md", c)).toBe(true);
    expect(files.contents["question-feedback.json"]).not.toContain(settings.apiKey);
  });

  it("detects surviving meaningful feedback once after reinstall-like plugin-data reset and exposes one legacy idle copy", async () => {
    const files = memoryFiles();
    const saved = new FeedbackStore();
    saved.recordShown(candidate(), 1);
    await saveFeedback(files, saved);
    const data = memoryPluginData(null);

    const firstDetection = await detectLegacyFeedbackOnce(data, files);
    expect(firstDetection.legacyStateFound).toBe(true);

    const copySystem = createCopySystem({ now: () => 1 });
    const legacyCopy = copySystem.next("legacy_state_found") ?? undefined;
    const controller = createChallengeController({
      activeNote: { getActiveNote: () => null, replaceMarkdown: () => undefined },
      feedbackStore: await loadFeedback(files),
      copySystem,
      settings,
      provider,
      persistFeedback: async () => undefined,
      renderState: () => undefined,
      initialCopy: legacyCopy,
    });
    expect(controller.getState().viewState).toMatchObject({ kind: "idle", copy: legacyCopy });

    const secondDetection = await detectLegacyFeedbackOnce(data, files);
    expect(secondDetection.legacyStateFound).toBe(false);
  });

  it("keeps Task 13 clearFeedback semantics: runtime state and durable JSON are both empty", async () => {
    const files = memoryFiles();
    const store = new FeedbackStore();
    const c = candidate();
    store.recordShown(c, 1);
    store.recordFeedback(c, "bad", 2);
    await saveFeedback(files, store);

    await clearFeedback(files, store);
    const restarted = await loadFeedback(files);

    expect(store.getRecentHistory()).toEqual([]);
    expect(restarted.getRecentHistory()).toEqual([]);
    expect(restarted.getTemplateStats(c.templateId)).toMatchObject({ shown: 0, bad: 0 });
  });
});
