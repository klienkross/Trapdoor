import { Plugin } from "obsidian";

import { createChallengeController, type ChallengeController } from "./app/challenge-controller";
import { ObsidianActiveNoteAdapter } from "./app/obsidian-active-note-adapter";
import { createCopySystem } from "./copy/copy-system";
import { OpenAICompatibleProvider } from "./llm/openai-compatible-provider";
import { loadFeedback, saveFeedback, type TextFileStore } from "./persistence/feedback-persistence";
import { detectLegacyFeedbackOnce } from "./persistence/legacy-state";
import { loadPluginData, type PluginDataStore } from "./persistence/settings-store";
import { writeClipboardText } from "./ui/clipboard";
import {
  ChallengeView,
  TRAPDOOR_VIEW_TYPE,
} from "./ui/challenge-view";
import type { ChallengeViewActions } from "./ui/challenge-view-renderer";

export const REQUEST_CHALLENGE_COMMAND_ID = "trapdoor-request-challenge";
export const REQUEST_CHALLENGE_COMMAND_NAME = "推我下去";

type PluginConstructorArgs = ConstructorParameters<typeof Plugin>;

export default class TrapdoorPlugin extends Plugin {
  private actions?: ChallengeViewActions;
  private controller?: ChallengeController;
  private challengeView?: ChallengeView;

  constructor(
    app: PluginConstructorArgs[0],
    manifest: PluginConstructorArgs[1],
    testActions?: ChallengeViewActions,
  ) {
    super(app, manifest);
    this.actions = testActions;
  }

  async onload(): Promise<void> {
    if (!this.actions) {
      await this.initializeProductionWiring();
    }

    const actions = this.requireActions();
    this.registerView(
      TRAPDOOR_VIEW_TYPE,
      (leaf) => {
        const view = new ChallengeView(leaf, actions);
        this.challengeView = view;
        this.controller?.renderCurrentState();
        return view;
      },
    );

    this.addCommand({
      id: REQUEST_CHALLENGE_COMMAND_ID,
      name: REQUEST_CHALLENGE_COMMAND_NAME,
      callback: async () => {
        await this.activateChallengeView();
        await actions.requestChallenge();
      },
    });
  }

  async activateChallengeView(): Promise<void> {
    const workspace = this.app.workspace;
    const existingLeaves = workspace.getLeavesOfType(TRAPDOOR_VIEW_TYPE);
    let leaf: (typeof existingLeaves)[number] | undefined = existingLeaves[0];

    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? undefined;
      if (!leaf) return;

      await leaf.setViewState({
        type: TRAPDOOR_VIEW_TYPE,
        active: true,
      });
    }

    await workspace.revealLeaf(leaf);
  }

  private async initializeProductionWiring(): Promise<void> {
    const dataStore: PluginDataStore = {
      loadData: () => this.loadData(),
      saveData: (data) => this.saveData(data),
    };
    const files = this.createFeedbackFileStore();
    const pluginData = await loadPluginData(dataStore);
    const feedbackStore = await loadFeedback(files);
    const legacy = await detectLegacyFeedbackOnce(dataStore, files);
    const copySystem = createCopySystem();
    const provider = new OpenAICompatibleProvider({
      endpoint: pluginData.settings.endpoint,
      model: pluginData.settings.model,
      apiKey: pluginData.settings.apiKey,
    });

    this.controller = createChallengeController({
      activeNote: new ObsidianActiveNoteAdapter(this.app),
      feedbackStore,
      copySystem,
      settings: pluginData.settings,
      provider,
      providerReady: () => Boolean(pluginData.settings.endpoint.trim() && pluginData.settings.model.trim()),
      copyQuestion: writeClipboardText,
      persistFeedback: () => saveFeedback(files, feedbackStore),
      renderState: (state) => this.challengeView?.renderState(state),
      initialCopy: legacy.legacyStateFound
        ? copySystem.next("legacy_state_found") ?? undefined
        : undefined,
    });
    this.actions = this.controller.actions;
  }

  private createFeedbackFileStore(): TextFileStore {
    const adapter = this.app.vault.adapter;
    const pluginDir = this.manifest.dir ?? `.obsidian/plugins/${this.manifest.id}`;
    const resolvePath = (path: string): string => `${pluginDir}/${path}`;

    return {
      read: async (path) => {
        const resolved = resolvePath(path);
        if (!(await adapter.exists(resolved))) return null;
        return adapter.read(resolved);
      },
      write: async (path, contents) => {
        await adapter.write(resolvePath(path), contents);
      },
    };
  }

  private requireActions(): ChallengeViewActions {
    if (!this.actions) {
      throw new Error("Trapdoor challenge actions were not initialized.");
    }
    return this.actions;
  }
}
