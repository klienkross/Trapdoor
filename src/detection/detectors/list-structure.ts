import type { Detection, NoteContext } from "../../domain/types";
import { makeDetection } from "./shared";

const LIST_ITEM_RE = /^(\s*)([-+*]|\d+[.)])\s+(.+)$/;

export function detectListStructure(source: NoteContext): Detection | undefined {
  const items = source.text
    .split("\n")
    .map((line) => line.match(LIST_ITEM_RE))
    .filter((match): match is RegExpMatchArray => match !== null);

  if (items.length < 2) return undefined;

  const triggerTerms = [...new Set(items.map((match) => match[2]))];
  const targets = items.map((match) => match[3].trim()).filter((item) => item.length > 0);
  const confidence = items.length >= 3 ? 0.9 : 0.8;

  return makeDetection("list_structure", confidence, source, triggerTerms, targets);
}
