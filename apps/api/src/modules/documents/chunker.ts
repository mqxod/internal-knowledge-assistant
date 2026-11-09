/**
 * Heading-aware document splitter.
 *
 * Markdown: ATX (`## Title`) and setext (`Title\n====`) headings start sections; headings inside
 * fenced code blocks are ignored. Each section keeps its heading path so citations can show where
 * it lives (e.g. "Leave › Annual Leave"). Headings without body text are not indexed but still
 * become parents of the sections below them.
 *
 * Plain text: lines that look like headings (ALL CAPS, "Title:", numbered "1. Title", or underlined)
 * are treated as section boundaries; otherwise the text is chunked by paragraph.
 *
 * Oversized sections are split on paragraph, then sentence, then whitespace boundaries, so we never
 * cut a word in half and only cut sentences when a single sentence exceeds the limit.
 */

export interface ChunkerOptions {
  maxChunkChars: number;
  maxSections: number;
}

export interface ParsedSection {
  sectionTitle: string;
  parentHeading: string | null;
  headingPath: string[];
  content: string;
}

export interface ParsedDocument {
  /** Title detected from the content (first H1 / leading title line), if any. */
  detectedTitle: string | null;
  sections: ParsedSection[];
}

export class TooManySectionsError extends Error {
  constructor(public readonly count: number) {
    super(`Document produced ${count} sections`);
  }
}

interface RawSection {
  title: string | null;
  path: string[];
  parent: string | null;
  lines: string[];
}

const ATX_HEADING = /^\s{0,3}(#{1,6})[ \t]+(.+?)[ \t]*(?:#+[ \t]*)?$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const SETEXT_H1 = /^\s{0,3}=+\s*$/;
const SETEXT_H2 = /^\s{0,3}-+\s*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;
const HAS_WORD = /[\p{L}\p{N}]/u;

export function normalizeText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/** Strips inline Markdown so titles read cleanly in citations. */
export function cleanInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function tidy(content: string): string {
  return content.replace(/\n{3,}/g, "\n\n").trim();
}

function buildSections(raw: RawSection[], fallbackTitle: string, opts: ChunkerOptions): ParsedSection[] {
  const out: ParsedSection[] = [];
  for (const r of raw) {
    const content = tidy(r.lines.join("\n"));
    if (!HAS_WORD.test(content)) continue; // never index empty sections
    const title = r.title ?? (out.length === 0 ? "Overview" : fallbackTitle);
    const parts = splitContent(content, opts.maxChunkChars);
    parts.forEach((part, i) => {
      out.push({
        sectionTitle: parts.length > 1 ? `${title} (part ${i + 1} of ${parts.length})` : title,
        parentHeading: r.parent,
        headingPath: r.path.length ? r.path : [title],
        content: part,
      });
      if (out.length > opts.maxSections) throw new TooManySectionsError(out.length);
    });
  }
  return out;
}

export function parseMarkdown(text: string, fallbackTitle: string, opts: ChunkerOptions): ParsedDocument {
  const lines = normalizeText(text).split("\n");
  const stack: { level: number; title: string }[] = [];
  const raw: RawSection[] = [];
  let current: RawSection = { title: null, path: [], parent: null, lines: [] };
  let detectedTitle: string | null = null;
  let fence: string | null = null;

  const startSection = (level: number, title: string) => {
    raw.push(current);
    if (level === 1 && detectedTitle === null) detectedTitle = title;
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    const parent = stack.length ? stack[stack.length - 1]!.title : null;
    stack.push({ level, title });
    current = { title, path: stack.map((s) => s.title), parent, lines: [] };
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      current.lines.push(line);
      continue;
    }
    if (fence === null) {
      const atx = ATX_HEADING.exec(line);
      if (atx) {
        const title = cleanInline(atx[2]!);
        if (title) {
          startSection(atx[1]!.length, title);
          continue;
        }
      }
      const next = lines[i + 1];
      const prevBlank = i === 0 || lines[i - 1]!.trim() === "";
      if (
        next !== undefined &&
        line.trim() &&
        prevBlank &&
        !LIST_ITEM.test(line) &&
        (SETEXT_H1.test(next) || SETEXT_H2.test(next))
      ) {
        const title = cleanInline(line);
        if (title) {
          startSection(SETEXT_H1.test(next) ? 1 : 2, title);
          i++; // consume the underline
          continue;
        }
      }
    }
    current.lines.push(line);
  }
  raw.push(current);
  return { detectedTitle, sections: buildSections(raw, detectedTitle ?? fallbackTitle, opts) };
}

/**
 * "strong" headings (ALL CAPS, "Title:") may be directly followed by body lines;
 * "weak" headings (numbered like "2. Scope") only count when they stand alone on a line.
 */
