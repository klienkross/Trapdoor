import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type TrapdoorSettings } from "../src/settings";
import {
  loadPluginData,
  loadSettings,
  saveSettings,
  type PluginDataStore,
} from "../src/persistence/settings-store";

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

describe("Trapdoor settings persistence", () => {
  it("uses predictable defaults when data.json is missing", async () => {
    const store = new FakePluginDataStore(null);

    await expect(loadSettings(store)).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it("merges valid partial persisted settings over defaults", async () => {
    const store = new FakePluginDataStore({ debug: true });

    await expect(loadSettings(store)).resolves.toEqual({ ...DEFAULT_SETTINGS, debug: true });
  });

  it("round-trips endpoint, model, apiKey, and debug", async () => {
    const store = new FakePluginDataStore(null);
    const settings: TrapdoorSettings = {
      endpoint: "https://example.test/v1",
      model: "example-model",
      apiKey: "secret-value",
      debug: true,
    };

    await saveSettings(store, settings);

    await expect(loadSettings(store)).resolves.toEqual(settings);
  });

  it("falls back field-by-field for wrong types and ignores unknown fields", async () => {
    const store = new FakePluginDataStore({
      endpoint: 42,
      model: "kept-model",
      apiKey: false,
      debug: "yes",
      surprise: "ignored",
    });

    await expect(loadSettings(store)).resolves.toEqual({
      ...DEFAULT_SETTINGS,
      model: "kept-model",
    });
  });

  it("saveData receives only the canonical settings fields plus persistence metadata", async () => {
    const store = new FakePluginDataStore({ surprise: "remove-me" });
    const settings: TrapdoorSettings = {
      endpoint: "https://example.test/v1",
      model: "model-a",
      apiKey: "key-a",
      debug: true,
    };

    await saveSettings(store, settings);

    expect(store.saved.at(-1)).toEqual({
      ...settings,
      _trapdoor: {
        hasInitialized: true,
        legacyFeedbackAcknowledged: false,
      },
    });
  });

  it("preserves durable legacy acknowledgement when settings are later saved", async () => {
    const store = new FakePluginDataStore({
      ...DEFAULT_SETTINGS,
      _trapdoor: {
        hasInitialized: true,
        legacyFeedbackAcknowledged: true,
      },
    });

    await saveSettings(store, { ...DEFAULT_SETTINGS, debug: true });

    const loaded = await loadPluginData(store);
    expect(loaded.meta.legacyFeedbackAcknowledged).toBe(true);
  });
});
