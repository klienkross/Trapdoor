import type { NoteContext } from "../domain/types";

type Heading = {
  level: number;
  text: string;
  from: number;
};

const ATX_HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*$/gm;

function findHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];

  for (const match of markdown.matchAll(ATX_HEADING)) {
    const marker = match[1];
    const rawText = match[2];
    const from = match.index;

    if (!marker || rawText === undefined || from === undefined) {
      continue;
    }

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
