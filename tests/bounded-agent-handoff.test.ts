import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type HandoffModule = typeof import("../scripts/bounded-agent-handoff.mjs");

async function loadHandoff(): Promise<HandoffModule> {
  return import("../scripts/bounded-agent-handoff.mjs");
}

describe("bounded agent handoff pressure scenarios", () => {
  it("keeps the reusable skill project-agnostic", () => {
    const skill = readFileSync("skills/bounded-agent-handoffs/SKILL.md", "utf8");

    expect(skill).toContain("name: bounded-agent-handoffs");
    expect(skill).not.toMatch(/Trapdoor|Obsidian|docs\/agent\/project-contract\.md/);
  });

  it("renders only task-local assignment fields plus canonical project pointers", async () => {
    const { renderBoundedHandoff } = await loadHandoff();
    const prompt = renderBoundedHandoff(
      {
        worker: "sidebar polish",
        base: "infra/example",
        task: ["Make empty state visible"],
        acceptance: ["No persistence changes"],
        forbid: ["Do not change ranking"],
        read: ["src/ui/", "tests/ui.test.ts"],
      },
      {
        projectContract: "docs/agent/project-contract.md",
        architecture: "docs/agent/architecture-map.md",
      },
    );

    expect(prompt).toContain("sidebar polish");
    expect(prompt).toContain("infra/example");
    expect(prompt).toContain("docs/agent/project-contract.md");
    expect(prompt).toContain("docs/agent/architecture-map.md");
    expect(prompt).toContain("Make empty state visible");
    expect(prompt).toContain("No persistence changes");
    expect(prompt).toContain("Do not change ranking");
    expect(prompt).not.toContain("RED → GREEN");
    expect(prompt).not.toContain("previous CI");
  });

  it("rejects obvious history replay and CI evidence copied into a prompt", async () => {
    const { checkBoundedPrompt } = await loadHandoff();
    const result = checkBoundedPrompt(
      `Task 1 -> abcdef1234567890abcdef1234567890abcdef12\nTask 2 -> 1234567890abcdef1234567890abcdef12345678\nGitHub Actions run #174 was green`,
      1500,
    );

    expect(result.ok).toBe(false);
    expect(result.issues.join("\n")).toMatch(/history|SHA|Actions/i);
  });

  it("rejects prompts over the configured budget without truncating them", async () => {
    const { checkBoundedPrompt } = await loadHandoff();
    const prompt = Array.from({ length: 12 }, (_, index) => `token${index}`).join(" ");
    const result = checkBoundedPrompt(prompt, 10);

    expect(result.ok).toBe(false);
    expect(result.wordLikeCount).toBe(12);
    expect(result.issues.join("\n")).toMatch(/budget/i);
  });

  it("accepts a compact task-local prompt", async () => {
    const { checkBoundedPrompt } = await loadHandoff();
    const result = checkBoundedPrompt(
      `Base: infra/example\nRead: canonical contract\nTask: fix one renderer state\nAcceptance: visible feedback\nDo not: change ranking`,
      1500,
    );

    expect(result).toMatchObject({ ok: true, issues: [] });
  });
});
