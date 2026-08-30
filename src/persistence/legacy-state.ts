import { hasMeaningfulFeedback, loadFeedback, type TextFileStore } from "./feedback-persistence";
import {
  loadPluginData,
  savePluginData,
  type PluginDataStore,
} from "./settings-store";

export type LegacyDetectionResult = {
  legacyStateFound: boolean;
};

export async function detectLegacyFeedbackOnce(
  dataStore: PluginDataStore,
  files: TextFileStore,
): Promise<LegacyDetectionResult> {
  const pluginData = await loadPluginData(dataStore);
  const feedback = await loadFeedback(files);

  if (pluginData.meta.hasInitialized) {
    return { legacyStateFound: false };
  }

  const legacyStateFound = hasMeaningfulFeedback(feedback.exportState());
  await savePluginData(dataStore, pluginData.settings, {
    hasInitialized: true,
    legacyFeedbackAcknowledged: legacyStateFound,
  });

  return { legacyStateFound };
}
