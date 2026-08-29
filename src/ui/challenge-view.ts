import { ItemView, type WorkspaceLeaf } from "obsidian";

import {
  renderChallengeViewState,
  type ChallengeViewActions,
  type ChallengeViewState,
} from "./challenge-view-renderer";

export const TRAPDOOR_VIEW_TYPE = "trapdoor-challenge";

export class ChallengeView extends ItemView {
  private state: ChallengeViewState = { kind: "idle" };

  constructor(
    leaf: WorkspaceLeaf,
    private readonly actions: ChallengeViewActions,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return TRAPDOOR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Trapdoor";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    this.contentEl.replaceChildren();
  }

  setState(state: ChallengeViewState): void {
    this.state = state;
    this.render();
  }

  private render(): void {
    renderChallengeViewState(this.contentEl, this.state, this.actions);
  }
}