function textHeadingKind(line: string): "strong" | "weak" | null {
  const t = line.trim();
  if (t.length < 2 || t.length > 80 || !/\p{L}/u.test(t)) return null;
  if (/[.!?,;]$/.test(t)) return null;
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 3 && letters === letters.toUpperCase()) return "strong";
  if (t.endsWith(":") && t.split(/\s+/).length <= 8) return "strong";
  if (/^(\d+(\.\d+)*[.)]?|[IVX]+\.)\s+\p{Lu}/u.test(t) && t.split(/\s+/).length <= 10) return "weak";
  return null;
}

export function parsePlainText(text: string, fallbackTitle: string, opts: ChunkerOptions): ParsedDocument {
  const blocks = normalizeText(text).split(/\n\s*\n/);
  const raw: RawSection[] = [];
  let current: RawSection = { title: null, path: [], parent: null, lines: [] };
  let detectedTitle: string | null = null;

  blocks.forEach((block, idx) => {
    const blockLines = block.split("\n");
    const first = blockLines[0] ?? "";
    const underlined =
      blockLines.length >= 2 && (SETEXT_H1.test(blockLines[1]!) || SETEXT_H2.test(blockLines[1]!));
    const kind = textHeadingKind(first);
    const singleLineHeading = kind !== null && (blockLines.length === 1 || kind === "strong");
    // A short leading line without punctuation is treated as the document title.
    const leadingTitle =
      idx === 0 && blockLines.length === 1 && first.length <= 100 && !/[.!?]$/.test(first.trim());

    if (underlined || singleLineHeading || leadingTitle) {
      const title = cleanInline(first.replace(/:$/, ""));
      if (idx === 0 && detectedTitle === null) detectedTitle = title;
      raw.push(current);
      current = { title, path: [title], parent: null, lines: [] };
      const rest = blockLines.slice(underlined ? 2 : 1).join("\n");
      if (rest.trim()) current.lines.push(rest, "");
      return;
    }
    current.lines.push(block, "");
  });
  raw.push(current);
  return { detectedTitle, sections: buildSections(raw, detectedTitle ?? fallbackTitle, opts) };
}

interface Piece {
  text: string;
  /** Separator to use before this piece when packing (paragraph vs. in-paragraph). */
  sep: string;
}

/** Splits content into blank-line separated blocks, keeping fenced code blocks intact. */
function splitBlocks(content: string): string[] {
  const blocks: string[] = [];
  let buf: string[] = [];
  let fence: string | null = null;
  for (const line of content.split("\n")) {
    const f = FENCE.exec(line);
    if (f) {
      const marker = f[1]!;
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    }
    if (fence === null && line.trim() === "" && !f) {
      if (buf.length) blocks.push(buf.join("\n"));
      buf = [];
    } else {
      buf.push(line);
    }
  }
  if (buf.length) blocks.push(buf.join("\n"));
  return blocks;
}

function hardWrap(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function splitOversizedBlock(block: string, max: number): string[] {
  const isFence = FENCE.test(block.split("\n")[0] ?? "");
  const units = isFence ? block.split("\n") : block.split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}"'(\[])/u);
  const joiner = isFence ? "\n" : " ";
  const out: string[] = [];
  let buf = "";
  for (const unit of units.flatMap((u) => (u.length > max ? hardWrap(u, max) : [u]))) {
    if (buf && buf.length + joiner.length + unit.length > max) {
      out.push(buf);
      buf = unit;
    } else {
      buf = buf ? buf + joiner + unit : unit;
    }
  }
  if (buf) out.push(buf);
  return out;
}

export function splitContent(content: string, max: number): string[] {
  if (content.length <= max) return [content];
  const pieces: Piece[] = [];
  for (const block of splitBlocks(content)) {
    if (block.length <= max) pieces.push({ text: block, sep: "\n\n" });
    else splitOversizedBlock(block, max).forEach((t, i) => pieces.push({ text: t, sep: i === 0 ? "\n\n" : " " }));
  }
  const chunks: string[] = [];
  let buf = "";
  for (const p of pieces) {
    if (buf && buf.length + p.sep.length + p.text.length > max) {
      chunks.push(buf.trim());
      buf = p.text;
    } else {
      buf = buf ? buf + p.sep + p.text : p.text;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

export function parseDocument(
  text: string,
  contentType: "markdown" | "text",
  fallbackTitle: string,
  opts: ChunkerOptions,
): ParsedDocument {
  return contentType === "markdown"
    ? parseMarkdown(text, fallbackTitle, opts)
    : parsePlainText(text, fallbackTitle, opts);
}
