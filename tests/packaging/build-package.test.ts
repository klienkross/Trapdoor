import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const root = process.cwd();
const mainPath = join(root, "main.js");
const distPath = join(root, "dist");

describe("plugin packaging", () => {
  test("build emits a non-empty Obsidian bundle and package emits only install files", () => {
    rmSync(mainPath, { force: true });
    rmSync(distPath, { recursive: true, force: true });

    execFileSync("npm", ["run", "build"], { cwd: root, stdio: "pipe" });

    expect(existsSync(mainPath)).toBe(true);
    expect(statSync(mainPath).size).toBeGreaterThan(0);

    const bundle = readFileSync(mainPath, "utf8");
    expect(bundle).toMatch(/require\(["']obsidian["']\)/);

    execFileSync("npm", ["run", "package"], { cwd: root, stdio: "pipe" });

    const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as {
      id: string;
      version: string;
    };
    expect(manifest.id).toBe("trapdoor");

    const zipPath = join(distPath, `trapdoor-${manifest.version}.zip`);
    expect(existsSync(zipPath)).toBe(true);

    const entries = execFileSync("unzip", ["-Z1", zipPath], {
      cwd: root,
      encoding: "utf8",
    })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .sort();

    expect(entries).toEqual(["main.js", "manifest.json", "styles.css"]);
  });
});
