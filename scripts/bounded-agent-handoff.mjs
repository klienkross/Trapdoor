import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeList(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new TypeError(`${label} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

function listSection(title, values) {
  if (values.length === 0) return "";
  return `\n${title}:\n${values.map((value) => `- ${value}`).join("\n")}\n`;
}

export function countWordLike(text) {
  return (String(text).match(/[\p{Script=Han}]+|[A-Za-z0-9_./:@#-]+/gu) ?? []).length;
}

export function renderBoundedHandoff(task, canonical) {
  const worker = requireNonEmptyString(task.worker, "worker");
  const base = requireNonEmptyString(task.base, "base");
  const projectContract = requireNonEmptyString(canonical.projectContract, "canonical.projectContract");
  const architecture = requireNonEmptyString(canonical.architecture, "canonical.architecture");
  const read = normalizeList(task.read, "read");
  const currentTask = normalizeList(task.task, "task");
  const context = normalizeList(task.context, "context");
  const acceptance = normalizeList(task.acceptance, "acceptance");
  const forbid = normalizeList(task.forbid, "forbid");
  const report = normalizeList(task.report, "report");

  if (currentTask.length === 0) throw new TypeError("task must contain at least one item");

  const reads = [...new Set([projectContract, architecture, ...read])];
  return [
    `You are the ${worker} worker.`,
    `\nBase: ${base}\n`,
    listSection("Read first", reads),
    listSection("Goal", currentTask),
    listSection("Task-local context", context),
    listSection("Acceptance", acceptance),
    listSection("Do not", forbid),
    listSection("Report", report),
  ]
    .join("")
    .trim();
}

export function checkBoundedPrompt(prompt, budget) {
  const text = String(prompt);
  if (!Number.isInteger(budget) || budget <= 0) {
    throw new TypeError("budget must be a positive integer");
  }

  const issues = [];
  const wordLikeCount = countWordLike(text);
  if (wordLikeCount > budget) {
    issues.push(`prompt exceeds budget: ${wordLikeCount} > ${budget} word-like segments`);
  }

  const fullShas = text.match(/\b[a-f0-9]{40}\b/gi) ?? [];
  if (fullShas.length > 1) {
    issues.push(`prompt contains ${fullShas.length} full commit SHAs; possible history replay`);
  }

  const taskHistoryRows = text.match(/Task\s*\d+\s*(?:->|→|:)\s*[^\n]*\b[a-f0-9]{7,40}\b/gi) ?? [];
  if (taskHistoryRows.length > 1) {
    issues.push("prompt contains a repeated Task-to-commit history table");
  }

  if (/\b(?:GitHub\s+)?Actions?\s+run\s*#?\d+\b/i.test(text)) {
    issues.push("prompt contains a historical Actions run identifier");
  }

  return { ok: issues.length === 0, issues, wordLikeCount };
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

function usage() {
  console.error("usage: node scripts/bounded-agent-handoff.mjs render <task.json> | check <prompt.txt> <bugfix|feature>");
  process.exit(2);
}

async function main(argv) {
  const [command, path, kind] = argv;
  const state = readJson("docs/agent/project-state.json");

  if (command === "render" && path && !kind) {
    const task = readJson(path);
    const prompt = renderBoundedHandoff(task, {
      projectContract: state.paths.projectContract,
      architecture: state.paths.architecture,
    });
    const budgetKind = task.kind ?? "bugfix";
    const budget = state.promptBudgetWords[budgetKind];
    if (!budget) throw new Error(`unknown prompt budget kind: ${budgetKind}`);
    const result = checkBoundedPrompt(prompt, budget);
    if (!result.ok) {
      for (const issue of result.issues) console.error(`handoff: ${issue}`);
      process.exit(1);
    }
    process.stdout.write(`${prompt}\n`);
    return;
  }

  if (command === "check" && path && (kind === "bugfix" || kind === "feature")) {
    const prompt = readFileSync(resolve(process.cwd(), path), "utf8");
    const result = checkBoundedPrompt(prompt, state.promptBudgetWords[kind]);
    if (!result.ok) {
      for (const issue of result.issues) console.error(`handoff: ${issue}`);
      process.exit(1);
    }
    console.log(`handoff: OK (${result.wordLikeCount} word-like segments)`);
    return;
  }

  usage();
}

const isEntryPoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`handoff: ${error.message}`);
    process.exit(1);
  });
}
