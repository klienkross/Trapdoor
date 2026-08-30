function maskRange(characters: string[], from: number, to: number): void {
  for (let index = from; index < to; index += 1) {
    if (characters[index] !== "\n" && characters[index] !== "\r") {
      characters[index] = " ";
    }
  }
}

function maskLeadingYamlFrontmatter(characters: string[]): void {
  const text = characters.join("");
  const opening = text.match(/^---[ \t]*(?:\r?\n|$)/u);
  if (!opening || opening[0].length === text.length) return;

  let lineStart = opening[0].length;

  while (lineStart <= text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    const line = text.slice(lineStart, lineEnd).replace(/\r$/u, "");

    if (/^---[ \t]*$/u.test(line)) {
      maskRange(characters, 0, lineEnd);
      return;
    }

    if (newline === -1) return;
    lineStart = newline + 1;
  }
}

function maskFencedCode(characters: string[]): void {
  const text = characters.join("");
  let lineStart = 0;
  let fenceChar: "`" | "~" | undefined;
  let fenceLength = 0;

  while (lineStart < text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    const line = text.slice(lineStart, lineEnd);
    const match = line.match(/^\s{0,3}(`{3,}|~{3,})/u);

    if (fenceChar) {
      maskRange(characters, lineStart, lineEnd);
      if (match && match[1][0] === fenceChar && match[1].length >= fenceLength) {
        fenceChar = undefined;
        fenceLength = 0;
      }
    } else if (match) {
      fenceChar = match[1][0] as "`" | "~";
      fenceLength = match[1].length;
      maskRange(characters, lineStart, lineEnd);
    }

    if (newline === -1) break;
    lineStart = newline + 1;
  }
}

function maskQuestionSentences(characters: string[]): void {
  const text = characters.join("");
  let sentenceStart = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "?" || char === "？") {
      maskRange(characters, sentenceStart, index + 1);
      sentenceStart = index + 1;
      continue;
    }

    if (char === "。" || char === "！" || char === "!" || char === "；" || char === ";" || char === "\n") {
      sentenceStart = index + 1;
      continue;
    }

    if (char === "…" && text[index + 1] === "…") {
      while (text[index + 1] === "…") index += 1;
      sentenceStart = index + 1;
      continue;
    }

    if (text.startsWith("...", index)) {
      index += 2;
      sentenceStart = index + 1;
    }
  }
}

/**
 * Builds an offset-preserving detector view of Markdown prose.
 *
 * Text that should never become a challenge target is replaced with spaces,
 * while newlines and total UTF-16 string length are preserved. Projection
 * indices therefore stay identical to the original Markdown indices.
 *
 * Prefer missing a challenge over manufacturing one from Markdown structure,
 * fenced code, or a question fragment.
 */
export function projectChallengeableProse(text: string): string {
  const characters = text.split("");
  maskLeadingYamlFrontmatter(characters);
  maskFencedCode(characters);
  maskQuestionSentences(characters);
  return characters.join("");
}
