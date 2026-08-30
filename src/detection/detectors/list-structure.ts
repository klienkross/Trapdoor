import type { Detection, NoteContext } from "../../domain/types";
import { makeDetection } from "./shared";

const LIST_ITEM_RE = /^(\s*)([-+*]|\d+[.)])\s+(.+)$/;

type ListItem = RegExpMatchArray;

function firstViableListBlock(text: string): ListItem[] {
  let current: ListItem[] = [];

  for (const line of text.split("\n")) {
    const match = line.match(LIST_ITEM_RE);

    if (match) {
      current.push(match);
      continue;
    }

    if (current.length >= 2) return current;
    current = [];
  }

  return current.length >= 2 ? current : [];
}

export function detectListStructure(source: NoteContext): Detection | undefined {
  const items = firstViableListBlock(source.text);
  if (items.length < 2) return undefined;

  const triggerTerms = [...new Set(items.map((match) => match[2]))];
  const targets = items.map((match) => match[3].trim()).filter((item) => item.length > 0);
  const confidence = items.length >= 3 ? 0.9 : 0.8;

  return makeDetection("list_structure", confidence, source, triggerTerms, targets);
}
