import { describe, expect, it } from "vitest";
import type { QuestionCandidate } from "../../src/domain/types";
import { FeedbackStore } from "../../src/feedback/feedback-store";
import {
  FEEDBACK_FILE_PATH,
  clearFeedback,
  hasMeaningfulFeedback,
  loadFeedback,
  saveFeedback,
  type TextFileStore,
} from "../../src/persistence/feedback-persistence";
import {
  detectLegacyFeedbackOnce,
  type LegacyDetectionResult,
} from "../../src/persistence/legacy-state";
import { DEFAULT_SETTINGS } from "../../src/settings";
import type { PluginDataStore } from "../../src/persistence/settings-store";

function candidate(id = "one"): QuestionCandidate {
  return {
    id,
    category: "causal_gap",
    templateId: "causal-gap-01",
    question: "why?",
    source: {
      notePath: "notes/a.md",
      heading: null,
      from: 0,
      to: 10,
      text: "X 导致 Y",
      scope: "section",
    },
    targets: ["X", "Y"],
    triggerTerms: ["导致"],
    scores: {
      structure: 0.8,
      centrality: 0.4,
      diagnosticity: 0.9,
      followupability: 0.95,
      novelty: 1,
      repetitionPenalty: 0,
      dislikePenalty: 0,
      explorationPenalty: 0,
      final: 0.8,
    },
    followupRoutes: ["mechanism"],
  };
}

class FakeTextFileStore implements TextFileStore {
  files = new Map<string, string>();
  writes: Array<{ path: string; contents: string }> = [];

  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async write(path: string, contents: string): Promise<void> {
    this.files.set(path, contents);
    this.writes.push({ path, contents });
  }
}

class FakePluginDataStore implements PluginDataStore {
  saved: unknown[] = [];

  constructor(public data: unknown = null) {}

  async loadData(): Promise<unknown> {
    return this.data;
  }

  async saveData(data: unknown): Promise<void> {
    this.data = data;
    this.saved.push(data);
  }
}

async function writeMeaningfulFeedback(files: FakeTextFileStore): Promise<void> {
  const store = new FeedbackStore();
  store.recordShown(candidate(), 10);
  await saveFeedback(files, store);
}

describe("question-feedback.json persistence", () => {
  it("loads a missing file as a clean empty store", async () => {
    const loaded = await loadFeedback(new FakeTextFileStore());

    expect(loaded.exportState()).toEqual({
      templates: {},
      categories: {},
      recentHistory: [],
      recentShownHistory: [],
    });
  });

  it("writes stable pretty JSON with an explicit version and trailing newline", async () => {
    const files = new FakeTextFileStore();
    const store = new FeedbackStore();
    store.recordShown(candidate(), 10);

    await saveFeedback(files, store);

    const text = files.files.get(FEEDBACK_FILE_PATH)!;
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('\n  "version": 1,\n');
    expect(JSON.parse(text).version).toBe(1);
    expect(text).not.toContain("badRate");
  });

  it("never writes API credentials into the feedback file", async () => {
    const files = new FakeTextFileStore();
    const store = new FeedbackStore();
    await saveFeedback(files, store);

    expect(files.files.get(FEEDBACK_FILE_PATH)).not.toContain("apiKey");
    expect(files.files.get(FEEDBACK_FILE_PATH)).not.toContain("secret-value");
  });

  it("throws a typed error for invalid JSON without rewriting the file", async () => {
    const files = new FakeTextFileStore();
    files.files.set(FEEDBACK_FILE_PATH, "{ nope");

    await expect(loadFeedback(files)).rejects.toMatchObject({
      name: "FeedbackFileError",
      kind: "invalid_json",
    });
    expect(files.writes).toEqual([]);
    expect(files.files.get(FEEDBACK_FILE_PATH)).toBe("{ nope");
  });

  it("throws a typed error for valid JSON with an invalid shape without rewriting the file", async () => {
    const files = new FakeTextFileStore();
    files.files.set(FEEDBACK_FILE_PATH, JSON.stringify({ version: 1, templates: [] }));

    await expect(loadFeedback(files)).rejects.toMatchObject({
      name: "FeedbackFileError",
      kind: "invalid_shape",
    });
    expect(files.writes).toEqual([]);
  });

  it("does not treat the canonical empty state as meaningful legacy feedback", async () => {
    const files = new FakeTextFileStore();
    const store = new FeedbackStore();
    await saveFeedback(files, store);

    const loaded = await loadFeedback(files);
    expect(hasMeaningfulFeedback(loaded.exportState())).toBe(false);
  });

  it("treats counters or bounded history as meaningful feedback", async () => {
    const store = new FeedbackStore();
    store.recordShown(candidate(), 10);

    expect(hasMeaningfulFeedback(store.exportState())).toBe(true);
  });

  it("clearFeedback empties runtime and persisted state without hidden counters/history", async () => {
    const files = new FakeTextFileStore();
    const store = new FeedbackStore();
    store.recordShown(candidate(), 10);
    store.recordFeedback(candidate(), "bad", 20);
    await saveFeedback(files, store);

    await clearFeedback(files, store);

    expect(store.exportState()).toEqual({
      templates: {},
      categories: {},
      recentHistory: [],
      recentShownHistory: [],
    });
    const reloaded = await loadFeedback(files);
    expect(reloaded.exportState()).toEqual(store.exportState());
    expect(hasMeaningfulFeedback(reloaded.exportState())).toBe(false);
  });
});

describe("legacy feedback detection", () => {
  it("returns false for a fresh install with no feedback", async () => {
    const data = new FakePluginDataStore(null);
    const files = new FakeTextFileStore();

    const result = await detectLegacyFeedbackOnce(data, files);

    expect(result).toEqual<LegacyDetectionResult>({ legacyStateFound: false });
  });

  it("returns false on a normal restart with initialized data and meaningful feedback", async () => {
    const data = new FakePluginDataStore({
      ...DEFAULT_SETTINGS,
      _trapdoor: { hasInitialized: true, legacyFeedbackAcknowledged: false },
    });
    const files = new FakeTextFileStore();
    await writeMeaningfulFeedback(files);

    await expect(detectLegacyFeedbackOnce(data, files)).resolves.toEqual({ legacyStateFound: false });
  });

  it("detects meaningful feedback when data.json is missing/reset and durably acknowledges it", async () => {
    const data = new FakePluginDataStore({});
    const files = new FakeTextFileStore();
    await writeMeaningfulFeedback(files);

    await expect(detectLegacyFeedbackOnce(data, files)).resolves.toEqual({ legacyStateFound: true });

    expect(data.data).toEqual({
      ...DEFAULT_SETTINGS,
      _trapdoor: { hasInitialized: true, legacyFeedbackAcknowledged: true },
    });
    await expect(detectLegacyFeedbackOnce(data, files)).resolves.toEqual({ legacyStateFound: false });
  });

  it("does not report legacy after feedback has been cleared", async () => {
    const data = new FakePluginDataStore({});
    const files = new FakeTextFileStore();
    const store = new FeedbackStore();
    store.recordShown(candidate(), 10);
    await clearFeedback(files, store);

    await expect(detectLegacyFeedbackOnce(data, files)).resolves.toEqual({ legacyStateFound: false });
  });

  it("only exposes a signal and has no CopySystem or UI dependency", async () => {
    const data = new FakePluginDataStore({});
    const files = new FakeTextFileStore();
    await writeMeaningfulFeedback(files);

    const result = await detectLegacyFeedbackOnce(data, files);

    expect(Object.keys(result)).toEqual(["legacyStateFound"]);
  });
});
