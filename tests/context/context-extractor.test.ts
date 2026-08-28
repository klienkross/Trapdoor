import { describe, expect, it } from "vitest";
import { extractSection, extractWholeNote } from "../../src/context/context-extractor";

describe("extractSection", () => {
  it("extracts the cursor's heading section through nested headings until the next same-or-higher heading", () => {
    const markdown = [
      "# Note",
      "intro",
      "## Alpha",
      "alpha body",
      "### Detail",
      "detail body",
      "## Beta",
      "beta body",
    ].join("\n");
    const cursorOffset = markdown.indexOf("detail body");

    const context = extractSection(markdown, cursorOffset, "notes/example.md");
    const expectedText = ["## Alpha", "alpha body", "### Detail", "detail body"].join("\n");

    expect(context).toEqual({
      notePath: "notes/example.md",
      heading: "Alpha",
      from: markdown.indexOf("## Alpha"),
      to: markdown.indexOf("## Beta"),
      text: expectedText,
      scope: "section",
    });
  });

  it("uses the preamble before the first heading when the cursor is there", () => {
    const markdown = ["preamble line", "another line", "# First", "body"].join("\n");

    const context = extractSection(markdown, markdown.indexOf("another"), "note.md");

    expect(context).toEqual({
      notePath: "note.md",
      heading: null,
      from: 0,
      to: markdown.indexOf("# First"),
      text: "preamble line\nanother line\n",
      scope: "section",
    });
  });
});

describe("extractWholeNote", () => {
  it("returns whole-note fallback data with absolute document offsets", () => {
    const markdown = "# Note\nbody\n";

    expect(extractWholeNote(markdown, "notes/example.md")).toEqual({
      notePath: "notes/example.md",
      heading: null,
      from: 0,
      to: markdown.length,
      text: markdown,
      scope: "note",
    });
  });
});
