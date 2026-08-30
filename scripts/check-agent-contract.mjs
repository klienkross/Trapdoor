import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { checkBoundedPrompt, renderBoundedHandoff } from "./bounded-agent-handoff.mjs";

const root = process.cwd();

function fail(message) {
  console.error(`agent:check: ${message}`);
  process.exit(1);
}

function readText(path) {
  try {
    return readFileSync(resolve(root, path), "utf8");
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }
}

function readJson(path) {
  try {
    return JSON.parse(readText(path));
  } catch (error) {
    fail(`invalid JSON in ${path}: ${error.message}`);
  }
}

function requireFile(path) {
  try {
    if (!statSync(resolve(root, path)).isFile()) {
      fail(`${path} is not a file`);
    }
  } catch {
    fail(`missing required file: ${path}`);
  }
}

function requireExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }

  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.join("\n") !== wanted.join("\n")) {
    fail(`${label} keys must be exactly: ${wanted.join(", ")}; got: ${actual.join(", ")}`);
  }
}

const requiredDocs = [
  "docs/agent/project-contract.md",
  "docs/agent/architecture-map.md",
  "docs/agent/task-template.md",
  "docs/agent/project-state.json",
];
requiredDocs.forEach(requireFile);

const requiredTooling = [
  "skills/bounded-agent-handoffs/SKILL.md",
  "scripts/bounded-agent-handoff.mjs",
  "scripts/bounded-agent-handoff.d.mts",
];
requiredTooling.forEach(requireFile);

const state = readJson("docs/agent/project-state.json");
requireExactKeys(state, ["version", "paths", "promptBudgetWords"], "project-state");
requireExactKeys(
  state.paths,
  ["projectContract", "architecture", "taskTemplate", "productSpec"],
  "project-state.paths",
);
requireExactKeys(state.promptBudgetWords, ["bugfix", "feature"], "project-state.promptBudgetWords");

if (state.version !== 1) {
  fail(`project-state.version must be 1; got ${state.version}`);
}

for (const [name, path] of Object.entries(state.paths)) {
  if (typeof path !== "string" || path.length === 0) {
    fail(`project-state.paths.${name} must be a non-empty string`);
  }
  requireFile(path);
}

const { bugfix, feature } = state.promptBudgetWords;
for (const [name, value] of Object.entries({ bugfix, feature })) {
  if (!Number.isInteger(value) || value <= 0) {
    fail(`prompt budget ${name} must be a positive integer`);
  }
}
if (bugfix > 1500) fail(`bugfix prompt budget must be <= 1500; got ${bugfix}`);
if (feature > 2500) fail(`feature prompt budget must be <= 2500; got ${feature}`);
if (bugfix > feature) fail("bugfix prompt budget must not exceed feature prompt budget");

const packageJson = readJson("package.json");
const manifest = readJson("manifest.json");
if (packageJson.version !== manifest.version) {
  fail(`package.json version ${packageJson.version} does not match manifest.json ${manifest.version}`);
}
if (packageJson.scripts?.["agent:handoff"] !== "node scripts/bounded-agent-handoff.mjs") {
  fail("package.json must expose the repo-local handoff helper as agent:handoff");
}

const template = readText(state.paths.taskTemplate);
for (const marker of [
  "## Bounded prompt template",
  "## Startup",
  "## Completion",
  "## Prompt budget",
  "## Local helper",
]) {
  if (!template.includes(marker)) {
    fail(`task template is missing required section: ${marker}`);
  }
}

const skill = readText("skills/bounded-agent-handoffs/SKILL.md");
if (!skill.includes("name: bounded-agent-handoffs")) {
  fail("bounded-agent-handoffs skill is missing its canonical name");
}
if (/Trapdoor|Obsidian|docs\/agent\/project-contract\.md/.test(skill)) {
  fail("bounded-agent-handoffs skill must stay project-agnostic");
}

const rendered = renderBoundedHandoff(
  {
    worker: "contract smoke",
    base: "example/base",
    task: ["Verify one bounded infrastructure behavior"],
    acceptance: ["Keep durable history outside the prompt"],
    forbid: ["Do not expand product scope"],
  },
  {
    projectContract: state.paths.projectContract,
    architecture: state.paths.architecture,
  },
);
const renderedCheck = checkBoundedPrompt(rendered, bugfix);
if (!renderedCheck.ok) {
  fail(`rendered bounded handoff failed its own checker: ${renderedCheck.issues.join("; ")}`);
}

const obviousBloat = checkBoundedPrompt(
  "Task 1 -> abcdef1234567890abcdef1234567890abcdef12\nTask 2 -> 1234567890abcdef1234567890abcdef12345678\nGitHub Actions run #174 was green",
  bugfix,
);
if (obviousBloat.ok) {
  fail("bounded handoff checker must reject obvious history/CI prompt bloat");
}

console.log("agent:check: OK");
