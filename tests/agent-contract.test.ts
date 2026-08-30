import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("agent handoff contract", () => {
  it("passes the repository agent contract checker", () => {
    const result = spawnSync(process.execPath, ["scripts/check-agent-contract.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
