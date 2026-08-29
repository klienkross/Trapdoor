import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import TrapdoorPlugin from "../../src/main";
import {
  ChallengeView,
  TRAPDOOR_VIEW_TYPE,
} from "../../src/ui/challenge-view";
import type { ChallengeViewActions } from "../../src/ui/challenge-view-renderer";
import { WorkspaceLeaf } from "obsidian";

type ViewRegistration = {
  type: string;
  creator: Parameters<TrapdoorPlugin["registerView"]>[1];
};

type CommandRegistration = Parameters<TrapdoorPlugin["addCommand"]>[0];

function makeActions(): ChallengeViewActions {
  return {
    requestChallenge: vi.fn(),
    continueDrill: vi.fn(),
    markUseful: vi.fn(),
    markCannotAnswer: vi.fn(),
    markBad: vi.fn(),
    replace: vi.fn(),
    submitDrillAnswer: vi.fn(),
    exitDrill: vi.fn(),
    returnToIdle: vi.fn(),
  };
}

function installDocument(): void {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("document", dom.window.document);
}

function makeWorkspace(existing: WorkspaceLeaf[] = []) {
  const created = new WorkspaceLeaf();
  const setViewState = vi.spyOn(created, "setViewState").mockResolvedValue();
  return {
    getLeavesOfType: vi.fn(() => existing),
    getRightLeaf: vi.fn(() => created),
    revealLeaf: vi.fn(),
    created,
    setViewState,
  };
}

function makePlugin(actions = makeActions(), existing: WorkspaceLeaf[] = []) {
  const workspace = makeWorkspace(existing);
  const plugin = new TrapdoorPlugin(
    { workspace } as never,
    {} as never,
    actions,
  );
  const views: ViewRegistration[] = [];
  const commands: CommandRegistration[] = [];

  vi.spyOn(plugin, "registerView").mockImplementation((type, creator) => {
    views.push({ type, creator });
  });
  vi.spyOn(plugin, "addCommand").mockImplementation((command) => {
    commands.push(command);
    return command;
  });

  return { plugin, workspace, actions, views, commands };
}

async function invokeCommand(command: CommandRegistration): Promise<void> {
  if (!command.callback) {
    throw new Error("Expected a callback command");
  }
  await command.callback();
}

describe("Task 15 challenge UI registration", () => {
  it("registers the Task 14 view type and creates ChallengeView", async () => {
    installDocument();
    const { plugin, views } = makePlugin();

    await plugin.onload();

    expect(views).toHaveLength(1);
    expect(views[0]!.type).toBe(TRAPDOOR_VIEW_TYPE);
    expect(views[0]!.creator(new WorkspaceLeaf())).toBeInstanceOf(ChallengeView);
  });

  it("registers one stable assignable command without a hard-coded default hotkey", async () => {
    const { plugin, commands } = makePlugin();

    await plugin.onload();

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      id: "trapdoor-request-challenge",
      name: "推我下去",
    });
    expect(commands[0]).not.toHaveProperty("hotkeys");
  });

  it("does not request a challenge merely by loading and registering the plugin", async () => {
    const { plugin, actions } = makePlugin();

    await plugin.onload();

    expect(actions.requestChallenge).not.toHaveBeenCalled();
  });

  it("reuses and reveals an existing Trapdoor leaf", async () => {
    const existing = new WorkspaceLeaf();
    const { plugin, workspace } = makePlugin(makeActions(), [existing]);

    await plugin.activateChallengeView();

    expect(workspace.getLeavesOfType).toHaveBeenCalledWith(TRAPDOOR_VIEW_TYPE);
    expect(workspace.getRightLeaf).not.toHaveBeenCalled();
    expect(workspace.revealLeaf).toHaveBeenCalledWith(existing);
  });

  it("creates the right sidebar view only when no Trapdoor leaf exists", async () => {
    const { plugin, workspace } = makePlugin();

    await plugin.activateChallengeView();

    expect(workspace.getRightLeaf).toHaveBeenCalledWith(false);
    expect(workspace.setViewState).toHaveBeenCalledWith({
      type: TRAPDOOR_VIEW_TYPE,
      active: true,
    });
    expect(workspace.revealLeaf).toHaveBeenCalledWith(workspace.created);
  });

  it("gracefully handles an unavailable right leaf", async () => {
    const actions = makeActions();
    const workspace = makeWorkspace();
    workspace.getRightLeaf.mockReturnValue(null as never);
    const plugin = new TrapdoorPlugin({ workspace } as never, {} as never, actions);

    await expect(plugin.activateChallengeView()).resolves.toBeUndefined();
    expect(workspace.revealLeaf).not.toHaveBeenCalled();
  });

  it("command activates the sidebar before invoking the shared requestChallenge action", async () => {
    const events: string[] = [];
    const actions = makeActions();
    actions.requestChallenge = vi.fn(() => {
      events.push("request");
    });
    const { plugin, workspace, commands } = makePlugin(actions);
    workspace.revealLeaf.mockImplementation(() => {
      events.push("reveal");
    });

    await plugin.onload();
    await invokeCommand(commands[0]!);

    expect(events).toEqual(["reveal", "request"]);
    expect(actions.requestChallenge).toHaveBeenCalledTimes(1);
  });

  it("button and command both call the exact same requestChallenge function", async () => {
    installDocument();
    const actions = makeActions();
    const { plugin, views, commands } = makePlugin(actions);

    await plugin.onload();
    const view = views[0]!.creator(new WorkspaceLeaf()) as ChallengeView;
    await view.onOpen();

    const button = view.contentEl.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toBe("推我下去");
    button.click();
    expect(actions.requestChallenge).toHaveBeenCalledTimes(1);

    await invokeCommand(commands[0]!);
    expect(actions.requestChallenge).toHaveBeenCalledTimes(2);
  });
});
