import { MarkdownView, type App } from "obsidian";

import type { ActiveNoteAdapter, ActiveNote } from "./challenge-controller";

export class ObsidianActiveNoteAdapter implements ActiveNoteAdapter {
  constructor(private readonly app: App) {}

  getActiveNote(): ActiveNote | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) return null;

    const markdown = view.editor.getValue();
    const cursorOffset = view.editor.posToOffset(view.editor.getCursor());
    return {
      markdown,
      cursorOffset,
      notePath: view.file.path,
    };
  }

  replaceMarkdown(markdown: string): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      throw new Error("Active Markdown note is unavailable.");
    }
    view.editor.setValue(markdown);
  }
}
