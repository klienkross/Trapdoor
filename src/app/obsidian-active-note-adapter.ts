import { MarkdownView, type App } from "obsidian";

import type { ActiveNoteAdapter, ActiveNote } from "./challenge-controller";

export class ObsidianActiveNoteAdapter implements ActiveNoteAdapter {
  private lastMarkdownView?: MarkdownView;

  constructor(private readonly app: App) {}

  getActiveNote(): ActiveNote | null {
    const view = this.resolveMarkdownView();
    if (!view) return null;

    const markdown = view.editor.getValue();
    const cursorOffset = view.editor.posToOffset(view.editor.getCursor());
    return {
      markdown,
      cursorOffset,
      notePath: view.file!.path,
    };
  }

  replaceMarkdown(markdown: string): void {
    const view = this.resolveMarkdownView();
    if (!view) {
      throw new Error("Active Markdown note is unavailable.");
    }
    view.editor.setValue(markdown);
  }

  private resolveMarkdownView(): MarkdownView | null {
    const current = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (current?.file) {
      this.lastMarkdownView = current;
      return current;
    }

    const remembered = this.lastMarkdownView;
    if (!remembered?.file) return null;

    const isStillOpen = this.app.workspace
      .getLeavesOfType("markdown")
      .some((leaf) => leaf.view === remembered);
    if (!isStillOpen) {
      this.lastMarkdownView = undefined;
      return null;
    }

    return remembered;
  }
}
