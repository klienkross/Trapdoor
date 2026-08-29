import { Plugin } from "obsidian";

import {
  ChallengeView,
  TRAPDOOR_VIEW_TYPE,
} from "./ui/challenge-view";
import type { ChallengeViewActions } from "./ui/challenge-view-renderer";

export const REQUEST_CHALLENGE_COMMAND_ID = "trapdoor-request-challenge";
export const REQUEST_CHALLENGE_COMMAND_NAME = "推我下去";

type PluginConstructorArgs = ConstructorParameters<typeof Plugin>;

export default class TrapdoorPlugin extends Plugin {
  private readonly actions: ChallengeViewActions;

  constructor(
    app: PluginConstructorArgs[0],
    manifest: PluginConstructorArgs[1],
    actions: ChallengeViewActions = createUnwiredChallengeViewActions(),
  ) {
    super(app, manifest);
    this.actions = actions;
  }

  async onload(): Promise<void> {
    this.registerView(
      TRAPDOOR_VIEW_TYPE,
      (leaf) => new ChallengeView(leaf, this.actions),
    );

    this.addCommand({
      id: REQUEST_CHALLENGE_COMMAND_ID,
      name: REQUEST_CHALLENGE_COMMAND_NAME,
      callback: async () => {
        await this.activateChallengeView();
        await this.actions.requestChallenge();
      },
    });
  }

  async activateChallengeView(): Promise<void> {
    const workspace = this.app.workspace;
    let leaf = workspace.getLeavesOfType(TRAPDOOR_VIEW_TYPE)[0];

    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? undefined;
      if (!leaf) {
        return;
      }

      await leaf.setViewState({
        type: TRAPDOOR_VIEW_TYPE,
        active: true,
      });
    }

    await workspace.revealLeaf(leaf);
  }
}

function createUnwiredChallengeViewActions(): ChallengeViewActions {
  const notWired = async (): Promise<never> => {
    throw new Error("Challenge orchestration is not wired until Task 16");
  };

  return {
    requestChallenge: notWired,
    continueDrill: notWired,
    markUseful: notWired,
    markCannotAnswer: notWired,
    markBad: notWired,
    replace: notWired,
    submitDrillAnswer: notWired,
    exitDrill: notWired,
    returnToIdle: notWired,
  };
}
