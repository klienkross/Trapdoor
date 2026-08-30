import type { Detection, NoteContext } from "../../domain/types";
import { collectTriggerTerms, makeDetection } from "./shared";

const STRONG_DEFINITION_TERMS = ["指的是", "定义为", "本质上", "可以理解为", "意味着"] as const;
const CLAUSE_BOUNDARY = /[。！？!?；;，,\n]/;
const RHETORICAL_CONTRAST = /(?:(?:不再)?只是|不是)[^。！？!?；;\n]*而是/u;

function hasCopularIs(text: string): boolean {
  for (let index = text.indexOf("是"); index >= 0; index = text.indexOf("是", index + 1)) {
    if (text[index + 1] === "否") continue;

    const before = text.slice(0, index).split(CLAUSE_BOUNDARY).at(-1)?.trim() ?? "";
    const after = text.slice(index + 1).split(CLAUSE_BOUNDARY)[0]?.trim() ?? "";
    const clause = `${before}是${after}`;

    if (before.length < 2 || after.length === 0) continue;
    if (before.endsWith("总") || before.endsWith("还")) continue;
    if (RHETORICAL_CONTRAST.test(clause)) continue;

    return true;
  }

  return false;
}

export function detectDefinitionBoundary(source: NoteContext): Detection | undefined {
  const triggerTerms = collectTriggerTerms(source.text, STRONG_DEFINITION_TERMS);

  if (triggerTerms.length === 0 && hasCopularIs(source.text)) {
    triggerTerms.push("是");
  }

  if (triggerTerms.length === 0) return undefined;

  const confidence = triggerTerms.some((term) => term !== "是") ? 0.85 : 0.75;
  return makeDetection("definition_boundary", confidence, source, triggerTerms);
}
