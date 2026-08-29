export class WorkspaceLeaf {}

export class ItemView {
  readonly contentEl: HTMLElement;

  constructor(_leaf: WorkspaceLeaf) {
    this.contentEl = document.createElement("div");
  }
}
