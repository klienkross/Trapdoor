export type ViewCreator = (leaf: WorkspaceLeaf) => ItemView;

export type Command = {
  id: string;
  name: string;
  callback: () => void | Promise<void>;
  hotkeys?: unknown;
};

export class WorkspaceLeaf {
  readonly viewStates: unknown[] = [];

  async setViewState(state: unknown): Promise<void> {
    this.viewStates.push(state);
  }
}

export class ItemView {
  readonly contentEl: HTMLElement;

  constructor(_leaf: WorkspaceLeaf) {
    this.contentEl = document.createElement("div");
  }
}

export class MarkdownView {}
export type App = never;

export class Plugin {
  readonly registeredViews: Array<{ type: string; creator: ViewCreator }> = [];
  readonly commands: Command[] = [];
  private pluginData: unknown = null;

  constructor(
    public readonly app: { workspace: unknown },
    public readonly manifest: unknown,
  ) {}

  registerView(type: string, creator: ViewCreator): void {
    this.registeredViews.push({ type, creator });
  }

  addCommand(command: Command): void {
    this.commands.push(command);
  }

  async loadData(): Promise<unknown> {
    return this.pluginData;
  }

  async saveData(data: unknown): Promise<void> {
    this.pluginData = data;
  }
}
