import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import type { MarkdownView, WorkspaceLeaf } from "obsidian";

import { ObsidianActiveNoteAdapter } from "../../src/app/obsidian-active-note-adapter";
import TrapdoorPlugin from "../../src/main";
import { TRAPDOOR_VIEW_TYPE } from "../../src/ui/challenge-view";

function installDocument(): void {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("document", dom.window.document);
}

function fakeMarkdownView(getMarkdown: () => string, setMarkdown: (value: string) => void, offset: () => number): MarkdownView {
  return {
    file: { path: "notes/a.md" },
    editor: {
      getValue: getMarkdown,
      getCursor: () => ({ line: 1, ch: 4 }),
      posToOffset: offset,
      setValue: setMarkdown,
    },
  } as unknown as MarkdownView;
}

type TestPluginSurface = {
  registeredViews: Array<{ type: string; creator: (leaf: WorkspaceLeaf) => { contentEl: HTMLElement; onOpen(): Promise<void> } }>;
  commands: Array<{ callback: () => void | Promise<void> }>;
};

describe("Task 16 production Obsidian wiring", () => {
  it("reads and replaces the active Markdown note through the concentrated editor adapter", () => {
    let markdown = "# 当前\nX 导致 Y。";
    const markdownView = fakeMarkdownView(() => markdown, (value) => { markdown = value; }, () => 7);
    const app = { workspace: { getActiveViewOfType: vi.fn(() => markdownView) } };
    const adapter = new ObsidianActiveNoteAdapter(app as never);

    expect(adapter.getActiveNote()).toEqual({ markdown, cursorOffset: 7, notePath: "notes/a.md" });
    adapter.replaceMarkdown("changed");
    expect(markdown).toBe("changed");
  });

  it("uses fully wired actions for normal two-argument production construction and does not call network on startup or first challenge", async () => {
    installDocument();
    const leaf = { setViewState: vi.fn(async () => undefined) } as unknown as WorkspaceLeaf;
    let markdown = "# 机制\n缓存命中率提高导致请求延迟降低。";
    const markdownView = fakeMarkdownView(() => markdown, (value) => { markdown = value; }, () => markdown.indexOf("缓存"));
    const writes: Record<string, string> = {};
    const workspace = {
      getActiveViewOfType: vi.fn(() => markdownView),
      getLeavesOfType: vi.fn(() => [leaf]),
      getRightLeaf: vi.fn(() => leaf),
      revealLeaf: vi.fn(),
    };
    const app = {
      workspace,
      vault: {
        adapter: {
          exists: vi.fn(async () => false),
          read: vi.fn(async (path: string) => writes[path] ?? ""),
          write: vi.fn(async (path: string, value: string) => { writes[path] = value; }),
        },
      },
    };
    const fetchSpy = vi.fn(async () => { throw new Error("network must remain unused"); });
    vi.stubGlobal("fetch", fetchSpy);
    const plugin = new TrapdoorPlugin(app as never, { id: "trapdoor", dir: ".obsidian/plugins/trapdoor" } as never);
    const testPlugin = plugin as unknown as TestPluginSurface;

    await plugin.onload();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(testPlugin.registeredViews).toHaveLength(1);
    expect(testPlugin.registeredViews[0]!.type).toBe(TRAPDOOR_VIEW_TYPE);

    const view = testPlugin.registeredViews[0]!.creator(leaf);
    await view.onOpen();
    const button = view.contentEl.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toBe("推我下去");

    await testPlugin.commands[0]!.callback();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(view.contentEl.textContent).toContain("来自：当前小节");
    expect(writes[".obsidian/plugins/trapdoor/question-feedback.json"]).toContain('"action": "shown"');
  });
});
