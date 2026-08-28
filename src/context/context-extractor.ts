import type { NoteContext } from "../domain/types";

type Heading = {
  level: number;
  text: string;
  from: number;
};

const ATX_HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*$/;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/;

function findHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  let activeFence: { marker: "`" | "~"; length: number } | null = null;

  for (const lineMatch of markdown.matchAll(/^.*$/gm)) {
    const line = lineMatch[0];
    const from = lineMatch.index;
    const fenceMatch = line.match(FENCE);

    if (activeFence) {
      if (fenceMatch) {
        const fence = fenceMatch[1];
        const rest = fenceMatch[2];
        if (
          fence[0] === activeFence.marker &&
          fence.length >= activeFence.length &&
          rest.trim().length === 0
        ) {
          activeFence = null;
        }
      }
      continue;
    }

    if (fenceMatch) {
      const fence = fenceMatch[1];
      activeFence = {
        marker: fence[0] as "`" | "~",
        length: fence.length,
      };
      continue;
    }

    const match = line.match(ATX_HEADING);
    if (!match) {
      continue;
    }

    const marker = match[1];
    const rawText = match[2];

    headings.push({
      level: marker.length,
      text: rawText.replace(/[ \t]+#+[ \t]*$/, "").trim(),
      from,
    });
  }

  return headings;
}

export function extractSection(
  markdown: string,
  cursorOffset: number,
  notePath: string,
): NoteContext {
  const headings = findHeadings(markdown);
  const cursor = Math.min(Math.max(cursorOffset, 0), markdown.length);

  let currentHeadingIndex = -1;
  for (let index = 0; index < headings.length; index += 1) {
    if (headings[index].from > cursor) {
      break;
    }
    currentHeadingIndex = index;
  }

  if (currentHeadingIndex === -1) {
    const to = headings[0]?.from ?? markdown.length;
    return {
      notePath,
      heading: null,
      from: 0,
      to,
      text: markdown.slice(0, to),
      scope: "section",
    };
  }

  const currentHeading = headings[currentHeadingIndex];
  let to = markdown.length;

  for (let index = currentHeadingIndex + 1; index < headings.length; index += 1) {
    if (headings[index].level <= currentHeading.level) {
      to = headings[index].from;
      break;
    }
  }

  return {
    notePath,
    heading: currentHeading.text,
    from: currentHeading.from,
    to,
    text: markdown.slice(currentHeading.from, to),
    scope: "section",
  };
}

export function extractWholeNote(markdown: string, notePath: string): NoteContext {
  return {
    notePath,
    heading: null,
    from: 0,
    to: markdown.length,
    text: markdown,
    scope: "note",
  };
}
