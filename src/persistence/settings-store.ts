import { DEFAULT_SETTINGS, type TrapdoorSettings } from "../settings";

export type PluginDataStore = {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
};

export type PluginMeta = {
  hasInitialized: boolean;
  legacyFeedbackAcknowledged: boolean;
};

export type TrapdoorPluginData = {
  settings: TrapdoorSettings;
  meta: PluginMeta;
};

const DEFAULT_META: PluginMeta = {
  hasInitialized: false,
  legacyFeedbackAcknowledged: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSettings(raw: unknown): TrapdoorSettings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS };

  return {
    endpoint: typeof raw.endpoint === "string" ? raw.endpoint : DEFAULT_SETTINGS.endpoint,
    model: typeof raw.model === "string" ? raw.model : DEFAULT_SETTINGS.model,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : DEFAULT_SETTINGS.apiKey,
    debug: typeof raw.debug === "boolean" ? raw.debug : DEFAULT_SETTINGS.debug,
  };
}

function readMeta(raw: unknown): PluginMeta {
  if (!isRecord(raw) || !isRecord(raw._trapdoor)) return { ...DEFAULT_META };

  return {
    hasInitialized: raw._trapdoor.hasInitialized === true,
    legacyFeedbackAcknowledged: raw._trapdoor.legacyFeedbackAcknowledged === true,
  };
}

export async function loadPluginData(store: PluginDataStore): Promise<TrapdoorPluginData> {
  const raw = await store.loadData();
  return {
    settings: readSettings(raw),
    meta: readMeta(raw),
  };
}

export async function loadSettings(store: PluginDataStore): Promise<TrapdoorSettings> {
  return (await loadPluginData(store)).settings;
}

export async function savePluginData(
  store: PluginDataStore,
  settings: TrapdoorSettings,
  meta: PluginMeta,
): Promise<void> {
  await store.saveData({
    endpoint: settings.endpoint,
    model: settings.model,
    apiKey: settings.apiKey,
    debug: settings.debug,
    _trapdoor: {
      hasInitialized: meta.hasInitialized,
      legacyFeedbackAcknowledged: meta.legacyFeedbackAcknowledged,
    },
  });
}

export async function saveSettings(store: PluginDataStore, settings: TrapdoorSettings): Promise<void> {
  const current = await loadPluginData(store);
  await savePluginData(store, settings, {
    hasInitialized: true,
    legacyFeedbackAcknowledged: current.meta.legacyFeedbackAcknowledged,
  });
}
