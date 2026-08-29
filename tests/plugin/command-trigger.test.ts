import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import TrapdoorPlugin from "../../src/main";
import {
  ChallengeView,
  TRAPDOOR_VIEW_TYPE,
} from "../../src/ui/challenge-view";
import type { ChallengeViewActions } from "../../src/ui/challenge-view-renderer";
import { WorkspaceLeaf } from "obsidian";

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
  return {
    getLeavesOfType: vi.fn(() => existing),
    getRightLeaf: vi.fn(() => created),
    revealLeaf: vi.fn(),
    created,
  };
}

function makePlugin(actions = makeActions(), existing: WorkspaceLeaf[] = []) {
  const workspace = makeWorkspace(existing);
  const plugin = new TrapdoorPlugin(
    { workspace } as never,
    {} as never,
    actions,
  );
  return { plugin, workspace, actions };
}

describe("Task 15 challenge UI registration", () => {
  it("registers the Task 14 view type and creates ChallengeView with the shared actions", async () => {
    installDocument();
    const { plugin, actions } = makePlugin();

    await plugin.onload();

    expect(plugin.registeredViews).toHaveLength(1);
    const registration = plugin.registeredViews[0]!;
    expect(registration.type).toBe(TRAPDOOR_VIEW_TYPE);

    const view = registration.creator(new WorkspaceLeaf());
    expect(view).toBeInstanceOf(ChallengeView);
    expect((view as ChallengeView & { actions: ChallengeViewActions }).actions).toBe(actions);
  });

  it("registers one stable assignable command without a hard-coded default hotkey", async () => {
    const { plugin } = makePlugin();

    await plugin.onload();

    expect(plugin.commands).toHaveLength(1);
    expect(plugin.commands[0]).toMatchObject({
      id: "trapdoor-request-challenge",
      name: "推我下去",
    });
    expect(plugin.commands[0]).not.toHaveProperty("hotkeys");
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
    expect(workspace.created.viewStates).toEqual([
      { type: TRAPDOOR_VIEW_TYPE, active: true },
    ]);
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
    const { plugin, workspace } = makePlugin(actions);
    workspace.revealLeaf.mockImplementation(() => {
      events.push("reveal");
    });

    await plugin.onload();
    await plugin.commands[0]!.callback();

    expect(events).toEqual(["reveal", "request"]);
    expect(actions.requestChallenge).toHaveBeenCalledTimes(1);
  });

  it("button and command both call the exact same requestChallenge function", async () => {
    installDocument();
    const actions = makeActions();
    const { plugin } = makePlugin(actions);

    await plugin.onload();
    const view = plugin.registeredViews[0]!.creator(new WorkspaceLeaf()) as ChallengeView;
    await view.onOpen();

    const button = view.contentEl.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toBe("推我下去");
    button.click();
    expect(actions.requestChallenge).toHaveBeenCalledTimes(1);

    await plugin.commands[0]!.callback();
    expect(actions.requestChallenge).toHaveBeenCalledTimes(2);
  });
});
